"use strict";
/* Inventário por comissão, painel de engenharia clínica e descrição por IA. */
const express = require("express");
const { q, one, tx } = require("../db");
const { audit } = require("../audit");
const auth = require("../auth");
const R = require("../../public/js/regras");
const { a, fail, str, int, oneOf, dbr, hojeISO, uuidOk } = require("../util");

const r = express.Router();
r.use(auth.requireAuth, auth.requireTenant);

async function getInv(tenantId, id) {
  const inv = await one(`SELECT i.*, u.nome AS unidade, us.nome AS aberto_por_nome FROM inventarios i
    JOIN unidades u ON u.id=i.unidade_id LEFT JOIN users us ON us.id=i.aberto_por WHERE i.id=$1 AND i.tenant_id=$2`, [int(id), tenantId]);
  if (!inv) fail(404, "Inventário não encontrado.");
  return inv;
}
function readComissao(list) {
  const c = (Array.isArray(list) ? list : []).map(m => ({ nome: str(m.nome, 200), cargo: str(m.cargo, 120), matricula: str(m.matricula, 40), funcao: str(m.funcao, 40) || "Membro" }))
    .filter(m => m.nome).slice(0, 15);
  if (!c.length) fail(400, "Informe ao menos um membro da comissão de inventário.");
  return c;
}

/* ---------------- Inventário ---------------- */
r.get("/inventarios", a(async (req, res) => {
  res.json((await q(`SELECT i.id,i.ano,i.tipo,i.portaria,i.status,i.aberto_em,i.encerrado_em,u.nome AS unidade,i.unidade_id,
      (SELECT count(*) FROM inventario_itens x WHERE x.inventario_id=i.id) AS conferidos,
      (SELECT count(*) FROM bens b WHERE b.unidade_id=i.unidade_id AND b.situacao<>'Baixado') AS total
    FROM inventarios i JOIN unidades u ON u.id=i.unidade_id WHERE i.tenant_id=$1 ORDER BY i.aberto_em DESC`, [req.tenant.id])).rows);
}));

r.post("/inventarios", auth.requirePerm("inv.manage"), a(async (req, res) => {
  const unidade = await one(`SELECT id FROM unidades WHERE id=$1 AND tenant_id=$2`, [int(req.body.unidade_id), req.tenant.id]);
  if (!unidade) fail(400, "Selecione a unidade a inventariar.");
  if (await one(`SELECT 1 FROM inventarios WHERE unidade_id=$1 AND status='aberto'`, [unidade.id])) fail(409, "Já existe um inventário aberto para esta unidade. Encerre-o antes de abrir outro.");
  const ano = int(req.body.ano) || new Date().getFullYear();
  const inv = await one(`INSERT INTO inventarios (tenant_id,unidade_id,ano,tipo,portaria,comissao,aberto_por) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.tenant.id, unidade.id, ano, oneOf(req.body.tipo || "Anual", R.TIPOS_INV, "Tipo de inventário"), str(req.body.portaria, 200), JSON.stringify(readComissao(req.body.comissao)), req.user.id]);
  await audit(req, "abrir", "inventario", inv.id, null, inv);
  res.status(201).json(inv);
}));

r.get("/inventarios/:id", a(async (req, res) => {
  const inv = await getInv(req.tenant.id, req.params.id);
  const itens = (await q(`SELECT x.bem_id, x.status, x.conservacao, x.observacao, x.em, x.setor_id, s.nome AS setor_encontrado, u.nome AS por
    FROM inventario_itens x LEFT JOIN setores s ON s.id=x.setor_id LEFT JOIN users u ON u.id=x.user_id WHERE x.inventario_id=$1`, [inv.id])).rows;
  res.json({ ...inv, itens });
}));

r.post("/inventarios/:id/conferir", auth.requirePerm("inv.conferir"), a(async (req, res) => {
  const inv = await getInv(req.tenant.id, req.params.id);
  if (inv.status !== "aberto") fail(400, "Este inventário já foi encerrado.");
  let bem;
  if (uuidOk(req.body.bem_id)) bem = await one(`SELECT b.*, s.nome AS setor FROM bens b LEFT JOIN setores s ON s.id=b.setor_id WHERE b.id=$1 AND b.tenant_id=$2`, [req.body.bem_id, req.tenant.id]);
  else if (int(req.body.numero)) bem = await one(`SELECT b.*, s.nome AS setor FROM bens b LEFT JOIN setores s ON s.id=b.setor_id WHERE b.numero=$1 AND b.tenant_id=$2`, [int(req.body.numero), req.tenant.id]);
  if (!bem) fail(404, "Nenhum bem com esse número nesta entidade. Bem sem plaqueta encontrado? Cadastre como “Incorporação por inventário”.");
  if (bem.situacao === "Baixado") fail(400, `O bem nº ${bem.numero} consta como baixado. Registre a ocorrência nas observações do inventário.`);
  if (bem.unidade_id !== inv.unidade_id) fail(400, `O bem nº ${bem.numero} pertence a outra unidade (${bem.setor || "—"}). Registre a divergência ou transfira o bem.`);
  const setorId = int(req.body.setor_id) || bem.setor_id;
  if (setorId !== bem.setor_id && !await one(`SELECT 1 FROM setores WHERE id=$1 AND unidade_id=$2`, [setorId, inv.unidade_id])) fail(400, "Setor informado inválido.");
  const conservacao = oneOf(req.body.conservacao || bem.conservacao, R.CONSERV, "Conservação");
  const status = setorId !== bem.setor_id ? "divergente" : "localizado";
  const obs = str(req.body.observacao, 500);
  const out = await tx(async c => {
    const it = (await c.query(`INSERT INTO inventario_itens (inventario_id,bem_id,status,setor_id,conservacao,observacao,user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (inventario_id,bem_id) DO UPDATE SET status=EXCLUDED.status, setor_id=EXCLUDED.setor_id, conservacao=EXCLUDED.conservacao, observacao=EXCLUDED.observacao, user_id=EXCLUDED.user_id, em=now()
      RETURNING *`, [inv.id, bem.id, status, setorId, conservacao, obs, req.user.id])).rows[0];
    await c.query(`UPDATE bens SET ult_conferencia=$2, conservacao=$3, atualizado_em=now() WHERE id=$1`, [bem.id, hojeISO(), conservacao]);
    const sn = status === "divergente" ? (await c.query(`SELECT nome FROM setores WHERE id=$1`, [setorId])).rows[0]?.nome : null;
    await c.query(`INSERT INTO eventos (tenant_id,bem_id,tipo,texto,dados,user_id) VALUES ($1,$2,'Inventário',$3,$4,$5)`,
      [req.tenant.id, bem.id, `Inventário ${inv.tipo.toLowerCase()} ${inv.ano}: ${status === "divergente" ? `encontrado em ${sn}, cadastrado em ${bem.setor}` : `localizado em ${bem.setor}`}${conservacao !== bem.conservacao ? `; conservação ${bem.conservacao} → ${conservacao}` : ""}${obs ? "; " + obs : ""}`,
       JSON.stringify({ inventario: inv.id }), req.user.id]);
    await audit(req, "conferir", "inventario", inv.id, null, it, c);
    return it;
  });
  res.json({ ...out, numero: bem.numero, descricao: bem.descricao });
}));

r.delete("/inventarios/:id/itens/:bemId", auth.requirePerm("inv.conferir"), a(async (req, res) => {
  const inv = await getInv(req.tenant.id, req.params.id);
  if (inv.status !== "aberto") fail(400, "Este inventário já foi encerrado.");
  if (!uuidOk(req.params.bemId)) fail(404, "Item não encontrado.");
  const it = await one(`DELETE FROM inventario_itens WHERE inventario_id=$1 AND bem_id=$2 RETURNING *`, [inv.id, req.params.bemId]);
  if (!it) fail(404, "Item não encontrado.");
  await audit(req, "desfazer_conferencia", "inventario", inv.id, it, null);
  res.json({ ok: true });
}));

r.post("/inventarios/:id/encerrar", auth.requirePerm("inv.manage"), a(async (req, res) => {
  const inv = await getInv(req.tenant.id, req.params.id);
  if (inv.status !== "aberto") fail(400, "Este inventário já foi encerrado.");
  const out = await one(`UPDATE inventarios SET status='encerrado', encerrado_em=now(), observacoes=$2 WHERE id=$1 RETURNING *`, [inv.id, str(req.body.observacoes, 4000)]);
  await audit(req, "encerrar", "inventario", inv.id, inv, out);
  res.json(out);
}));

/* ---------------- Engenharia clínica ---------------- */
r.get("/engenharia", a(async (req, res) => {
  const t = req.tenant.id;
  const bens = (await q(`SELECT b.*, s.nome AS setor, un.nome AS unidade FROM bens b LEFT JOIN setores s ON s.id=b.setor_id LEFT JOIN unidades un ON un.id=b.unidade_id
    WHERE b.tenant_id=$1 AND b.classe='med' AND b.situacao<>'Baixado' ORDER BY b.numero`, [t])).rows;
  const custos = (await q(`SELECT bem_id, sum(custo) AS custo, count(*) FILTER (WHERE tipo='Corretiva') AS corretivas
    FROM manutencoes WHERE tenant_id=$1 AND abertura >= (current_date - interval '12 months') GROUP BY bem_id`, [t])).rows;
  const abertas = (await q(`SELECT m.*, b.numero, b.descricao AS bem_descricao, s.nome AS setor FROM manutencoes m JOIN bens b ON b.id=m.bem_id LEFT JOIN setores s ON s.id=b.setor_id
    WHERE m.tenant_id=$1 AND m.conclusao IS NULL ORDER BY m.abertura`, [t])).rows;
  const mttr = await one(`SELECT avg(conclusao - abertura)::float AS dias, count(*) AS n FROM manutencoes
    WHERE tenant_id=$1 AND tipo='Corretiva' AND conclusao IS NOT NULL AND conclusao >= (current_date - interval '12 months')`, [t]);
  const custo12 = await one(`SELECT coalesce(sum(custo),0) AS total FROM manutencoes WHERE tenant_id=$1 AND abertura >= (current_date - interval '12 months')`, [t]);
  const limite = Number(req.tenant.config?.limite_antieconomico || 50);
  const cmap = Object.fromEntries(custos.map(c => [c.bem_id, c]));
  const antieconomicos = bens.map(b => ({ b, c: cmap[b.id] })).filter(x => x.c && b_valor(x.b) > 0 && x.c.custo / b_valor(x.b) * 100 >= limite)
    .map(x => ({ id: x.b.id, numero: x.b.numero, descricao: x.b.descricao, setor: x.b.setor, valor: b_valor(x.b), custo12: x.c.custo, pct: Math.round(x.c.custo / b_valor(x.b) * 100), corretivas: x.c.corretivas }));
  // Agenda dos próximos 12 meses
  const hoje = new Date(); const agenda = [];
  for (const b of bens) {
    for (const [tipo, per, ult] of [["Preventiva", b.per_preventiva, b.ult_preventiva], ["Calibração", b.per_calibracao, b.ult_calibracao]]) {
      if (!per) continue;
      let prox = ult ? R.addMonths(ult, per) : null;
      if (!prox) { agenda.push({ id: b.id, numero: b.numero, descricao: b.descricao, setor: b.setor, tipo, data: null, vencido: true, semRegistro: true }); continue; }
      let guard = 0;
      while (prox && guard++ < 60) {
        const vencido = prox < hoje;
        if (prox > new Date(hoje.getFullYear() + 1, hoje.getMonth(), hoje.getDate())) break;
        agenda.push({ id: b.id, numero: b.numero, descricao: b.descricao, setor: b.setor, tipo, data: R.iso(prox), vencido });
        if (vencido) break;           // um vencido basta: os seguintes dependem da execução
        prox = R.addMonths(R.iso(prox), per);
      }
    }
  }
  agenda.sort((x, y) => (x.data || "0000") < (y.data || "0000") ? -1 : 1);
  const comPlano = bens.filter(b => b.per_preventiva || b.per_calibracao);
  const emDia = comPlano.filter(b => !R.alertas(b).some(x => x.sev === "bad" || /sem registro/.test(x.t))).length;
  res.json({
    total: bens.length, comPlano: comPlano.length, emDia, emManutencao: bens.filter(b => b.situacao === "Em manutenção").length,
    disponibilidade: bens.length ? (bens.filter(b => b.situacao === "Em uso").length / bens.length) : null,
    mttr: mttr?.n ? mttr.dias : null, corretivas12: mttr?.n || 0, custo12: custo12.total, limite,
    abertas: abertas.map(m => ({ ...m, dias: Math.round((hoje - new Date(m.abertura + "T12:00:00")) / 86400000) })),
    antieconomicos, agenda,
    semRegistroAnvisa: bens.filter(b => !b.anvisa).map(b => ({ id: b.id, numero: b.numero, descricao: b.descricao, setor: b.setor })),
  });
}));
function b_valor(b) { const d = R.deprec(b); return d ? d.base : Number(b.valor) || 0; }

/* ---------------- Descrição por IA (opcional) ---------------- */
r.post("/ai/descrever", auth.requirePerm("bens.write"), a(async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY; if (!key) fail(400, "A descrição por IA não está configurada nesta instalação.");
  const img = String(req.body.imagem || "");
  if (img.length < 200 || img.length > 6_000_000) fail(400, "Envie uma foto válida.");
  const prompt = `Você é patrimonialista de um hospital público brasileiro. Analise a foto de um bem móvel permanente para o cadastro patrimonial.
Responda SOMENTE com um objeto JSON com as chaves:
"descricao": nome padronizado do bem (substantivo + qualificador, sem marca). Ex.: "Monitor multiparamétrico", "Cadeira de rodas adulto";
"especificacao": características visíveis que individualizam o bem (material, cor, componentes, dimensões aproximadas), até 200 caracteres, sem inventar dados;
"marca", "modelo", "serie": somente se legíveis na foto, senão "";
"classe": uma de "med" (equipamento médico-hospitalar), "maq" (máquinas e ferramentas), "info" (informática), "mov" (móveis e utensílios), "com" (comunicação, áudio e vídeo), "vei" (veículos), "out" (demais);
"conservacao": "Novo", "Bom", "Regular" ou "Ruim".`;
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.AI_MODEL || "claude-haiku-4-5-20251001", max_tokens: 600,
      messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img } }, { type: "text", text: prompt }] }] }),
  });
  if (!resp.ok) fail(502, "O serviço de IA não respondeu agora. Preencha manualmente ou tente de novo.");
  const data = await resp.json();
  const text = (data.content || []).map(c => c.text || "").join("");
  const m = text.match(/\{[\s\S]*\}/); if (!m) fail(502, "A IA não retornou uma sugestão válida.");
  let out; try { out = JSON.parse(m[0]); } catch (_) { fail(502, "A IA não retornou uma sugestão válida."); }
  await audit(req, "sugestao_ia", "bem", null, null, { descricao: out.descricao });
  res.json(out);
}));

module.exports = r;
