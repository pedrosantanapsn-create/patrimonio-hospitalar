"use strict";
/* Documentos oficiais em HTML pronto para impressão/PDF (formatação ABNT) e exportações. */
const express = require("express");
const QRCode = require("qrcode");
const { q, one } = require("../db");
const auth = require("../auth");
const R = require("../../public/js/regras");
const { a, fail, esc, int, brl, dbr, hojeISO, uuidOk } = require("../util");

const r = express.Router();
r.use(auth.requireAuth, auth.requireTenant);

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const dataExtenso = isoDate => { const [y, m, d] = String(isoDate).slice(0, 10).split("-"); return `${Number(d)} de ${MESES[Number(m) - 1]} de ${y}`; };
const money = n => (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numP = (t, n) => R.numFmt(t.prefixo, n);
const baseUrl = req => (process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");

/* Layout ABNT: A4, margens 3 cm (sup./esq.) e 2 cm (inf./dir.), fonte 12, espaçamento 1,5,
   numeração no canto superior direito, tabelas com título acima e fonte abaixo. */
function page(req, title, body, opts = {}) {
  const t = req.tenant;
  const cidade = t.config?.cidade;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><link rel="stylesheet" href="/css/doc.css"></head><body${opts.landscape ? ' class="paisagem"' : ""}>
<div class="toolbar no-print"><a href="/" class="tb-link">← Voltar ao sistema</a><button type="button" id="btn-print">Imprimir ou salvar em PDF</button></div>
<main class="folha">
${opts.semCabecalho ? "" : `<header class="cab"><strong>${esc(t.ente || t.nome)}</strong>${t.ente && t.ente !== t.nome ? `<br>${esc(t.nome)}` : ""}${t.cnpj ? `<br>CNPJ ${esc(t.cnpj)}` : ""}${opts.unidade ? `<br>${esc(opts.unidade)}` : ""}<br>Setor de Patrimônio</header>`}
${body}
${opts.semLocal ? "" : `<p class="local">${esc(cidade ? cidade + ", " : "")}${dataExtenso(opts.data || hojeISO())}.</p>`}
</main>
<script src="/js/print.js"></script></body></html>`;
}
const assin = nomes => `<div class="assinaturas">${nomes.map(n => `<div class="ass"><span class="linha"></span><b>${esc(n.nome || "")}</b>${n.cargo ? `<br>${esc(n.cargo)}` : ""}${n.matricula ? `<br>Matrícula ${esc(n.matricula)}` : ""}${n.funcao ? `<br>${esc(n.funcao)}` : ""}</div>`).join("")}</div>`;
const fonte = req => `<p class="fonte">Fonte: Sistema de Controle Patrimonial – ${esc(req.tenant.nome)}, ${dbr(hojeISO())}.</p>`;
function send(res, html) { res.set("Content-Type", "text/html; charset=utf-8").set("Cache-Control", "no-store").send(html); }

async function bensWhere(tenantId, where, params) {
  return (await q(`SELECT b.*, s.nome AS setor, un.nome AS unidade FROM bens b LEFT JOIN setores s ON s.id=b.setor_id
    LEFT JOIN unidades un ON un.id=b.unidade_id WHERE b.tenant_id=$1 ${where} ORDER BY b.numero`, [tenantId, ...params])).rows;
}

/* 1. Termo de responsabilidade por setor */
r.get("/termo", a(async (req, res) => {
  const setor = await one(`SELECT s.*, u.nome AS unidade FROM setores s JOIN unidades u ON u.id=s.unidade_id WHERE s.id=$1 AND s.tenant_id=$2`, [int(req.query.setor_id), req.tenant.id]);
  if (!setor) fail(404, "Setor não encontrado.");
  const bens = await bensWhere(req.tenant.id, `AND b.setor_id=$2 AND b.situacao<>'Baixado'`, [setor.id]);
  const resp = [...new Set(bens.map(b => b.responsavel).filter(Boolean))];
  const proprios = bens.filter(b => !R.isTerceiro(b));
  const total = proprios.reduce((s, b) => s + Number(b.valor || 0), 0);
  const body = `<h1>Termo de responsabilidade de bens patrimoniais</h1>
<p>Pelo presente termo, ${resp.length ? `<b>${esc(resp.join("; "))}</b>` : "o(a) responsável abaixo assinado(a)"}, em exercício no setor <b>${esc(setor.nome)}</b> da unidade <b>${esc(setor.unidade)}</b>, declara ter recebido os bens patrimoniais relacionados na Tabela 1 e assume a responsabilidade por sua guarda, conservação e uso adequado, nos termos do art. 94 da Lei nº 4.320, de 17 de março de 1964, e das normas internas da entidade.</p>
<p>O(a) responsável compromete-se a comunicar imediatamente ao Setor de Patrimônio qualquer transferência, dano, extravio, furto ou necessidade de manutenção, ciente de que a movimentação de bens sem a devida guia de transferência é vedada e de que poderá ser responsabilizado(a) por perda ou dano decorrente de uso indevido, apurado em processo regular.</p>
<p class="tab-titulo">Tabela 1 – Bens patrimoniais sob responsabilidade do setor ${esc(setor.nome)}</p>
<table><thead><tr><th>Nº patrimônio</th><th>Descrição</th><th>Marca / modelo</th><th>Nº de série</th><th>Conservação</th><th class="r">Valor (R$)</th></tr></thead><tbody>
${bens.map(b => `<tr><td class="nw">${esc(numP(req.tenant, b.numero))}</td><td>${esc(b.descricao)}${R.isTerceiro(b) ? " <i>(bem de terceiro)</i>" : ""}</td><td>${esc([b.marca, b.modelo].filter(Boolean).join(" / ") || "—")}</td><td>${esc(b.serie || "—")}</td><td>${esc(b.conservacao)}</td><td class="r">${R.isTerceiro(b) ? "—" : money(b.valor)}</td></tr>`).join("") || `<tr><td colspan="6">Nenhum bem ativo neste setor.</td></tr>`}
<tr class="tot"><td colspan="5">Total: ${bens.length} bem(ns); valor apenas dos bens próprios</td><td class="r">${money(total)}</td></tr></tbody></table>
${fonte(req)}
${assin([{ nome: resp.join("; ") || " ", cargo: "Responsável pelo setor" }, { nome: req.tenant.config?.gestor_patrimonio || " ", cargo: "Setor de Patrimônio" }])}`;
  send(res, page(req, `Termo de responsabilidade – ${setor.nome}`, body, { unidade: setor.unidade }));
}));

/* 2. Guia de transferência */
r.get("/guia/:id", a(async (req, res) => {
  const g = await one(`SELECT g.*, u.nome AS por, u.cargo AS por_cargo FROM guias g LEFT JOIN users u ON u.id=g.user_id WHERE g.id=$1 AND g.tenant_id=$2`, [int(req.params.id), req.tenant.id]);
  if (!g) fail(404, "Guia não encontrada.");
  const origens = [...new Set(g.origem.map(o => `${o.unidade || "—"} / ${o.setor || "—"}`))];
  const respOrig = [...new Set(g.origem.map(o => o.responsavel).filter(Boolean))];
  const total = g.origem.filter(o => !R.isTerceiro(o)).reduce((s, o) => s + Number(o.valor || 0), 0);
  const body = `<h1>Guia de transferência de bens patrimoniais nº ${g.numero}/${g.ano}</h1>
<table class="kv"><tbody>
<tr><th>Data</th><td>${dbr(g.data)}</td></tr>
<tr><th>Origem</th><td>${esc(origens.join("; "))}</td></tr>
<tr><th>Responsável na origem</th><td>${esc(respOrig.join("; ") || "—")}</td></tr>
<tr><th>Destino</th><td>${esc(g.destino.unidade)} / ${esc(g.destino.setor)}${g.destino.local ? ` – ${esc(g.destino.local)}` : ""}</td></tr>
<tr><th>Responsável no destino</th><td>${esc(g.destino.responsavel)}${g.destino.responsavel_mat ? ` (matrícula ${esc(g.destino.responsavel_mat)})` : ""}</td></tr>
<tr><th>Motivo</th><td>${esc(g.motivo || "—")}</td></tr></tbody></table>
<p class="tab-titulo">Tabela 1 – Bens transferidos</p>
<table><thead><tr><th>Nº patrimônio</th><th>Descrição</th><th>Setor de origem</th><th class="r">Valor (R$)</th></tr></thead><tbody>
${g.origem.map(o => `<tr><td class="nw">${esc(numP(req.tenant, o.numero))}</td><td>${esc(o.descricao)}</td><td>${esc(o.setor || "—")}</td><td class="r">${R.isTerceiro(o) ? "—" : money(o.valor)}</td></tr>`).join("")}
<tr class="tot"><td colspan="3">Total: ${g.origem.length} bem(ns)</td><td class="r">${money(total)}</td></tr></tbody></table>
${fonte(req)}
<p>Declaro que os bens acima relacionados foram entregues e recebidos nas condições em que se encontram, passando a responsabilidade por sua guarda e conservação ao responsável do setor de destino, a partir desta data.</p>
${assin([{ nome: respOrig.join("; ") || " ", cargo: "Entregue por (origem)" }, { nome: g.destino.responsavel, cargo: "Recebido por (destino)" }, { nome: g.por || " ", cargo: "Setor de Patrimônio" }])}`;
  send(res, page(req, `Guia de transferência ${g.numero}/${g.ano}`, body, { data: g.data }));
}));

/* 3. Ata de inventário */
r.get("/ata/:id", a(async (req, res) => {
  const inv = await one(`SELECT i.*, u.nome AS unidade FROM inventarios i JOIN unidades u ON u.id=i.unidade_id WHERE i.id=$1 AND i.tenant_id=$2`, [int(req.params.id), req.tenant.id]);
  if (!inv) fail(404, "Inventário não encontrado.");
  const bens = await bensWhere(req.tenant.id, `AND b.unidade_id=$2 AND (b.situacao<>'Baixado' OR b.id IN (SELECT bem_id FROM inventario_itens WHERE inventario_id=$3))`, [inv.unidade_id, inv.id]);
  const itens = (await q(`SELECT x.*, s.nome AS setor_encontrado FROM inventario_itens x LEFT JOIN setores s ON s.id=x.setor_id WHERE x.inventario_id=$1`, [inv.id])).rows;
  const im = Object.fromEntries(itens.map(i => [i.bem_id, i]));
  const ativos = bens.filter(b => b.situacao !== "Baixado");
  const loc = ativos.filter(b => im[b.id]?.status === "localizado"), div = ativos.filter(b => im[b.id]?.status === "divergente"), nao = ativos.filter(b => !im[b.id]);
  const soma = l => l.filter(b => !R.isTerceiro(b)).reduce((s, b) => { const d = R.deprec(b); return s + (d ? d.liquido : Number(b.valor || 0)); }, 0);
  const preside = inv.comissao.find(m => /presid/i.test(m.funcao)) || inv.comissao[0];
  const encerr = inv.encerrado_em ? new Date(inv.encerrado_em).toISOString().slice(0, 10) : hojeISO();
  let t = 0; const T = () => ++t;
  const body = `<h1>Ata de inventário ${esc(inv.tipo.toLowerCase())} de bens móveis – exercício ${inv.ano}</h1>
${inv.status !== "encerrado" ? `<p class="aviso no-print">Prévia: este inventário ainda está aberto. A ata definitiva é emitida após o encerramento.</p>` : ""}
<p>Aos ${dataExtenso(encerr)}, a Comissão de Inventário${inv.portaria ? ` designada pelo(a) ${esc(inv.portaria)}` : ""}, composta pelos membros abaixo identificados, concluiu o levantamento físico dos bens móveis permanentes da unidade <b>${esc(inv.unidade)}</b>, iniciado em ${dbr(String(inv.aberto_em.toISOString ? inv.aberto_em.toISOString() : inv.aberto_em))}, em cumprimento ao art. 96 da Lei nº 4.320, de 17 de março de 1964, confrontando os bens encontrados com os registros do controle patrimonial.</p>
<h2>1 Resultado do levantamento</h2>
<p class="tab-titulo">Tabela ${T()} – Síntese do inventário</p>
<table><thead><tr><th>Situação</th><th class="r">Quantidade</th><th class="r">Valor contábil líquido (R$)</th></tr></thead><tbody>
<tr><td>Bens registrados no controle (ativos)</td><td class="r">${ativos.length}</td><td class="r">${money(soma(ativos))}</td></tr>
<tr><td>Localizados no setor de registro</td><td class="r">${loc.length}</td><td class="r">${money(soma(loc))}</td></tr>
<tr><td>Localizados em setor divergente</td><td class="r">${div.length}</td><td class="r">${money(soma(div))}</td></tr>
<tr><td>Não localizados</td><td class="r">${nao.length}</td><td class="r">${money(soma(nao))}</td></tr></tbody></table>
${fonte(req)}
<h2>2 Bens localizados em setor divergente</h2>
${div.length ? `<p class="tab-titulo">Tabela ${T()} – Bens encontrados fora do setor de registro</p><table><thead><tr><th>Nº patrimônio</th><th>Descrição</th><th>Setor de registro</th><th>Setor onde foi encontrado</th></tr></thead><tbody>
${div.map(b => `<tr><td class="nw">${esc(numP(req.tenant, b.numero))}</td><td>${esc(b.descricao)}</td><td>${esc(b.setor)}</td><td>${esc(im[b.id].setor_encontrado)}</td></tr>`).join("")}</tbody></table>${fonte(req)}
<p>A comissão recomenda a regularização desses bens por meio de guia de transferência ou o seu retorno ao setor de registro.</p>` : `<p>Não foram encontrados bens fora do setor de registro.</p>`}
<h2>3 Bens não localizados</h2>
${nao.length ? `<p class="tab-titulo">Tabela ${T()} – Bens não localizados no levantamento físico</p><table><thead><tr><th>Nº patrimônio</th><th>Descrição</th><th>Setor de registro</th><th>Responsável</th><th class="r">Valor líquido (R$)</th></tr></thead><tbody>
${nao.map(b => { const d = R.deprec(b); return `<tr><td class="nw">${esc(numP(req.tenant, b.numero))}</td><td>${esc(b.descricao)}${R.isTerceiro(b) ? " <i>(terceiro)</i>" : ""}</td><td>${esc(b.setor)}</td><td>${esc(b.responsavel || "—")}</td><td class="r">${R.isTerceiro(b) ? "—" : money(d ? d.liquido : b.valor)}</td></tr>`; }).join("")}</tbody></table>${fonte(req)}
<p>A comissão recomenda a notificação dos responsáveis para localização dos bens e, persistindo a ausência, a abertura de procedimento de apuração de responsabilidade, nos termos das normas da entidade, antes de qualquer baixa patrimonial.</p>` : `<p>Todos os bens registrados foram localizados.</p>`}
<h2>4 Bens com alteração de estado de conservação</h2>
${(() => { const l = ativos.filter(b => im[b.id] && im[b.id].conservacao === "Ruim"); return l.length ? `<p>Foram encontrados ${l.length} bem(ns) em estado ruim, a serem avaliados quanto à classificação como inservíveis: ${l.map(b => esc(numP(req.tenant, b.numero))).join(", ")}.</p>` : `<p>Não foram registrados bens em estado ruim.</p>`; })()}
<h2>5 Considerações finais</h2>
<p>${esc(inv.observacoes || "Nada mais havendo a registrar, a comissão encerra os trabalhos e lavra a presente ata, que vai assinada por seus membros.")}</p>
${assin(inv.comissao)}`;
  send(res, page(req, `Ata de inventário ${inv.ano} – ${inv.unidade}`, body, { unidade: inv.unidade, data: encerr, semLocal: false }));
}));

/* 4. Relatório de bens inservíveis (subsídio à comissão de desfazimento) */
r.get("/inserviveis", a(async (req, res) => {
  const bens = await bensWhere(req.tenant.id, `AND b.situacao='Inservível'`, []);
  const grupos = R.INSERV.map(c => ({ c, l: bens.filter(b => (b.class_inservivel || "Ocioso") === c) }));
  let t = 0;
  const desc = { "Ocioso": "em perfeitas condições de uso, mas sem aproveitamento", "Recuperável": "com recuperação possível e orçada em até 50% do valor de mercado",
    "Antieconômico": "com manutenção onerosa ou rendimento precário, em virtude de uso prolongado, desgaste prematuro ou obsoletismo", "Irrecuperável": "sem condições de uso para a finalidade a que se destina" };
  const body = `<h1>Relatório de bens móveis inservíveis</h1>
<p>Este relatório relaciona os bens móveis classificados como inservíveis no controle patrimonial, para subsidiar a análise da comissão competente e a decisão sobre sua destinação (reaproveitamento, alienação, doação, cessão ou inutilização), observados o art. 76 da Lei nº 14.133, de 1º de abril de 2021, e a norma de desfazimento adotada pela entidade.</p>
<p>A classificação utiliza as categorias do Decreto nº 9.373, de 11 de maio de 2018, aplicável à administração pública federal e utilizada como referência na ausência de regulamentação própria do ente.</p>
${grupos.map(g => g.l.length ? `<h2>${esc(g.c)}</h2><p>Bens ${desc[g.c]}.</p><p class="tab-titulo">Tabela ${++t} – Bens classificados como ${esc(g.c.toLowerCase())}</p>
<table><thead><tr><th>Nº patrimônio</th><th>Descrição</th><th>Setor</th><th>Aquisição</th><th class="r">Custo (R$)</th><th class="r">Valor líquido (R$)</th></tr></thead><tbody>
${g.l.map(b => { const d = R.deprec(b); return `<tr><td class="nw">${esc(numP(req.tenant, b.numero))}</td><td>${esc(b.descricao)}</td><td>${esc(b.setor || "—")}</td><td>${dbr(b.data_aquisicao)}</td><td class="r">${money(b.valor)}</td><td class="r">${money(d ? d.liquido : b.valor)}</td></tr>`; }).join("")}
<tr class="tot"><td colspan="4">Subtotal: ${g.l.length} bem(ns)</td><td class="r">${money(g.l.reduce((s, b) => s + Number(b.valor || 0), 0))}</td><td class="r">${money(g.l.reduce((s, b) => { const d = R.deprec(b); return s + (d ? d.liquido : Number(b.valor || 0)); }, 0))}</td></tr></tbody></table>${fonte(req)}` : "").join("") || "<p>Não há bens classificados como inservíveis.</p>"}
${assin([{ nome: req.tenant.config?.gestor_patrimonio || " ", cargo: "Setor de Patrimônio" }])}`;
  send(res, page(req, "Relatório de bens inservíveis", body));
}));

/* 5. Ficha patrimonial individual */
r.get("/ficha/:id", a(async (req, res) => {
  if (!uuidOk(req.params.id)) fail(404, "Bem não encontrado.");
  const b = (await bensWhere(req.tenant.id, `AND b.id=$2`, [req.params.id]))[0]; if (!b) fail(404, "Bem não encontrado.");
  const fotos = (await q(`SELECT id FROM fotos WHERE bem_id=$1 ORDER BY ordem LIMIT 2`, [b.id])).rows;
  const ev = (await q(`SELECT e.*, u.nome AS por FROM eventos e LEFT JOIN users u ON u.id=e.user_id WHERE bem_id=$1 ORDER BY em, e.id`, [b.id])).rows;
  const d = R.deprec(b), c = R.CLASSES[b.classe] || R.CLASSES.out;
  const qr = await QRCode.toString(`${baseUrl(req)}/#/q/${req.tenant.slug}/${b.numero}`, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  const row = (k, v) => `<tr><th>${k}</th><td>${v || "—"}</td></tr>`;
  const body = `<h1>Ficha patrimonial – ${esc(numP(req.tenant, b.numero))}</h1>
<div class="ficha-top">${fotos.length ? fotos.map(f => `<img src="/api/fotos/${f.id}" alt="Foto do bem">`).join("") : ""}<div class="qr">${qr}</div></div>
<table class="kv"><tbody>
${row("Descrição", esc(b.descricao))}${row("Especificação", esc(b.especificacao))}${row("Marca / modelo", esc([b.marca, b.modelo].filter(Boolean).join(" / ")))}${row("Nº de série", esc(b.serie))}
${row("Classe / conta PCASP", `${esc(c.nome)} – ${esc(c.conta)}`)}${row("Incorporação", `${esc(b.incorporacao)}${b.documento ? " – " + esc(b.documento) : ""}`)}${row("Fornecedor / doador", esc(b.fornecedor))}
${row("Data de aquisição", dbr(b.data_aquisicao))}${row("Valor de aquisição", R.isTerceiro(b) ? "Bem de terceiro" : brl(b.valor))}
${d ? row("Depreciação acumulada / valor líquido", `${brl(d.acum)} / ${brl(d.liquido)}${d.reavaliado ? " (após reavaliação)" : ""}`) : ""}
${row("Unidade / setor / local", esc([b.unidade, b.setor, b.local].filter(Boolean).join(" / ")))}${row("Responsável", esc(b.responsavel))}
${row("Conservação / situação", `${esc(b.conservacao)} / ${esc(b.situacao)}${b.class_inservivel ? " (" + esc(b.class_inservivel) + ")" : ""}`)}
${c.saude ? row("Registro Anvisa / classe de risco", esc([b.anvisa, b.risco].filter(Boolean).join(" / "))) + row("Última preventiva / calibração", `${dbr(b.ult_preventiva)} / ${dbr(b.ult_calibracao)}`) : ""}
${b.baixa ? row("Baixa", `${dbr(b.baixa.data)} – ${esc(b.baixa.motivo)} – ${esc(b.baixa.processo)}`) : ""}
</tbody></table>
<h2>Histórico de movimentações</h2>
<p class="tab-titulo">Tabela 1 – Registros do bem</p>
<table><thead><tr><th>Data</th><th>Tipo</th><th>Registro</th><th>Usuário</th></tr></thead><tbody>
${ev.map(e => `<tr><td class="nw">${dbr(new Date(e.em).toISOString())}</td><td>${esc(e.tipo)}</td><td>${esc(e.texto)}</td><td>${esc(e.por || "—")}</td></tr>`).join("")}</tbody></table>${fonte(req)}`;
  send(res, page(req, `Ficha ${numP(req.tenant, b.numero)}`, body, { unidade: b.unidade }));
}));

/* 6. Etiquetas com QR Code */
r.get("/etiquetas", a(async (req, res) => {
  let bens;
  if (req.query.ids) {
    const ids = String(req.query.ids).split(",").filter(uuidOk).slice(0, 500);
    bens = await bensWhere(req.tenant.id, `AND b.id = ANY($2::uuid[])`, [ids]);
  } else if (req.query.setor_id) bens = await bensWhere(req.tenant.id, `AND b.setor_id=$2 AND b.situacao<>'Baixado'`, [int(req.query.setor_id)]);
  else bens = await bensWhere(req.tenant.id, `AND b.situacao<>'Baixado'`, []);
  const modelo = req.query.modelo === "grande" ? "grande" : "padrao";
  const base = baseUrl(req);
  const etiquetas = await Promise.all(bens.map(async b => {
    const svg = await QRCode.toString(`${base}/#/q/${req.tenant.slug}/${b.numero}`, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
    return `<div class="etq"><div class="qr">${svg}</div><div class="tx"><span class="org">${esc(req.tenant.ente || req.tenant.nome)}</span><span class="pat">${esc(numP(req.tenant, b.numero))}</span><span class="ds">${esc(b.descricao)}</span><span class="aviso">Patrimônio público · não remover</span></div></div>`;
  }));
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Etiquetas patrimoniais</title><link rel="stylesheet" href="/css/doc.css"></head>
<body class="etiquetas ${modelo}"><div class="toolbar no-print"><a href="/" class="tb-link">← Voltar ao sistema</a><span>${bens.length} etiqueta(s) · folha A4, ${modelo === "grande" ? "2 × 7" : "3 × 8"} por página. Imprima em 100% (sem ajustar à página).</span><button type="button" id="btn-print">Imprimir</button></div>
<main class="sheet">${etiquetas.join("") || "<p>Nenhum bem para etiquetar.</p>"}</main><script src="/js/print.js"></script></body></html>`;
  send(res, html);
}));

/* 7. Demonstrativo por conta contábil (conciliação com a contabilidade) */
r.get("/contas", a(async (req, res) => {
  const ref = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.ref || "")) ? String(req.query.ref) : hojeISO();
  const bens = await bensWhere(req.tenant.id, `AND b.data_aquisicao <= $2::date AND (b.situacao<>'Baixado' OR (b.baixa->>'data') > $2::text)`, [ref]);
  const g = {};
  for (const b of bens.filter(x => !R.isTerceiro(x))) {
    const c = R.CLASSES[b.classe] || R.CLASSES.out; const k = c.conta + "|" + c.nome;
    const d = R.deprec({ ...b, baixa: null }, R.parse(ref));
    g[k] = g[k] || { n: 0, custo: 0, dep: 0, liq: 0 };
    g[k].n++; g[k].custo += Number(b.valor || 0); g[k].dep += d ? d.acum : 0; g[k].liq += d ? d.liquido : Number(b.valor || 0);
  }
  const rows = Object.entries(g).sort();
  const tot = rows.reduce((s, [, x]) => ({ n: s.n + x.n, custo: s.custo + x.custo, dep: s.dep + x.dep, liq: s.liq + x.liq }), { n: 0, custo: 0, dep: 0, liq: 0 });
  const terc = bens.filter(R.isTerceiro).length;
  const body = `<h1>Demonstrativo de bens móveis por conta contábil</h1>
<p>Posição em ${dbr(ref)}. Valores apurados pelo controle patrimonial para conciliação com os saldos contábeis das contas de bens móveis do Plano de Contas Aplicado ao Setor Público (PCASP). Diferenças devem ser analisadas e ajustadas antes do encerramento do exercício.</p>
<p class="tab-titulo">Tabela 1 – Bens móveis próprios por conta contábil</p>
<table><thead><tr><th>Conta</th><th>Título</th><th class="r">Qtd.</th><th class="r">Custo / valor reavaliado (R$)</th><th class="r">Depreciação acumulada (R$)</th><th class="r">Valor líquido (R$)</th></tr></thead><tbody>
${rows.map(([k, x]) => { const [conta, nome] = k.split("|"); return `<tr><td class="nw">${esc(conta)}</td><td>${esc(nome)}</td><td class="r">${x.n}</td><td class="r">${money(x.custo)}</td><td class="r">${money(x.dep)}</td><td class="r">${money(x.liq)}</td></tr>`; }).join("") || `<tr><td colspan="6">Sem bens no período.</td></tr>`}
<tr class="tot"><td colspan="2">Total</td><td class="r">${tot.n}</td><td class="r">${money(tot.custo)}</td><td class="r">${money(tot.dep)}</td><td class="r">${money(tot.liq)}</td></tr></tbody></table>
${fonte(req)}
${terc ? `<p>Além desses, ${terc} bem(ns) de terceiros (comodato, cessão ou locação) estão sob guarda da entidade e são controlados em contas de controle, sem compor o ativo.</p>` : ""}
<p>Nota: na coluna de custo, os bens reavaliados constam pelo custo histórico de aquisição; a depreciação e o valor líquido consideram a reavaliação vigente.</p>
${assin([{ nome: req.tenant.config?.gestor_patrimonio || " ", cargo: "Setor de Patrimônio" }, { nome: " ", cargo: "Contabilidade" }])}`;
  send(res, page(req, "Demonstrativo por conta contábil", body, { landscape: true }));
}));

/* 8. Plano anual de manutenção (engenharia clínica) */
r.get("/plano-manutencao", a(async (req, res) => {
  const bens = await bensWhere(req.tenant.id, `AND b.classe='med' AND b.situacao<>'Baixado' AND (b.per_preventiva > 0 OR b.per_calibracao > 0)`, []);
  const hoje = new Date(); const fim = new Date(hoje.getFullYear() + 1, hoje.getMonth(), 1);
  const linhas = [];
  for (const b of bens) for (const [tipo, per, ult] of [["Preventiva", b.per_preventiva, b.ult_preventiva], ["Calibração", b.per_calibracao, b.ult_calibracao]]) {
    if (!per) continue;
    let p = ult ? R.addMonths(ult, per) : null, n = 0;
    if (!p) { linhas.push({ b, tipo, d: null }); continue; }
    while (p && p < fim && n++ < 24) { linhas.push({ b, tipo, d: R.iso(p) }); p = R.addMonths(R.iso(p), per); }
  }
  linhas.sort((x, y) => (x.d || "") < (y.d || "") ? -1 : 1);
  const body = `<h1>Plano de manutenção de equipamentos de saúde</h1>
<p>Programação das manutenções preventivas e calibrações para os próximos 12 meses, conforme a periodicidade cadastrada para cada equipamento, em atenção ao gerenciamento de tecnologias em saúde previsto na RDC Anvisa nº 509, de 27 de maio de 2021. Itens sem data indicam equipamento sem registro da última execução.</p>
<p class="tab-titulo">Tabela 1 – Programação de manutenções</p>
<table><thead><tr><th>Previsão</th><th>Nº patrimônio</th><th>Equipamento</th><th>Setor</th><th>Tipo</th><th>Periodicidade</th></tr></thead><tbody>
${linhas.map(l => `<tr><td class="nw">${l.d ? dbr(l.d) : "Sem registro"}${l.d && l.d < hojeISO() ? " (vencida)" : ""}</td><td class="nw">${esc(numP(req.tenant, l.b.numero))}</td><td>${esc(l.b.descricao)}${l.b.marca ? " – " + esc(l.b.marca) : ""}</td><td>${esc(l.b.setor || "—")}</td><td>${l.tipo}</td><td>${l.tipo === "Preventiva" ? l.b.per_preventiva : l.b.per_calibracao} mês(es)</td></tr>`).join("") || `<tr><td colspan="6">Nenhum equipamento com periodicidade cadastrada.</td></tr>`}</tbody></table>
${fonte(req)}
${assin([{ nome: " ", cargo: "Engenharia clínica" }, { nome: " ", cargo: "Direção técnica" }])}`;
  send(res, page(req, "Plano de manutenção", body, { landscape: true }));
}));

/* 9. Planilha CSV */
r.get("/bens.csv", a(async (req, res) => {
  const todos = req.query.todos === "1";
  const bens = await bensWhere(req.tenant.id, todos ? "" : `AND b.situacao<>'Baixado'`, []);
  const n2 = v => v === null || v === undefined ? "" : Number(v).toFixed(2).replace(".", ",");
  const cols = [["Nº patrimônio", b => numP(req.tenant, b.numero)], ["Descrição", b => b.descricao], ["Especificação", b => b.especificacao], ["Marca", b => b.marca], ["Modelo", b => b.modelo],
    ["Nº de série", b => b.serie], ["Classe", b => (R.CLASSES[b.classe] || {}).nome], ["Conta PCASP", b => (R.CLASSES[b.classe] || {}).conta], ["Incorporação", b => b.incorporacao],
    ["Documento", b => b.documento], ["Fornecedor/doador", b => b.fornecedor], ["Data de aquisição", b => dbr(b.data_aquisicao)], ["Valor de aquisição", b => R.isTerceiro(b) ? "" : n2(b.valor)],
    ["Depreciação acumulada", b => { const d = R.deprec(b); return d ? n2(d.acum) : ""; }], ["Valor líquido", b => { const d = R.deprec(b); return d ? n2(d.liquido) : ""; }],
    ["Unidade", b => b.unidade], ["Setor", b => b.setor], ["Localização", b => b.local], ["Responsável", b => b.responsavel], ["Conservação", b => b.conservacao], ["Situação", b => b.situacao],
    ["Classificação inservível", b => b.class_inservivel], ["Registro Anvisa", b => b.anvisa], ["Última preventiva", b => b.ult_preventiva ? dbr(b.ult_preventiva) : ""],
    ["Última calibração", b => b.ult_calibracao ? dbr(b.ult_calibracao) : ""], ["Última conferência", b => b.ult_conferencia ? dbr(b.ult_conferencia) : ""],
    ["Baixa", b => b.baixa ? `${dbr(b.baixa.data)} ${b.baixa.motivo} ${b.baixa.processo}` : ""]];
  const qv = v => { let s = String(v ?? "").replace(/"/g, '""'); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[;"\n\r]/.test(s) ? `"${s}"` : s; };
  const csv = "﻿" + [cols.map(c => qv(c[0])).join(";"), ...bens.map(b => cols.map(c => qv(c[1](b))).join(";"))].join("\r\n");
  res.set("Content-Type", "text/csv; charset=utf-8").set("Content-Disposition", `attachment; filename="inventario-patrimonial-${hojeISO()}.csv"`).send(csv);
}));

module.exports = r;
