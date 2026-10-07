/* Operações sobre bens (transferência, manutenção, baixa, reavaliação), inventário e engenharia clínica. */
(function () {
  "use strict";
  const PH = window.PH, R = PH.R, S = PH.S, { esc, brl, dbr, ICON } = PH;

  const unidadeSetorFields = (pref, uid, sid) => {
    const us = PH.unidadesAtivas();
    return `<label><span class="req">Unidade de destino</span><select id="${pref}_uni">${us.map(u => `<option value="${u.id}" ${u.id === uid ? "selected" : ""}>${esc(u.nome)}</option>`).join("")}</select></label>
      <label><span class="req">Setor de destino</span><select id="${pref}_set" data-sid="${sid || ""}"></select></label>`;
  };
  const wireSetor = pref => {
    const fill = () => { const sid = Number(PH.$(`#${pref}_set`).dataset.sid); PH.$(`#${pref}_set`).innerHTML = PH.setoresDe(PH.$(`#${pref}_uni`).value).map(s => `<option value="${s.id}" ${s.id === sid ? "selected" : ""}>${esc(s.nome)}</option>`).join(""); };
    PH.$(`#${pref}_uni`).onchange = fill; fill();
  };

  /* ---------- Transferência (um ou vários bens) ---------- */
  PH.openTransf = async (ids, done) => {
    await Promise.all([PH.loadCfg(), PH.loadBens()]);
    const bens = S.bens.filter(b => ids.includes(b.id));
    PH.modal("Transferir bens", `
      <p style="margin:0">${bens.length === 1 ? `<b class="mono">${esc(PH.num(bens[0].numero))}</b> · ${esc(bens[0].descricao)} · hoje em <b>${esc(bens[0].setor || "—")}</b> com <b>${esc(bens[0].responsavel || "sem responsável")}</b>.` : `${bens.length} bens selecionados, de ${new Set(bens.map(b => b.setor)).size} setor(es). Será emitida uma única guia.`}</p>
      <fieldset><legend>Destino</legend><div class="fg">${unidadeSetorFields("t", bens[0]?.unidade_id)}
        <label class="w4"><span class="req">Novo responsável</span><input type="text" id="t_resp" placeholder="Quem assina o recebimento"></label>
        <label class="w2">Matrícula<input type="text" id="t_mat"></label>
        <label>Localização física<input type="text" id="t_local" placeholder="Sala, leito (opcional)"></label>
        <label>Data<input type="date" id="t_data" value="${PH.hoje()}"></label>
        <label class="w6">Motivo<input type="text" id="t_mot" placeholder="Ex.: remanejamento, abertura de leitos, devolução ao almoxarifado"></label>
      </div></fieldset>
      <p class="hint" style="margin:0">Ao confirmar, o sistema gera a guia de transferência numerada para impressão e assinatura de quem entrega e de quem recebe.</p>`,
      `<button class="btn" data-close>Cancelar</button><button class="btn pri" id="t-ok">Gerar guia e transferir</button>`);
    wireSetor("t");
    PH.$("#t-ok").onclick = e => PH.busy(e.currentTarget, async () => {
      const g = await PH.api("POST", "/transferencias", { bem_ids: ids, unidade_id: PH.val("t_uni"), setor_id: PH.val("t_set"), responsavel: PH.val("t_resp"), responsavel_mat: PH.val("t_mat"), local: PH.val("t_local"), data: PH.val("t_data"), motivo: PH.val("t_mot") });
      PH.invalidate(); done && done(); await PH.render();
      PH.modal("Transferência registrada", `<div class="callout"><span style="flex:1">Guia nº <b class="mono">${g.numero}/${g.ano}</b> gerada com ${ids.length} bem(ns). Imprima e colha as assinaturas.</span><a class="btn pri" href="/docs/guia/${g.id}" target="_blank" rel="noopener">${ICON.doc}Abrir guia</a></div>`, `<button class="btn" data-close>Fechar</button>`, { narrow: true });
    });
  };

  /* ---------- Manutenção ---------- */
  PH.openManut = (b, done) => {
    const saude = R.CLASSES[b.classe]?.saude;
    PH.modal("Registrar manutenção", `<p style="margin:0"><b class="mono">${esc(PH.num(b.numero))}</b> · ${esc(b.descricao)}</p>
      <fieldset><legend>Ordem de serviço</legend><div class="fg">
        <label><span class="req">Tipo</span><select id="m_tipo"><option>Corretiva</option><option>Preventiva</option>${saude ? "<option>Calibração</option>" : ""}</select></label>
        <label>Empresa / técnico<input type="text" id="m_emp"></label>
        <label>Abertura<input type="date" id="m_ab" value="${PH.hoje()}"></label>
        <label>Conclusão<input type="date" id="m_co"><span class="hint">Deixe vazio se o serviço ainda está em andamento.</span></label>
        <label>Nº da OS / laudo<input type="text" id="m_os"></label>
        <label>Custo (R$)<input type="number" id="m_custo" min="0" step="0.01"></label>
        <label class="w6">Descrição do serviço<textarea id="m_desc"></textarea></label>
        <label class="w6">Situação do bem após o registro<select id="m_sit">${PH.opt(R.SITUACOES.filter(s => s !== "Baixado"), "Em manutenção")}</select></label>
      </div></fieldset>`, `<button class="btn" data-close>Cancelar</button><button class="btn pri" id="m-ok">Registrar</button>`);
    PH.$("#m_co").onchange = e => { PH.$("#m_sit").value = e.target.value ? "Em uso" : "Em manutenção"; };
    PH.$("#m-ok").onclick = e => PH.busy(e.currentTarget, async () => {
      await PH.api("POST", `/bens/${b.id}/manutencoes`, { tipo: PH.val("m_tipo"), empresa: PH.val("m_emp"), abertura: PH.val("m_ab"), conclusao: PH.val("m_co"), os: PH.val("m_os"), custo: PH.val("m_custo"), descricao: PH.val("m_desc"), situacao_apos: PH.val("m_sit") });
      PH.closeModal(); PH.toast("Manutenção registrada."); done && done();
    });
  };
  PH.openConcluir = (m, done) => {
    PH.modal("Concluir manutenção", `<p style="margin:0">${esc(m.tipo)} aberta em ${dbr(m.abertura)}${m.empresa ? " · " + esc(m.empresa) : ""}${m.numero ? ` · <span class="mono">${esc(PH.num(m.numero))}</span> ${esc(m.bem_descricao || "")}` : ""}.</p>
      <fieldset><legend>Encerramento</legend><div class="fg">
        <label>Data de conclusão<input type="date" id="c_data" value="${PH.hoje()}"></label>
        <label>Custo total (R$)<input type="number" id="c_custo" min="0" step="0.01" value="${esc(m.custo || "")}"></label>
        <label class="w6">Serviço executado<textarea id="c_desc">${esc(m.descricao || "")}</textarea></label>
        <label class="w6">Situação do bem<select id="c_sit">${PH.opt(R.SITUACOES.filter(s => s !== "Baixado"), "Em uso")}</select></label>
      </div></fieldset>`, `<button class="btn" data-close>Cancelar</button><button class="btn pri" id="c-ok">Concluir</button>`, { narrow: true });
    PH.$("#c-ok").onclick = e => PH.busy(e.currentTarget, async () => {
      await PH.api("PATCH", `/manutencoes/${m.id}`, { conclusao: PH.val("c_data"), custo: PH.val("c_custo"), descricao: PH.val("c_desc"), situacao_apos: PH.val("c_sit") });
      PH.closeModal(); PH.toast("Manutenção concluída."); PH.invalidate(); done && done();
    });
  };

  /* ---------- Baixa ---------- */
  PH.openBaixa = (b, d, done) => {
    PH.modal("Baixa patrimonial", `<p style="margin:0"><b class="mono">${esc(PH.num(b.numero))}</b> · ${esc(b.descricao)}${d ? ` · valor líquido atual <b>${brl(d.liquido)}</b>` : ""}.</p>
      <div class="callout warn"><span>A baixa retira o bem do ativo, preserva a ficha e o histórico e exige o ato administrativo que a autorizou. Para bens não localizados, conclua antes a apuração de responsabilidade.</span></div>
      <fieldset><legend>Dados da baixa</legend><div class="fg">
        <label class="w6"><span class="req">Motivo</span><select id="x_mot">${PH.opt(R.MOTIVOS_BAIXA, R.isTerceiro(b) ? R.MOTIVOS_BAIXA[6] : "")}</select></label>
        <label><span class="req">Processo / ato que autorizou</span><input type="text" id="x_proc" placeholder="Ex.: Processo 1234/2026, Portaria 15/2026"></label>
        <label>Data<input type="date" id="x_data" value="${PH.hoje()}"></label>
        <label class="w6">Destinatário<input type="text" id="x_dest" placeholder="Arrematante, donatário, órgão recebedor (quando houver)"></label>
        <label class="w6">Observação<textarea id="x_obs" placeholder="Comissão, laudo de avaliação, boletim de ocorrência, sindicância"></textarea></label>
      </div></fieldset>`, `<button class="btn" data-close>Cancelar</button><button class="btn danger" id="x-ok">Confirmar baixa</button>`);
    PH.$("#x-ok").onclick = e => PH.busy(e.currentTarget, async () => {
      await PH.api("POST", `/bens/${b.id}/baixa`, { motivo: PH.val("x_mot"), processo: PH.val("x_proc"), data: PH.val("x_data"), destinatario: PH.val("x_dest"), obs: PH.val("x_obs") });
      PH.closeModal(); PH.toast("Baixa registrada."); done && done();
    });
  };

  /* ---------- Reavaliação / redução ao valor recuperável ---------- */
  PH.openReav = (b, d, done) => {
    PH.modal("Reavaliação do bem", `<p style="margin:0"><b class="mono">${esc(PH.num(b.numero))}</b> · ${esc(b.descricao)} · valor líquido atual <b>${d ? brl(d.liquido) : brl(b.valor)}</b>${d?.encerrada ? " (totalmente depreciado)" : ""}.</p>
      <div class="callout"><span><b>Reavaliação</b>: ajusta o valor ao valor justo, por laudo. <b>Redução ao valor recuperável</b>: reconhece perda quando o valor recuperável é menor que o contábil. Em ambos, informe a vida útil remanescente estimada no laudo (NBC TSP 07 / MCASP).</span></div>
      <fieldset><legend>Avaliação</legend><div class="fg">
        <label class="w6"><span class="req">Tipo</span><select id="r_tipo"><option>Reavaliação</option><option>Redução ao valor recuperável</option></select></label>
        <label><span class="req">Novo valor (R$)</span><input type="number" id="r_valor" min="0" step="0.01"></label>
        <label>Data da avaliação<input type="date" id="r_data" value="${PH.hoje()}"></label>
        <label><span class="req">Vida útil remanescente (anos)</span><input type="number" id="r_vida" min="0.5" step="0.5"></label>
        <label>Valor residual (%)<input type="number" id="r_res" min="0" max="90" value="10"></label>
        <label class="w6"><span class="req">Laudo / relatório de avaliação</span><input type="text" id="r_laudo" placeholder="Nº e data do laudo, empresa ou comissão avaliadora"></label>
        <label class="w6">Avaliadores<input type="text" id="r_av" placeholder="Nomes e matrículas da comissão de avaliação"></label>
      </div></fieldset>`, `<button class="btn" data-close>Cancelar</button><button class="btn pri" id="r-ok">Registrar avaliação</button>`);
    PH.$("#r-ok").onclick = e => PH.busy(e.currentTarget, async () => {
      await PH.api("POST", `/bens/${b.id}/reavaliacao`, { tipo: PH.val("r_tipo"), valor_novo: PH.val("r_valor"), data: PH.val("r_data"), vida_restante: PH.val("r_vida"), residual: PH.val("r_res"), laudo: PH.val("r_laudo"), avaliadores: PH.val("r_av") });
      PH.closeModal(); PH.toast("Avaliação registrada."); PH.invalidate(); done && done();
    });
  };

  /* ---------- Conferência de um bem no inventário ---------- */
  PH.openConferir = (inv, b, done) => {
    PH.modal("Conferir no inventário", `<p style="margin:0"><b class="mono">${esc(PH.num(b.numero))}</b> · ${esc(b.descricao)} · registrado em <b>${esc(b.setor || "—")}</b>.</p>
      <fieldset><legend>Onde e como foi encontrado</legend><div class="fg">
        <label><span>Setor onde está</span><select id="k_set">${PH.setoresDe(inv.unidade_id).map(s => `<option value="${s.id}" ${s.id === b.setor_id ? "selected" : ""}>${esc(s.nome)}</option>`).join("")}</select></label>
        <label><span>Estado de conservação</span><select id="k_cons">${PH.opt(R.CONSERV, b.conservacao)}</select></label>
        <label class="w6">Observação<input type="text" id="k_obs" placeholder="Opcional: plaqueta danificada, sem acessórios…"></label>
      </div></fieldset>`, `<button class="btn" data-close>Cancelar</button><button class="btn pri" id="k-ok">Confirmar conferência</button>`, { narrow: true });
    PH.$("#k-ok").onclick = e => PH.busy(e.currentTarget, async () => {
      const r = await PH.api("POST", `/inventarios/${inv.id}/conferir`, { bem_id: b.id, setor_id: PH.val("k_set"), conservacao: PH.val("k_cons"), observacao: PH.val("k_obs") });
      PH.closeModal(); PH.toast(r.status === "divergente" ? "Conferido com divergência de setor." : "Bem conferido."); PH.invalidate(); done && done();
    });
  };

  /* ================= Inventário ================= */
  PH.route("/inventario", async el => {
    const [invs] = await Promise.all([PH.loadInvs(true), PH.loadCfg()]);
    el.innerHTML = `<div class="sec-head"><div><h1>Inventário</h1><p>Levantamento físico por comissão, com conferência pela câmera e emissão da ata (Lei 4.320/1964, art. 96). Um inventário aberto por unidade.</p></div>
      ${PH.can("inv.manage") ? `<button class="btn pri" id="inv-new">${ICON.plus}Abrir inventário</button>` : ""}</div>
      ${invs.length ? `<div class="tablebox"><table class="t"><thead><tr><th>Unidade</th><th>Tipo</th><th>Ano</th><th>Ato de designação</th><th>Progresso</th><th>Situação</th></tr></thead><tbody>
      ${invs.map(i => { const p = i.total ? Math.round(i.conferidos / i.total * 100) : 0; return `<tr class="link" data-id="${i.id}"><td>${esc(i.unidade)}</td><td>${esc(i.tipo)}</td><td class="mono">${i.ano}</td><td>${esc(i.portaria || "—")}</td><td><span class="mono">${i.conferidos}/${i.total}</span> <span class="hint">${p}%</span></td><td>${i.status === "aberto" ? '<span class="chip info">Aberto</span>' : '<span class="chip ok">Encerrado</span>'}</td></tr>`; }).join("")}
      </tbody></table></div>` : `<div class="panel empty"><h2>Nenhum inventário registrado</h2><p>Abra o inventário informando a unidade, o ato que designou a comissão e seus membros.</p></div>`}`;
    PH.$$("tr[data-id]", el).forEach(t => t.onclick = () => PH.go("#/inventario/" + t.dataset.id));
    const nb = PH.$("#inv-new"); if (nb) nb.onclick = abrirInventario;
  });

  function abrirInventario() {
    const us = PH.unidadesAtivas();
    const membro = (i, f) => `<div class="fg" data-m="${i}"><label class="w2">Nome<input type="text" data-k="nome"></label><label class="w2">Cargo<input type="text" data-k="cargo"></label><label>Matrícula<input type="text" data-k="matricula"></label><label>Função<select data-k="funcao">${PH.opt(["Presidente", "Membro", "Secretário(a)"], f)}</select></label></div>`;
    PH.modal("Abrir inventário", `<fieldset><legend>Inventário</legend><div class="fg">
        <label><span class="req">Unidade</span><select id="i_uni">${us.map(u => `<option value="${u.id}">${esc(u.nome)}</option>`).join("")}</select></label>
        <label>Tipo<select id="i_tipo">${PH.opt(R.TIPOS_INV, "Anual")}</select></label>
        <label>Exercício<input type="number" id="i_ano" value="${new Date().getFullYear()}"></label>
        <label>Ato de designação da comissão<input type="text" id="i_port" placeholder="Ex.: Portaria nº 25/2026"></label></div></fieldset>
      <fieldset><legend>Comissão de inventário</legend><div class="stack" id="i_mem">${membro(0, "Presidente")}${membro(1, "Membro")}${membro(2, "Membro")}</div>
        <button type="button" class="btn sm" id="i_add" style="margin-top:10px">${ICON.plus}Adicionar membro</button></fieldset>`,
      `<button class="btn" data-close>Cancelar</button><button class="btn pri" id="i-ok">Abrir inventário</button>`);
    let n = 3;
    PH.$("#i_add").onclick = () => PH.$("#i_mem").insertAdjacentHTML("beforeend", membro(n++, "Membro"));
    PH.$("#i-ok").onclick = e => PH.busy(e.currentTarget, async () => {
      const comissao = PH.$$("[data-m]").map(r => Object.fromEntries(PH.$$("[data-k]", r).map(x => [x.dataset.k, x.value.trim()]))).filter(m => m.nome);
      const inv = await PH.api("POST", "/inventarios", { unidade_id: PH.val("i_uni"), tipo: PH.val("i_tipo"), ano: PH.val("i_ano"), portaria: PH.val("i_port"), comissao });
      PH.closeModal(); PH.invalidate(); PH.go("#/inventario/" + inv.id);
    });
  }

  PH.route("/inventario/:id", async (el, id) => {
    const [inv] = await Promise.all([PH.api("GET", "/inventarios/" + id), PH.loadBens(true), PH.loadCfg()]);
    const aberto = inv.status === "aberto";
    const im = Object.fromEntries(inv.itens.map(i => [i.bem_id, i]));
    const bens = S.bens.filter(b => b.unidade_id === inv.unidade_id && R.ativo(b));
    const conf = bens.filter(b => im[b.id]), div = bens.filter(b => im[b.id]?.status === "divergente"), pend = bens.filter(b => !im[b.id]);
    const pct = bens.length ? Math.round(conf.length / bens.length * 100) : 0;
    const porSetor = {}; pend.forEach(b => { (porSetor[b.setor || "Sem setor"] = porSetor[b.setor || "Sem setor"] || []).push(b); });
    const canConf = aberto && PH.can("inv.conferir");
    el.innerHTML = `<div class="sec-head"><div><a href="#/inventario" class="hint">← Inventários</a><h1>Inventário ${esc(inv.tipo.toLowerCase())} ${inv.ano} · ${esc(inv.unidade)}</h1>
      <p>${esc(inv.portaria || "Sem ato de designação informado")} · comissão: ${esc(inv.comissao.map(m => m.nome + (m.funcao && m.funcao !== "Membro" ? ` (${m.funcao})` : "")).join(", "))}</p></div>
      <div class="row"><a class="btn" href="/docs/ata/${inv.id}" target="_blank" rel="noopener">${ICON.doc}${aberto ? "Prévia da ata" : "Ata do inventário"}</a>${aberto && PH.can("inv.manage") ? `<button class="btn" id="inv-close">Encerrar inventário</button>` : ""}</div></div>
      <div class="stack">
      <div class="kpis">
        <div class="kpi"><div class="l">Conferidos</div><div class="v">${conf.length} / ${bens.length}</div><div class="meter"><i style="width:${pct}%"></i></div></div>
        <div class="kpi ${pend.length ? "warn" : "ok"}"><div class="l">Pendentes</div><div class="v">${pend.length}</div><div class="s">em ${Object.keys(porSetor).length} setor(es)</div></div>
        <div class="kpi ${div.length ? "warn" : ""}"><div class="l">Divergências de setor</div><div class="v">${div.length}</div><div class="s">regularizar por transferência</div></div>
        <div class="kpi"><div class="l">Situação</div><div class="v">${aberto ? "Aberto" : "Encerrado"}</div><div class="s">desde ${PH.dtbr(inv.aberto_em)}</div></div>
      </div>
      ${canConf ? `<div class="panel"><h2>Conferência</h2>
        <div class="row"><button class="btn pri" id="k-scan">${ICON.qr}Conferir pela câmera</button><form class="row" id="k-form" style="flex:1;min-width:260px"><input type="text" id="k-num" inputmode="numeric" placeholder="ou digite o nº da plaqueta e tecle Enter" aria-label="Número de patrimônio" style="flex:1;min-width:180px"><button class="btn" type="submit">Conferir</button></form></div>
        <p class="hint" id="k-msg" style="margin:8px 0 0">Na câmera, as etiquetas são conferidas em sequência no setor de registro. Para bem fora do lugar, abra a ficha e use “Conferir este bem” informando o setor onde está.</p></div>` : ""}
      ${div.length ? `<div class="panel"><h2>Divergências de setor</h2><ul class="list">${div.map(b => `<li class="link warn" data-bem="${esc(b.id)}"><i class="stripe"></i><div class="t"><b>${esc(b.descricao)}</b><span><span class="mono">${esc(PH.num(b.numero))}</span> · registrado em ${esc(b.setor)}, encontrado em ${esc(im[b.id].setor_encontrado)}</span></div>${PH.can("transf") ? `<button class="btn sm" data-reg="${esc(b.id)}" data-set="${im[b.id].setor_id}">Regularizar</button>` : "<span></span>"}</li>`).join("")}</ul></div>` : ""}
      ${pend.length ? Object.entries(porSetor).sort().map(([s, l]) => `<div class="panel"><h2>${esc(s)} <small>${l.length} pendente(s)</small></h2><ul class="list">${l.map(b => `<li class="link" data-bem="${esc(b.id)}"><i class="stripe"></i><div class="t"><b>${esc(b.descricao)}</b><span><span class="mono">${esc(PH.num(b.numero))}</span>${b.local ? " · " + esc(b.local) : ""}${b.responsavel ? " · " + esc(b.responsavel) : ""}</span></div>${canConf ? `<button class="btn sm" data-ok="${esc(b.id)}">Localizado</button>` : "<span></span>"}</li>`).join("")}</ul></div>`).join("")
        : `<div class="panel empty"><h2>Todos os bens foram conferidos</h2><p>${aberto ? "Encerre o inventário para emitir a ata definitiva." : "Inventário concluído."}</p></div>`}
      ${conf.length ? `<div class="panel"><h2>Conferidos <small>últimos 30</small></h2><ul class="list">${inv.itens.slice().sort((a, b) => a.em < b.em ? 1 : -1).slice(0, 30).map(i => { const b = S.bens.find(x => x.id === i.bem_id) || {}; return `<li class="${i.status === "divergente" ? "warn" : "ok"}"><i class="stripe"></i><div class="t"><b>${esc(b.descricao || "Bem")}</b><span><span class="mono">${esc(PH.num(b.numero))}</span> · ${esc(i.setor_encontrado || "")} · ${esc(i.por || "")} ${PH.dtbr(i.em)}</span></div>${canConf ? `<button class="btn sm ghost" data-undo="${esc(i.bem_id)}">Desfazer</button>` : "<span></span>"}</li>`; }).join("")}</ul></div>` : ""}
      </div>`;
    const reload = () => PH.render();
    PH.$$("[data-bem]", el).forEach(li => li.addEventListener("click", e => { if (!e.target.closest("button")) PH.go("#/bem/" + li.dataset.bem); }));
    const conferir = async payload => { const r = await PH.api("POST", `/inventarios/${inv.id}/conferir`, payload); PH.invalidate(); return r; };
    PH.$$("[data-ok]", el).forEach(x => x.onclick = async () => { x.disabled = true; try { await conferir({ bem_id: x.dataset.ok }); PH.toast("Bem conferido."); reload(); } catch (e) { PH.toast(e.message, true); x.disabled = false; } });
    PH.$$("[data-undo]", el).forEach(x => x.onclick = async () => { try { await PH.api("DELETE", `/inventarios/${inv.id}/itens/${x.dataset.undo}`); reload(); } catch (e) { PH.toast(e.message, true); } });
    PH.$$("[data-reg]", el).forEach(x => x.onclick = () => PH.openTransf([x.dataset.reg], reload));
    const kf = PH.$("#k-form");
    if (kf) kf.onsubmit = async e => {
      e.preventDefault(); const code = PH.parseCode(PH.val("k-num")), msg = PH.$("#k-msg");
      if (!code) { msg.textContent = "Digite o número da plaqueta."; return; }
      try { const r = await conferir({ numero: code.numero }); PH.toast(`${PH.num(r.numero)} · ${r.descricao} conferido.`); reload(); setTimeout(() => PH.$("#k-num")?.focus(), 100); }
      catch (err) { msg.textContent = err.message; }
    };
    const ks = PH.$("#k-scan");
    if (ks) ks.onclick = () => {
      let n = 0;
      PH.scan({ titulo: `Inventário ${inv.ano} · ${inv.unidade}`, onCode: async (code, say) => {
        if (code.slug && code.slug !== S.me.tenant.slug) { say("Etiqueta de outra entidade."); return false; }
        try { const r = await conferir({ numero: code.numero }); n++; say(`✓ ${PH.num(r.numero)} · ${r.descricao} (${n} nesta leitura)`); }
        catch (err) { say(err.message); }
        return false;
      } }).then(() => {});
      const obs = new MutationObserver(() => { if (!document.querySelector(".scanner")) { obs.disconnect(); if (n) reload(); } });
      obs.observe(document.body, { childList: true });
    };
    const cl = PH.$("#inv-close");
    if (cl) cl.onclick = () => {
      PH.modal("Encerrar inventário", `<p style="margin:0">${pend.length ? `<b>${pend.length} bem(ns) não foram localizados</b> e constarão da ata como não localizados.` : "Todos os bens foram localizados."}${div.length ? ` ${div.length} divergência(s) de setor constarão da ata.` : ""} Após o encerramento não é possível registrar novas conferências.</p>
        <label class="f" style="display:grid;gap:4px;font-size:13px;color:var(--muted)">Considerações finais da comissão<textarea id="e_obs" rows="5" placeholder="Registre recomendações, ocorrências e encaminhamentos. Se vazio, a ata usa o texto padrão de encerramento."></textarea></label>`,
        `<button class="btn" data-close>Cancelar</button><button class="btn pri" id="e-ok">Encerrar e emitir ata</button>`, { narrow: true });
      PH.$("#e-ok").onclick = e => PH.busy(e.currentTarget, async () => {
        await PH.api("POST", `/inventarios/${inv.id}/encerrar`, { observacoes: PH.val("e_obs") });
        PH.closeModal(); PH.invalidate(); PH.toast("Inventário encerrado."); reload(); window.open(`/docs/ata/${inv.id}`, "_blank", "noopener");
      });
    };
  }, { perm: null });

  /* ================= Engenharia clínica ================= */
  PH.route("/engenharia", async el => {
    const E = await PH.api("GET", "/engenharia");
    const meses = {};
    E.agenda.forEach(x => { const k = x.data ? x.data.slice(0, 7) : "0000-00"; (meses[k] = meses[k] || []).push(x); });
    const nomeMes = k => k === "0000-00" ? "Sem registro" : new Date(k + "-15T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const hojeM = PH.hoje().slice(0, 7);
    const pctDia = E.comPlano ? Math.round(E.emDia / E.comPlano * 100) : 0;
    el.innerHTML = `<div class="sec-head"><div><h1>Engenharia clínica</h1><p>Equipamentos médico-hospitalares: programação de manutenção, disponibilidade e custos (RDC Anvisa 509/2021).</p></div>
      <a class="btn" href="/docs/plano-manutencao" target="_blank" rel="noopener">${ICON.doc}Plano de manutenção</a></div>
      <div class="stack">
      <div class="kpis">
        <div class="kpi"><div class="l">Equipamentos de saúde</div><div class="v">${E.total}</div><div class="s">${E.comPlano} com periodicidade cadastrada</div></div>
        <div class="kpi ${pctDia < 80 ? "warn" : "ok"}"><div class="l">Manutenção em dia</div><div class="v">${pctDia}%</div><div class="s">${E.emDia} de ${E.comPlano}</div></div>
        <div class="kpi"><div class="l">Disponibilidade</div><div class="v">${E.disponibilidade == null ? "—" : Math.round(E.disponibilidade * 100) + "%"}</div><div class="s">${E.emManutencao} em manutenção agora</div></div>
        <div class="kpi"><div class="l">Tempo médio de reparo</div><div class="v">${E.mttr == null ? "—" : E.mttr.toFixed(1).replace(".", ",") + " d"}</div><div class="s">${E.corretivas12} corretiva(s) em 12 meses</div></div>
        <div class="kpi"><div class="l">Custo de manutenção</div><div class="v">${brl(E.custo12)}</div><div class="s">últimos 12 meses</div></div>
      </div>
      ${E.abertas.length ? `<div class="panel"><h2>Ordens de serviço abertas <small>${E.abertas.length}</small></h2><ul class="list">${E.abertas.map(m => `<li class="${m.dias > 15 ? "bad" : "warn"}"><i class="stripe"></i><div class="t link" data-bem="${esc(m.bem_id)}"><b>${esc(m.tipo)} · ${esc(m.bem_descricao)} <span class="mono" style="display:inline">${esc(PH.num(m.numero))}</span></b><span>${esc(m.setor || "")} · aberta há ${m.dias} dia(s)${m.empresa ? " · " + esc(m.empresa) : ""}</span></div>${PH.can("manut.write") ? `<button class="btn sm" data-fin="${m.id}">Concluir</button>` : "<span></span>"}</li>`).join("")}</ul></div>` : ""}
      <div class="panel"><h2>Agenda de preventivas e calibrações <small>próximos 12 meses</small></h2>
        ${E.agenda.length ? `<div class="months">${Object.keys(meses).sort().map(k => `<div class="month"><h3><span>${nomeMes(k)}</span><span class="mono">${meses[k].length}</span></h3><ul>${meses[k].map(x => `<li data-bem="${esc(x.id)}" title="${esc(x.descricao)} · ${esc(x.setor || "")}"><span class="mono">${x.data ? x.data.slice(8, 10) : "--"}</span>${x.vencido || (x.data && x.data.slice(0, 7) < hojeM) ? '<span class="chip bad plain">vencida</span>' : ""}<span>${esc(x.tipo === "Calibração" ? "Cal." : "Prev.")} ${esc(x.descricao)}</span></li>`).join("")}</ul></div>`).join("")}</div>` : `<p class="empty">Cadastre a periodicidade de preventiva e calibração na ficha dos equipamentos de saúde para montar a agenda.</p>`}
      </div>
      <div class="grid3">
        <div class="panel"><h2>Possíveis antieconômicos <small>custo 12 m ≥ ${E.limite}% do valor</small></h2>
          ${E.antieconomicos.length ? `<ul class="list">${E.antieconomicos.map(a => `<li class="link bad" data-bem="${esc(a.id)}"><i class="stripe"></i><div class="t"><b>${esc(a.descricao)}</b><span><span class="mono">${esc(PH.num(a.numero))}</span> · ${brl(a.custo12)} em 12 meses (${a.pct}% de ${brl(a.valor)}) · ${a.corretivas} corretiva(s)</span></div><span></span></li>`).join("")}</ul><p class="hint">Critério interno de alerta, configurável. A classificação como antieconômico depende de avaliação técnica.</p>` : `<p class="hint">Nenhum equipamento acima do limite configurado.</p>`}</div>
        <div class="panel"><h2>Sem registro Anvisa informado <small>${E.semRegistroAnvisa.length}</small></h2>
          ${E.semRegistroAnvisa.length ? `<ul class="list">${E.semRegistroAnvisa.slice(0, 12).map(a => `<li class="link warn" data-bem="${esc(a.id)}"><i class="stripe"></i><div class="t"><b>${esc(a.descricao)}</b><span><span class="mono">${esc(PH.num(a.numero))}</span> · ${esc(a.setor || "")}</span></div><span></span></li>`).join("")}</ul>${E.semRegistroAnvisa.length > 12 ? `<p class="count">E mais ${E.semRegistroAnvisa.length - 12}.</p>` : ""}` : `<p class="hint">Todos os equipamentos têm registro informado.</p>`}</div>
      </div></div>`;
    PH.$$("[data-bem]", el).forEach(x => x.addEventListener("click", e => { if (!e.target.closest("button")) PH.go("#/bem/" + x.dataset.bem); }));
    PH.$$("[data-fin]", el).forEach(x => x.onclick = () => { const m = E.abertas.find(y => String(y.id) === x.dataset.fin); PH.openConcluir(m, () => PH.render()); });
  });
})();
