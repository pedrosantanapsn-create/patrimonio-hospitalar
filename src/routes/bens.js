"use strict";
/* Bens patrimoniais, fotos, histórico, transferências (guias), manutenções, baixa e reavaliação. */
const express = require("express");
const { q, one, tx, nextCounter } = require("../db");
const { audit } = require("../audit");
const auth = require("../auth");
const R = require("../../public/js/regras");
const { a, fail, str, num, int, date, oneOf, brl, dbr, hojeISO, uuidOk } = require("../util");

const r = express.Router();
r.use(auth.requireAuth, auth.requireTenant);

const BEM_SELECT = `
  SELECT b.*, s.nome AS setor, un.nome AS unidade,
         (SELECT f.id FROM fotos f WHERE f.bem_id=b.id ORDER BY f.ordem, f.criado_em LIMIT 1) AS foto
    FROM bens b
    LEFT JOIN setores s ON s.id=b.setor_id
    LEFT JOIN unidades un ON un.id=b.unidade_id`;

async function getBem(tenantId, id, client) {
  if (!uuidOk(id)) fail(404, "Bem não encontrado.");
  const runner = client || { query: q };
  const b = (await runner.query(`${BEM_SELECT} WHERE b.tenant_id=$1 AND b.id=$2`, [tenantId, id])).rows[0];
  if (!b) fail(404, "Bem não encontrado.");
  return b;
}
async function evento(c, req, bemId, tipo, texto, dados) {
  await c.query(`INSERT INTO eventos (tenant_id,bem_id,tipo,texto,dados,user_id) VALUES ($1,$2,$3,$4,$5,$6)`,
    [req.tenant.id, bemId, tipo, texto, dados ? JSON.stringify(dados) : null, req.user.id]);
}
async function checkSetor(tenantId, unidadeId, setorId) {
  const s = await one(`SELECT s.id, s.nome, u.nome AS unidade FROM setores s JOIN unidades u ON u.id=s.unidade_id
     WHERE s.id=$1 AND s.unidade_id=$2 AND s.tenant_id=$3`, [setorId, unidadeId, tenantId]);
  if (!s) fail(400, "Selecione uma unidade e um setor válidos.");
  return s;
}

/* Campos do cadastro */
const SAUDE = ["anvisa", "risco", "per_preventiva", "ult_preventiva", "per_calibracao", "ult_calibracao"];
function readBem(body) {
  const b = body || {};
  const classe = oneOf(b.classe || "out", Object.keys(R.CLASSES), "Classe");
  const c = R.CLASSES[classe];
  const out = {
    descricao: str(b.descricao, 160), especificacao: str(b.especificacao, 1500), marca: str(b.marca, 80), modelo: str(b.modelo, 80),
    serie: str(b.serie, 80), classe, vida_util: num(b.vida_util) ?? c.vida, residual: num(b.residual) ?? c.residual,
    incorporacao: oneOf(b.incorporacao || "Compra", R.INCORP, "Forma de incorporação"), documento: str(b.documento, 300),
    fornecedor: str(b.fornecedor, 300), data_aquisicao: date(b.data_aquisicao), valor: num(b.valor) ?? 0, garantia: date(b.garantia),
    local: str(b.local, 200), conservacao: oneOf(b.conservacao || "Bom", R.CONSERV, "Conservação"),
    situacao: oneOf(b.situacao || "Em uso", R.SITUACOES.filter(s => s !== "Baixado"), "Situação"),
    class_inservivel: null, obs: str(b.obs, 2000),
    anvisa: str(b.anvisa, 60), risco: oneOf(b.risco || "", R.RISCO, "Classe de risco") || null,
    per_preventiva: int(b.per_preventiva), ult_preventiva: date(b.ult_preventiva), per_calibracao: int(b.per_calibracao), ult_calibracao: date(b.ult_calibracao),
  };
  if (out.situacao === "Inservível") out.class_inservivel = oneOf(b.class_inservivel || "Ocioso", R.INSERV, "Classificação do inservível");
  if (!out.descricao) fail(400, "Informe a descrição padronizada do bem.");
  if (!out.data_aquisicao) fail(400, "Informe a data de aquisição ou de entrada.");
  if (out.valor < 0) fail(400, "O valor não pode ser negativo.");
  if (!R.isTerceiro(out) && !(out.valor > 0) && out.incorporacao !== "Incorporação por inventário")
    fail(400, "Informe o valor de aquisição. Para doação, use o valor justo apurado em avaliação.");
  if (out.vida_util <= 0 || out.vida_util > 100) fail(400, "Vida útil deve estar entre 1 e 100 anos.");
  if (out.residual < 0 || out.residual > 90) fail(400, "Valor residual deve estar entre 0% e 90%.");
  if (!c.saude) SAUDE.forEach(k => { out[k] = null; });
  return out;
}
async function checkSerie(tenantId, b, ignoreId) {
  if (!b.serie) return;
  const dup = await one(`SELECT numero FROM bens WHERE tenant_id=$1 AND lower(serie)=lower($2) AND lower(coalesce(marca,''))=lower(coalesce($3,'')) AND ($4::uuid IS NULL OR id<>$4)`,
    [tenantId, b.serie, b.marca, ignoreId || null]);
  if (dup) fail(409, `Já existe um bem com esse número de série e marca: nº ${dup.numero}.`);
}

/* ---------------- Consulta ---------------- */
r.get("/bens", a(async (req, res) => {
  const rows = (await q(`${BEM_SELECT} WHERE b.tenant_id=$1 ORDER BY b.numero`, [req.tenant.id])).rows;
  res.json(rows);
}));

r.get("/bens/numero/:numero", a(async (req, res) => {
  const b = await one(`SELECT id FROM bens WHERE tenant_id=$1 AND numero=$2`, [req.tenant.id, int(req.params.numero)]);
  if (!b) fail(404, "Nenhum bem com esse número de patrimônio nesta entidade.");
  res.json(b);
}));

r.get("/bens/:id", a(async (req, res) => {
  const b = await getBem(req.tenant.id, req.params.id);
  const [fotos, eventos, manut, reav] = await Promise.all([
    q(`SELECT id FROM fotos WHERE bem_id=$1 ORDER BY ordem, criado_em`, [b.id]),
    q(`SELECT e.tipo, e.texto, e.dados, e.em, u.nome AS por FROM eventos e LEFT JOIN users u ON u.id=e.user_id WHERE e.bem_id=$1 ORDER BY e.em DESC, e.id DESC LIMIT 300`, [b.id]),
    q(`SELECT m.*, u.nome AS por FROM manutencoes m LEFT JOIN users u ON u.id=m.user_id WHERE m.bem_id=$1 ORDER BY m.abertura DESC, m.id DESC`, [b.id]),
    q(`SELECT * FROM reavaliacoes WHERE bem_id=$1 ORDER BY data DESC, id DESC`, [b.id]),
  ]);
  res.json({ ...b, fotos: fotos.rows.map(f => f.id), eventos: eventos.rows, manutencoes: manut.rows, reavaliacoes: reav.rows });
}));

/* ---------------- Cadastro ---------------- */
r.post("/bens", auth.requirePerm("bens.write"), a(async (req, res) => {
  const d = readBem(req.body);
  const unidadeId = int(req.body.unidade_id), setorId = int(req.body.setor_id);
  const setor = await checkSetor(req.tenant.id, unidadeId, setorId);
  await checkSerie(req.tenant.id, d);
  const resp = str(req.body.responsavel, 200), respMat = str(req.body.responsavel_mat, 40);
  const bem = await tx(async c => {
    const numero = await nextCounter(c, req.tenant.id, "patrimonio");
    const cols = Object.keys(d);
    const vals = cols.map(k => d[k]);
    const row = (await c.query(
      `INSERT INTO bens (tenant_id, numero, unidade_id, setor_id, responsavel, responsavel_mat, criado_por, atualizado_por, ${cols.join(",")})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7, ${cols.map((_, i) => "$" + (i + 8)).join(",")}) RETURNING *`,
      [req.tenant.id, numero, unidadeId, setorId, resp, respMat, req.user.id, ...vals])).rows[0];
    await evento(c, req, row.id, "Incorporação", `${d.incorporacao} · ${d.documento || "sem documento informado"} · ${setor.unidade} / ${setor.nome}`, null);
    await audit(req, "criar", "bem", row.id, null, row, c);
    return row;
  });
  res.status(201).json(bem);
}));

r.put("/bens/:id", a(async (req, res) => {
  const canAll = auth.can(req.user, "bens.write"), canSaude = auth.can(req.user, "bens.saude");
  if (!canAll && !canSaude) fail(403, "Seu perfil não permite alterar bens.");
  const before = await getBem(req.tenant.id, req.params.id);
  if (before.situacao === "Baixado") fail(400, "Bem baixado não pode ser alterado. A ficha fica preservada para consulta.");
  let d;
  if (canAll) {
    d = readBem({ ...before, ...req.body });
    await checkSerie(req.tenant.id, d, before.id);
  } else {
    // Engenharia clínica: somente dados técnicos de equipamento de saúde
    if (!(R.CLASSES[before.classe] || {}).saude) fail(403, "Seu perfil só altera dados de equipamentos de saúde.");
    d = {};
    const tmp = readBem({ ...before, ...Object.fromEntries(SAUDE.map(k => [k, req.body[k] ?? before[k]])) });
    SAUDE.forEach(k => { d[k] = tmp[k]; });
  }
  for (const k of ["setor_id", "unidade_id", "responsavel"]) {
    if (req.body[k] !== undefined && String(req.body[k] ?? "") !== String(before[k] ?? ""))
      fail(400, "Mudança de setor, unidade ou responsável deve ser feita por transferência, que gera a guia.");
  }
  const cols = Object.keys(d);
  const changes = cols.filter(k => String(d[k] ?? "") !== String(before[k] ?? ""));
  if (!changes.length) return res.json(before);
  const bem = await tx(async c => {
    const row = (await c.query(`UPDATE bens SET ${cols.map((k, i) => `${k}=$${i + 3}`).join(",")}, atualizado_por=$2, atualizado_em=now()
      WHERE id=$1 RETURNING *`, [before.id, req.user.id, ...cols.map(k => d[k])])).rows[0];
    const rot = { descricao: "descrição", situacao: "situação", conservacao: "conservação", valor: "valor", classe: "classe", local: "localização", serie: "nº de série" };
    const txt = changes.map(k => rot[k] ? `${rot[k]}: ${before[k] ?? "—"} → ${d[k] ?? "—"}` : k.replace(/_/g, " ")).join("; ");
    await evento(c, req, before.id, "Alteração cadastral", txt, { campos: changes });
    await audit(req, "alterar", "bem", before.id, before, row, c);
    return row;
  });
  res.json(bem);
}));

r.delete("/bens/:id", auth.requirePerm("bens.delete"), a(async (req, res) => {
  const before = await getBem(req.tenant.id, req.params.id);
  const motivo = str(req.body?.motivo, 300);
  if (!motivo) fail(400, "Informe o motivo da exclusão (ex.: cadastro em duplicidade).");
  const usado = await one(`SELECT (SELECT count(*) FROM guias g WHERE g.tenant_id=$1 AND g.origem @> $2::jsonb) + (SELECT count(*) FROM reavaliacoes WHERE bem_id=$3) AS n`,
    [req.tenant.id, JSON.stringify([{ bem_id: before.id }]), before.id]);
  if (usado.n > 0) fail(400, "Este bem já tem transferências ou reavaliações registradas. Use a baixa patrimonial em vez da exclusão.");
  await tx(async c => {
    await audit(req, "excluir", "bem", before.id, before, { motivo }, c);
    await c.query(`DELETE FROM bens WHERE id=$1`, [before.id]);
  });
  res.json({ ok: true });
}));

/* ---------------- Fotos ---------------- */
const jpeg = b64 => {
  const buf = Buffer.from(String(b64 || ""), "base64");
  if (buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) fail(400, "Envie a foto em formato JPEG.");
  return buf;
};
r.post("/bens/:id/fotos", auth.requirePerm("bens.write"), a(async (req, res) => {
  const b = await getBem(req.tenant.id, req.params.id);
  const n = await one(`SELECT count(*) AS n FROM fotos WHERE bem_id=$1`, [b.id]);
  if (n.n >= 6) fail(400, "Cada bem pode ter até 6 fotos. Remova uma antes de adicionar outra.");
  const full = jpeg(req.body.full), thumb = jpeg(req.body.thumb);
  if (full.length > 3 * 1024 * 1024) fail(400, "Foto grande demais (máximo 3 MB depois de reduzida).");
  const f = await one(`INSERT INTO fotos (tenant_id,bem_id,dados,thumb,ordem) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [req.tenant.id, b.id, full, thumb, n.n]);
  await audit(req, "adicionar_foto", "bem", b.id, null, { foto: f.id, bytes: full.length });
  res.status(201).json(f);
}));
r.get("/fotos/:id", a(async (req, res) => {
  if (!uuidOk(req.params.id)) fail(404, "Foto não encontrada.");
  const col = req.query.t === "thumb" ? "thumb" : "dados";
  const f = await one(`SELECT ${col} AS img, mime FROM fotos WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.tenant.id]);
  if (!f) fail(404, "Foto não encontrada.");
  res.set("Content-Type", f.mime).set("Cache-Control", "private, max-age=86400").send(f.img);
}));
r.delete("/fotos/:id", auth.requirePerm("bens.write"), a(async (req, res) => {
  if (!uuidOk(req.params.id)) fail(404, "Foto não encontrada.");
  const f = await one(`DELETE FROM fotos WHERE id=$1 AND tenant_id=$2 RETURNING bem_id`, [req.params.id, req.tenant.id]);
  if (!f) fail(404, "Foto não encontrada.");
  await audit(req, "remover_foto", "bem", f.bem_id, { foto: req.params.id }, null);
  res.json({ ok: true });
}));

/* ---------------- Transferência (guia) ---------------- */
r.post("/transferencias", auth.requirePerm("transf"), a(async (req, res) => {
  const ids = Array.isArray(req.body.bem_ids) ? [...new Set(req.body.bem_ids)].slice(0, 300) : [];
  if (!ids.length || !ids.every(uuidOk)) fail(400, "Selecione ao menos um bem para transferir.");
  const unidadeId = int(req.body.unidade_id), setorId = int(req.body.setor_id);
  const setor = await checkSetor(req.tenant.id, unidadeId, setorId);
  const responsavel = str(req.body.responsavel, 200); if (!responsavel) fail(400, "Informe o novo responsável pelos bens.");
  const respMat = str(req.body.responsavel_mat, 40), local = str(req.body.local, 200);
  const data = date(req.body.data) || hojeISO(), motivo = str(req.body.motivo, 500);
  const out = await tx(async c => {
    const bens = (await c.query(`${BEM_SELECT} WHERE b.tenant_id=$1 AND b.id = ANY($2::uuid[]) FOR UPDATE OF b`, [req.tenant.id, ids])).rows;
    if (bens.length !== ids.length) fail(400, "Algum bem selecionado não foi encontrado.");
    if (bens.some(b => b.situacao === "Baixado")) fail(400, "Bens baixados não podem ser transferidos.");
    const ano = Number(data.slice(0, 4));
    const numero = await nextCounter(c, req.tenant.id, "guia-" + ano);
    const origem = bens.map(b => ({ bem_id: b.id, numero: b.numero, descricao: b.descricao, unidade: b.unidade, setor: b.setor, responsavel: b.responsavel, valor: b.valor, incorporacao: b.incorporacao }));
    const destino = { unidade_id: unidadeId, setor_id: setorId, unidade: setor.unidade, setor: setor.nome, responsavel, responsavel_mat: respMat, local };
    const g = (await c.query(`INSERT INTO guias (tenant_id,numero,ano,data,origem,destino,motivo,user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.tenant.id, numero, ano, data, JSON.stringify(origem), JSON.stringify(destino), motivo, req.user.id])).rows[0];
    for (const b of bens) {
      await c.query(`UPDATE bens SET unidade_id=$2, setor_id=$3, responsavel=$4, responsavel_mat=$5, local=coalesce($6,local), atualizado_por=$7, atualizado_em=now() WHERE id=$1`,
        [b.id, unidadeId, setorId, responsavel, respMat, local, req.user.id]);
      await evento(c, req, b.id, "Transferência", `Guia ${numero}/${ano}: ${b.unidade || "—"} / ${b.setor || "—"} → ${setor.unidade} / ${setor.nome}; responsável ${b.responsavel || "—"} → ${responsavel}${motivo ? "; motivo: " + motivo : ""}`, { guia: g.id });
    }
    await audit(req, "transferir", "guia", g.id, { origem }, { destino, motivo }, c);
    return g;
  });
  res.status(201).json(out);
}));
r.get("/guias", a(async (req, res) => {
  res.json((await q(`SELECT g.id,g.numero,g.ano,g.data,g.destino,g.motivo,jsonb_array_length(g.origem) AS qtd,u.nome AS por
    FROM guias g LEFT JOIN users u ON u.id=g.user_id WHERE g.tenant_id=$1 ORDER BY g.ano DESC, g.numero DESC LIMIT 200`, [req.tenant.id])).rows);
}));

/* ---------------- Manutenção ---------------- */
const TIPOS_M = ["Preventiva", "Corretiva", "Calibração"];
r.post("/bens/:id/manutencoes", auth.requirePerm("manut.write"), a(async (req, res) => {
  const b = await getBem(req.tenant.id, req.params.id);
  if (b.situacao === "Baixado") fail(400, "Bem baixado não recebe manutenção.");
  const tipo = oneOf(req.body.tipo, TIPOS_M, "Tipo de manutenção"); if (!tipo) fail(400, "Informe o tipo de manutenção.");
  const abertura = date(req.body.abertura) || hojeISO(), conclusao = date(req.body.conclusao);
  if (conclusao && conclusao < abertura) fail(400, "A conclusão não pode ser anterior à abertura.");
  const custo = num(req.body.custo) ?? 0; if (custo < 0) fail(400, "Custo inválido.");
  const sitApos = oneOf(req.body.situacao_apos || (conclusao ? "Em uso" : "Em manutenção"), R.SITUACOES.filter(s => s !== "Baixado"), "Situação");
  const out = await tx(async c => {
    const m = (await c.query(`INSERT INTO manutencoes (tenant_id,bem_id,tipo,abertura,conclusao,empresa,os,descricao,custo,user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.tenant.id, b.id, tipo, abertura, conclusao, str(req.body.empresa, 200), str(req.body.os, 60), str(req.body.descricao, 1500), custo, req.user.id])).rows[0];
    const upd = { situacao: sitApos };
    if (conclusao && tipo === "Preventiva") upd.ult_preventiva = conclusao;
    if (conclusao && tipo === "Calibração") upd.ult_calibracao = conclusao;
    const cols = Object.keys(upd);
    await c.query(`UPDATE bens SET ${cols.map((k, i) => `${k}=$${i + 2}`).join(",")}, atualizado_em=now(), atualizado_por=$${cols.length + 2} WHERE id=$1`, [b.id, ...cols.map(k => upd[k]), req.user.id]);
    await evento(c, req, b.id, `Manutenção ${tipo.toLowerCase()}`, [conclusao ? `concluída em ${dbr(conclusao)}` : `aberta em ${dbr(abertura)}`, m.empresa, m.os ? "OS " + m.os : "", custo ? brl(custo) : "", m.descricao, sitApos !== b.situacao ? `situação → ${sitApos}` : ""].filter(Boolean).join(" · "), { manutencao: m.id });
    await audit(req, "registrar", "manutencao", m.id, null, m, c);
    return m;
  });
  res.status(201).json(out);
}));
r.patch("/manutencoes/:id", auth.requirePerm("manut.write"), a(async (req, res) => {
  const m = await one(`SELECT * FROM manutencoes WHERE id=$1 AND tenant_id=$2`, [int(req.params.id), req.tenant.id]);
  if (!m) fail(404, "Manutenção não encontrada.");
  if (m.conclusao) fail(400, "Esta manutenção já foi concluída.");
  const conclusao = date(req.body.conclusao) || hojeISO();
  if (conclusao < m.abertura) fail(400, "A conclusão não pode ser anterior à abertura.");
  const custo = num(req.body.custo) ?? m.custo;
  const sitApos = oneOf(req.body.situacao_apos || "Em uso", R.SITUACOES.filter(s => s !== "Baixado"), "Situação");
  const out = await tx(async c => {
    const nm = (await c.query(`UPDATE manutencoes SET conclusao=$2, custo=$3, descricao=coalesce($4,descricao) WHERE id=$1 RETURNING *`, [m.id, conclusao, custo, str(req.body.descricao, 1500)])).rows[0];
    const extra = m.tipo === "Preventiva" ? ", ult_preventiva=$3" : m.tipo === "Calibração" ? ", ult_calibracao=$3" : "";
    await c.query(`UPDATE bens SET situacao=$2 ${extra}, atualizado_em=now() WHERE id=$1 AND situacao<>'Baixado'`, extra ? [m.bem_id, sitApos, conclusao] : [m.bem_id, sitApos]);
    await evento(c, req, m.bem_id, `Manutenção ${m.tipo.toLowerCase()}`, `Concluída em ${dbr(conclusao)}${custo ? " · " + brl(custo) : ""} · situação → ${sitApos}`, { manutencao: m.id });
    await audit(req, "concluir", "manutencao", m.id, m, nm, c);
    return nm;
  });
  res.json(out);
}));

/* ---------------- Baixa ---------------- */
r.post("/bens/:id/baixa", auth.requirePerm("baixa"), a(async (req, res) => {
  const b = await getBem(req.tenant.id, req.params.id);
  if (b.situacao === "Baixado") fail(400, "Este bem já foi baixado.");
  const motivo = oneOf(req.body.motivo, R.MOTIVOS_BAIXA, "Motivo da baixa"); if (!motivo) fail(400, "Informe o motivo da baixa.");
  const processo = str(req.body.processo, 200); if (!processo) fail(400, "Informe o processo ou ato administrativo que autorizou a baixa.");
  const data = date(req.body.data) || hojeISO();
  const dep = R.deprec({ ...b, baixa: { data } });
  const baixa = { motivo, processo, data, obs: str(req.body.obs, 1500), destinatario: str(req.body.destinatario, 300),
    valor_liquido: dep ? Math.round(dep.liquido * 100) / 100 : null, situacao_anterior: b.situacao };
  const out = await tx(async c => {
    const row = (await c.query(`UPDATE bens SET situacao='Baixado', baixa=$2, atualizado_por=$3, atualizado_em=now() WHERE id=$1 RETURNING *`, [b.id, JSON.stringify(baixa), req.user.id])).rows[0];
    await evento(c, req, b.id, "Baixa", `${motivo} · ${processo}${dep ? " · valor líquido na baixa " + brl(dep.liquido) : ""}`, baixa);
    await audit(req, "baixar", "bem", b.id, b, row, c);
    return row;
  });
  res.json(out);
}));

/* ---------------- Reavaliação / redução ao valor recuperável ---------------- */
const TIPOS_R = ["Reavaliação", "Redução ao valor recuperável"];
r.post("/bens/:id/reavaliacao", auth.requirePerm("reav"), a(async (req, res) => {
  const b = await getBem(req.tenant.id, req.params.id);
  if (b.situacao === "Baixado") fail(400, "Bem baixado não pode ser reavaliado.");
  if (R.isTerceiro(b)) fail(400, "Bem de terceiro não integra o ativo e não é reavaliado pela entidade.");
  const tipo = oneOf(req.body.tipo, TIPOS_R, "Tipo"); if (!tipo) fail(400, "Informe o tipo de avaliação.");
  const data = date(req.body.data) || hojeISO();
  const novo = num(req.body.valor_novo), vida = num(req.body.vida_restante), residual = num(req.body.residual) ?? 0;
  const laudo = str(req.body.laudo, 300); if (!laudo) fail(400, "Informe o laudo ou relatório de avaliação que fundamenta o novo valor.");
  if (!(novo >= 0)) fail(400, "Informe o novo valor do bem.");
  if (!(vida > 0 && vida <= 100)) fail(400, "Informe a vida útil remanescente, em anos.");
  if (residual < 0 || residual > 90) fail(400, "Valor residual deve estar entre 0% e 90%.");
  const dep = R.deprec(b, R.parse(data));
  const anterior = dep ? Math.round(dep.liquido * 100) / 100 : b.valor;
  if (tipo === "Redução ao valor recuperável" && novo >= anterior) fail(400, `Na redução ao valor recuperável o novo valor deve ser menor que o valor líquido atual (${brl(anterior)}).`);
  const reav = { tipo, data, valor_anterior: anterior, valor_novo: novo, vida_restante: vida, residual, laudo };
  const out = await tx(async c => {
    const rv = (await c.query(`INSERT INTO reavaliacoes (tenant_id,bem_id,tipo,data,valor_anterior,valor_novo,vida_restante,residual,laudo,avaliadores,user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.tenant.id, b.id, tipo, data, anterior, novo, vida, residual, laudo, str(req.body.avaliadores, 500), req.user.id])).rows[0];
    await c.query(`UPDATE bens SET reav=$2, atualizado_em=now(), atualizado_por=$3 WHERE id=$1`, [b.id, JSON.stringify(reav), req.user.id]);
    await evento(c, req, b.id, tipo, `${brl(anterior)} → ${brl(novo)} · vida útil remanescente ${vida} ano(s) · ${laudo}`, { reavaliacao: rv.id });
    await audit(req, "reavaliar", "bem", b.id, { valor_liquido: anterior, reav: b.reav }, reav, c);
    return rv;
  });
  res.status(201).json(out);
}));

module.exports = r;
