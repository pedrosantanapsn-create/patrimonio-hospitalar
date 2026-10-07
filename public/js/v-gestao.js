/* Telas de gestão: relatórios, configurações, usuários, auditoria, plataforma, login e troca de senha. */
(function () {
  "use strict";
  const PH = window.PH, R = PH.R, S = PH.S, { esc, dbr, ICON } = PH;
  const NATUREZA = { direta: "Administração direta", indireta: "Administração indireta (autarquia, fundação)", os: "Organização Social (contrato de gestão)", outra: "Outra" };

  /* ================= Relatórios ================= */
  PH.route("/relatorios", async el => {
    await PH.loadCfg();
    const guias = await PH.api("GET", "/guias");
    const setores = S.cfg.setores.filter(s => s.ativo);
    const setOpts = setores.map(s => `<option value="${s.id}">${esc(s.unidade)} · ${esc(s.nome)}</option>`).join("");
    el.innerHTML = `<div class="sec-head"><div><h1>Relatórios e documentos</h1><p>Documentos formatados para impressão em A4 (padrão ABNT), com campos de assinatura. Use “Imprimir ou salvar em PDF” na página do documento.</p></div></div>
    <div class="stack"><div class="grid3">
      <div class="panel"><h2>Termo de responsabilidade</h2><p class="hint">Relação dos bens de um setor para assinatura do responsável (Lei 4.320/1964, art. 94).</p>
        <div class="row"><select id="r-termo" style="flex:1;min-width:180px">${setOpts}</select><button class="btn pri" data-doc="termo">${ICON.doc}Abrir</button></div></div>
      <div class="panel"><h2>Etiquetas com QR Code</h2><p class="hint">Folha A4 de etiquetas autoadesivas. Também é possível imprimir etiquetas de bens selecionados na lista.</p>
        <div class="row"><select id="r-etq" style="flex:1;min-width:180px"><option value="">Todos os bens ativos</option>${setOpts}</select><select id="r-etq-m" style="width:auto"><option value="padrao">3 × 8</option><option value="grande">2 × 7</option></select><button class="btn pri" data-doc="etq">${ICON.qr}Abrir</button></div></div>
      <div class="panel"><h2>Demonstrativo por conta contábil</h2><p class="hint">Custo, depreciação acumulada e valor líquido por conta do PCASP, para conciliação com a contabilidade.</p>
        <div class="row"><input type="date" id="r-ref" value="${PH.hoje()}" style="flex:1;min-width:150px" aria-label="Data de referência"><button class="btn pri" data-doc="contas">${ICON.doc}Abrir</button></div></div>
      <div class="panel"><h2>Bens inservíveis</h2><p class="hint">Relação por classificação (ocioso, recuperável, antieconômico, irrecuperável) para a comissão de desfazimento.</p>
        <a class="btn pri" href="/docs/inserviveis" target="_blank" rel="noopener">${ICON.doc}Abrir</a></div>
      <div class="panel"><h2>Plano de manutenção</h2><p class="hint">Programação de preventivas e calibrações dos próximos 12 meses.</p>
        <a class="btn pri" href="/docs/plano-manutencao" target="_blank" rel="noopener">${ICON.doc}Abrir</a></div>
      <div class="panel"><h2>Planilha do inventário</h2><p class="hint">CSV com todos os campos, separado por ponto e vírgula, abre no Excel.</p>
        <div class="row"><a class="btn pri" href="/docs/bens.csv">${ICON.dl}Bens ativos</a><a class="btn" href="/docs/bens.csv?todos=1">${ICON.dl}Incluir baixados</a></div></div>
    </div>
    <div class="panel"><h2>Guias de transferência <small>${guias.length} recente(s)</small></h2>
      ${guias.length ? `<div class="tablebox"><table class="t"><thead><tr><th>Guia</th><th>Data</th><th>Destino</th><th>Responsável</th><th class="r">Bens</th><th>Emitida por</th><th></th></tr></thead><tbody>
      ${guias.map(g => `<tr><td class="mono">${g.numero}/${g.ano}</td><td class="mono">${dbr(g.data)}</td><td>${esc(g.destino.unidade)} · ${esc(g.destino.setor)}</td><td>${esc(g.destino.responsavel)}</td><td class="r num">${g.qtd}</td><td>${esc(g.por || "")}</td><td><a class="btn sm" href="/docs/guia/${g.id}" target="_blank" rel="noopener">Abrir</a></td></tr>`).join("")}</tbody></table></div>` : `<p class="hint">Nenhuma transferência registrada.</p>`}
    </div></div>`;
    const open = u => window.open(u, "_blank", "noopener");
    PH.$("[data-doc=termo]", el).onclick = () => { const v = PH.val("r-termo"); if (v) open("/docs/termo?setor_id=" + v); else PH.toast("Cadastre setores primeiro.", true); };
    PH.$("[data-doc=etq]", el).onclick = () => { const v = PH.val("r-etq"); open(`/docs/etiquetas?modelo=${PH.val("r-etq-m")}${v ? "&setor_id=" + v : ""}`); };
    PH.$("[data-doc=contas]", el).onclick = () => open("/docs/contas?ref=" + PH.val("r-ref"));
  });

  /* ================= Configurações da entidade ================= */
  PH.route("/config", async el => {
    const cfg = await PH.loadCfg(true), t = cfg.tenant, c = t.config || {};
    el.innerHTML = `<div class="sec-head"><div><h1>Configurações</h1><p>Dados da entidade usados nos documentos, unidades hospitalares e setores.</p></div>
      <div class="row"><a class="btn" href="#/usuarios">${ICON.user}Usuários</a><a class="btn" href="#/auditoria">Trilha de auditoria</a></div></div>
    <div class="stack">
    <fieldset><legend>Entidade</legend><div class="fg">
      <label class="w4">Nome da entidade<input type="text" id="c_nome" value="${esc(t.nome)}"></label>
      <label class="w2">CNPJ<input type="text" id="c_cnpj" value="${esc(t.cnpj)}"></label>
      <label class="w4">Natureza jurídica<select id="c_nat">${PH.opt(Object.keys(NATUREZA), t.natureza, Object.values(NATUREZA))}</select></label>
      <label class="w2">Prefixo da plaqueta<input type="text" id="c_pref" value="${esc(t.prefixo)}" maxlength="8"></label>
      <label class="w4">Ente público proprietário dos bens<input type="text" id="c_ente" value="${esc(t.ente)}" placeholder="Ex.: Prefeitura Municipal de …"><span class="hint">Em gestão por OS, os bens adquiridos com recursos do contrato pertencem ao ente.</span></label>
      <label class="w2">Contrato de gestão / instrumento<input type="text" id="c_contr" value="${esc(t.contrato)}"></label>
      <label class="w2">Cidade (para datar documentos)<input type="text" id="c_cid" value="${esc(c.cidade)}"></label>
      <label class="w2">Responsável pelo patrimônio<input type="text" id="c_gest" value="${esc(c.gestor_patrimonio)}"><span class="hint">Assina termos e relatórios.</span></label>
      <label class="w2">Alerta de antieconômico (%)<input type="number" id="c_lim" min="10" max="100" value="${esc(c.limite_antieconomico ?? 50)}"><span class="hint">Custo de manutenção em 12 meses em relação ao valor do bem.</span></label>
    </div><div class="row" style="margin-top:12px"><p class="err" id="c_err"></p><span class="spacer"></span><button class="btn pri" id="c-save">Salvar entidade</button></div></fieldset>

    <div class="panel"><h2>Unidades <small>${cfg.unidades.length}</small></h2>
      <div class="tablebox"><table class="t"><thead><tr><th>Unidade</th><th>CNES</th><th>Setores</th><th>Situação</th><th></th></tr></thead><tbody>
      ${cfg.unidades.map(u => `<tr><td>${esc(u.nome)}</td><td class="mono">${esc(u.cnes || "—")}</td><td>${cfg.setores.filter(s => s.unidade_id === u.id && s.ativo).length}</td><td>${u.ativo ? '<span class="chip ok">Ativa</span>' : '<span class="chip mute">Inativa</span>'}</td><td><button class="btn sm" data-eu="${u.id}">Editar</button></td></tr>`).join("") || `<tr><td colspan="5" class="hint">Nenhuma unidade.</td></tr>`}
      </tbody></table></div>
      <div class="fg" style="margin-top:12px"><label class="w4">Nova unidade<input type="text" id="u_nome" placeholder="Ex.: Hospital Municipal …"></label><label class="w2">CNES<input type="text" id="u_cnes"></label></div>
      <div class="row" style="margin-top:8px"><span class="spacer"></span><button class="btn" id="u-add">${ICON.plus}Adicionar unidade</button></div></div>

    <div class="panel"><h2>Setores</h2>
      ${cfg.unidades.length ? `<div class="fg"><label class="w2">Unidade<select id="s_uni">${cfg.unidades.filter(u => u.ativo).map(u => `<option value="${u.id}">${esc(u.nome)}</option>`).join("")}</select></label>
        <label class="w4">Novos setores (um por linha)<textarea id="s_nomes" rows="3" placeholder="Pronto-Socorro&#10;UTI Adulto&#10;Centro Cirúrgico"></textarea></label></div>
        <div class="row" style="margin-top:8px"><span class="spacer"></span><button class="btn" id="s-add">${ICON.plus}Adicionar setores</button></div>
        <div class="row" style="margin-top:12px">${cfg.setores.map(s => `<span class="chip ${s.ativo ? "plain" : "mute plain"}">${esc(s.unidade)} · ${esc(s.nome)} <button class="btn sm ghost" data-ts="${s.id}" data-on="${s.ativo ? 0 : 1}" title="${s.ativo ? "Desativar" : "Reativar"}">${s.ativo ? "×" : "↺"}</button></span>`).join("")}</div>`
        : `<p class="hint">Cadastre uma unidade primeiro.</p>`}
    </div></div>`;
    const err = PH.$("#c_err");
    PH.$("#c-save").onclick = async () => {
      err.textContent = "";
      try {
        await PH.api("PUT", "/cfg/entidade", { nome: PH.val("c_nome"), cnpj: PH.val("c_cnpj"), natureza: PH.val("c_nat"), prefixo: PH.val("c_pref"), ente: PH.val("c_ente"), contrato: PH.val("c_contr"), cidade: PH.val("c_cid"), gestor_patrimonio: PH.val("c_gest"), limite_antieconomico: PH.val("c_lim") });
        await PH.boot(); PH.toast("Entidade atualizada.");
      } catch (e) { err.textContent = e.message; }
    };
    PH.$("#u-add").onclick = async () => { try { await PH.api("POST", "/cfg/unidades", { nome: PH.val("u_nome"), cnes: PH.val("u_cnes") }); S.cfg = null; PH.render(); PH.toast("Unidade adicionada."); } catch (e) { PH.toast(e.message, true); } };
    const sa = PH.$("#s-add"); if (sa) sa.onclick = async () => { try { const r = await PH.api("POST", "/cfg/setores", { unidade_id: PH.val("s_uni"), nome: PH.$("#s_nomes").value }); S.cfg = null; PH.render(); PH.toast(`${r.length} setor(es) adicionado(s).`); } catch (e) { PH.toast(e.message, true); } };
    PH.$$("[data-ts]", el).forEach(x => x.onclick = async () => { const s = cfg.setores.find(y => String(y.id) === x.dataset.ts); try { await PH.api("PATCH", "/cfg/setores/" + s.id, { nome: s.nome, ativo: x.dataset.on === "1" }); S.cfg = null; PH.render(); } catch (e) { PH.toast(e.message, true); } });
    PH.$$("[data-eu]", el).forEach(x => x.onclick = () => {
      const u = cfg.unidades.find(y => String(y.id) === x.dataset.eu);
      PH.modal("Editar unidade", `<div class="fg"><label class="w6">Nome<input type="text" id="eu_nome" value="${esc(u.nome)}"></label><label>CNES<input type="text" id="eu_cnes" value="${esc(u.cnes)}"></label><label>Situação<select id="eu_at">${PH.opt(["1", "0"], u.ativo ? "1" : "0", ["Ativa", "Inativa"])}</select></label><label class="w6">Endereço<input type="text" id="eu_end" value="${esc(u.endereco)}"></label></div>`,
        `<button class="btn" data-close>Cancelar</button><button class="btn pri" id="eu-ok">Salvar</button>`, { narrow: true });
      PH.$("#eu-ok").onclick = e => PH.busy(e.currentTarget, async () => { await PH.api("PATCH", "/cfg/unidades/" + u.id, { nome: PH.val("eu_nome"), cnes: PH.val("eu_cnes"), endereco: PH.val("eu_end"), ativo: PH.val("eu_at") === "1" }); PH.closeModal(); S.cfg = null; PH.render(); });
    });
  }, { perm: "cfg" });

  /* ================= Usuários ================= */
  const senhaModal = (titulo, nome, email, senha) => PH.modal(titulo, `<p style="margin:0">Entregue ao usuário <b>${esc(nome)}</b> (${esc(email)}) por um canal seguro. No primeiro acesso ele deverá criar uma senha própria.</p>
    <div class="secret" id="pw">${esc(senha)}</div><p class="hint" style="margin:0">Esta senha provisória não será exibida novamente.</p>`, `<button class="btn" id="pw-copy">Copiar senha</button><button class="btn pri" data-close>Concluído</button>`, { narrow: true, noFocus: true });
  const wireCopy = senha => { PH.$("#pw-copy").onclick = () => navigator.clipboard?.writeText(senha).then(() => PH.toast("Senha copiada."), () => PH.toast("Selecione e copie a senha.")); };

  PH.route("/usuarios", async el => {
    const us = await PH.api("GET", "/usuarios");
    el.innerHTML = `<div class="sec-head"><div><a href="#/config" class="hint">← Configurações</a><h1>Usuários</h1><p>Cada servidor tem login próprio e perfil de acesso. Todas as operações ficam registradas na trilha de auditoria.</p></div><button class="btn pri" id="nu">${ICON.plus}Novo usuário</button></div>
      <div class="tablebox"><table class="t"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Último acesso</th><th>Situação</th><th></th></tr></thead><tbody>
      ${us.map(u => `<tr><td><b>${esc(u.nome)}</b><br><span class="hint">${esc([u.cargo, u.matricula && "mat. " + u.matricula].filter(Boolean).join(" · "))}</span></td><td>${esc(u.email)}</td><td>${esc(S.me.papeis[u.papel] || u.papel)}</td><td class="mono">${u.ultimo_login ? PH.dtbr(u.ultimo_login) : "nunca"}</td><td>${u.ativo ? (u.must_change ? '<span class="chip warn">Senha provisória</span>' : '<span class="chip ok">Ativo</span>') : '<span class="chip mute">Inativo</span>'}</td><td><button class="btn sm" data-u="${u.id}">Editar</button></td></tr>`).join("")}
      </tbody></table></div>
      <div class="panel" style="margin-top:16px"><h2>Perfis de acesso</h2><dl class="kv">
        <div><dt>Administrador da entidade</dt><dd>Tudo, incluindo usuários, configurações, exclusão de cadastro e auditoria.</dd></div>
        <div><dt>Setor de Patrimônio</dt><dd>Cadastra, transfere, reavalia, baixa e gerencia inventários.</dd></div>
        <div><dt>Engenharia clínica</dt><dd>Registra manutenções e atualiza dados técnicos dos equipamentos de saúde.</dd></div>
        <div><dt>Comissão de inventário</dt><dd>Confere bens nos inventários abertos.</dd></div>
        <div><dt>Somente consulta</dt><dd>Vê bens e documentos, sem alterar nada.</dd></div></dl></div>`;
    const papelSel = v => `<select id="u_papel">${PH.opt(Object.keys(S.me.papeis), v, Object.values(S.me.papeis))}</select>`;
    PH.$("#nu").onclick = () => {
      PH.modal("Novo usuário", `<div class="fg"><label class="w6"><span class="req">Nome completo</span><input type="text" id="u_nome"></label><label class="w6"><span class="req">E-mail</span><input type="email" id="u_email"></label>
        <label>Cargo<input type="text" id="u_cargo"></label><label>Matrícula<input type="text" id="u_mat"></label><label class="w6">Perfil${papelSel("consulta")}</label></div>`,
        `<button class="btn" data-close>Cancelar</button><button class="btn pri" id="u-ok">Criar usuário</button>`, { narrow: true });
      PH.$("#u-ok").onclick = e => PH.busy(e.currentTarget, async () => {
        const u = await PH.api("POST", "/usuarios", { nome: PH.val("u_nome"), email: PH.val("u_email"), cargo: PH.val("u_cargo"), matricula: PH.val("u_mat"), papel: PH.val("u_papel") });
        senhaModal("Usuário criado", u.nome, u.email, u.senha_provisoria); wireCopy(u.senha_provisoria);
        PH.$("#modal-root [data-close]")?.addEventListener("click", () => PH.render());
      });
    };
    PH.$$("[data-u]", el).forEach(x => x.onclick = () => {
      const u = us.find(y => String(y.id) === x.dataset.u);
      PH.modal("Editar usuário", `<div class="fg"><label class="w6">Nome<input type="text" id="u_nome" value="${esc(u.nome)}"></label><label>Cargo<input type="text" id="u_cargo" value="${esc(u.cargo)}"></label><label>Matrícula<input type="text" id="u_mat" value="${esc(u.matricula)}"></label>
        <label>Perfil${papelSel(u.papel)}</label><label>Situação<select id="u_at">${PH.opt(["1", "0"], u.ativo ? "1" : "0", ["Ativo", "Inativo (sem acesso)"])}</select></label></div>
        <div class="callout"><span style="flex:1">Esqueceu a senha? Gere uma senha provisória; as sessões abertas do usuário serão encerradas.</span><button class="btn" id="u-reset">Redefinir senha</button></div>`,
        `<button class="btn" data-close>Cancelar</button><button class="btn pri" id="u-ok">Salvar</button>`, { narrow: true });
      PH.$("#u-ok").onclick = e => PH.busy(e.currentTarget, async () => { await PH.api("PATCH", "/usuarios/" + u.id, { nome: PH.val("u_nome"), cargo: PH.val("u_cargo"), matricula: PH.val("u_mat"), papel: PH.val("u_papel"), ativo: PH.val("u_at") === "1" }); PH.closeModal(); PH.toast("Usuário atualizado."); PH.render(); });
      PH.$("#u-reset").onclick = async () => { try { const r = await PH.api("POST", `/usuarios/${u.id}/reset`); senhaModal("Senha redefinida", u.nome, u.email, r.senha_provisoria); wireCopy(r.senha_provisoria); } catch (e) { PH.toast(e.message, true); } };
    });
  }, { perm: "users" });

  /* ================= Trilha de auditoria ================= */
  const ACOES = { criar: "Criação", alterar: "Alteração", excluir: "Exclusão", transferir: "Transferência", baixar: "Baixa", reavaliar: "Reavaliação", registrar: "Registro", concluir: "Conclusão", conferir: "Conferência", abrir: "Abertura", encerrar: "Encerramento", login: "Acesso", logout: "Saída", login_falhou: "Acesso recusado", senha_alterada: "Troca de senha", redefinir_senha: "Senha redefinida", adicionar_foto: "Foto adicionada", remover_foto: "Foto removida", suporte_entrar: "Acesso do suporte", suporte_sair: "Saída do suporte", desfazer_conferencia: "Conferência desfeita", sugestao_ia: "Sugestão por IA", suspender: "Suspensão", reativar: "Reativação" };
  PH.route("/auditoria", async el => {
    let rows = await PH.api("GET", "/auditoria?limit=100");
    const draw = () => {
      el.innerHTML = `<div class="sec-head"><div><a href="#/config" class="hint">← Configurações</a><h1>Trilha de auditoria</h1><p>Registro permanente de quem fez o quê e quando. O banco de dados impede alterar ou apagar estes registros (Decreto 10.540/2020).</p></div></div>
      <div class="tablebox"><table class="t"><thead><tr><th>Data e hora</th><th>Usuário</th><th>Operação</th><th>Objeto</th><th>Detalhe</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td class="mono">${PH.dtbr(r.em)}</td><td>${esc(r.user_nome || "—")}<br><span class="hint mono">${esc(r.ip || "")}</span></td><td>${esc(ACOES[r.acao] || r.acao)}</td><td>${esc(r.entidade)}${r.entidade === "bem" && r.entidade_id ? ` <a href="#/bem/${esc(r.entidade_id)}">abrir</a>` : r.entidade_id ? ` <span class="mono hint">${esc(String(r.entidade_id).slice(0, 8))}</span>` : ""}</td><td class="hint">${esc(resumo(r))}</td></tr>`).join("")}
      </tbody></table></div>${rows.length && rows.length % 100 === 0 ? `<div class="row" style="justify-content:center;margin-top:12px"><button class="btn" id="more">Carregar mais</button></div>` : ""}`;
      const m = PH.$("#more"); if (m) m.onclick = async () => { rows = rows.concat(await PH.api("GET", "/auditoria?limit=100&before=" + rows[rows.length - 1].id)); draw(); };
    };
    const resumo = r => {
      const d = r.depois || {}, a = r.antes || {};
      if (r.entidade === "bem" && r.acao === "alterar") return Object.keys(d).filter(k => !["atualizado_em", "atualizado_por"].includes(k) && JSON.stringify(d[k]) !== JSON.stringify(a[k])).slice(0, 6).join(", ");
      if (r.entidade === "bem" && r.acao === "criar") return `nº ${d.numero} · ${d.descricao}`;
      if (r.acao === "excluir") return `nº ${a.numero} · ${a.descricao} · motivo: ${d.motivo}`;
      if (r.acao === "baixar") return `${d.baixa?.motivo || ""} · ${d.baixa?.processo || ""}`;
      if (r.acao === "transferir") return `${(a.origem || []).length} bem(ns) → ${d.destino?.setor || ""}`;
      if (r.acao === "login_falhou") return d.email || "";
      return "";
    };
    draw();
  }, { perm: "audit" });

  /* ================= Plataforma (equipe da consultoria) ================= */
  PH.route("/plataforma", async el => {
    const ts = await PH.api("GET", "/plataforma/tenants");
    el.innerHTML = `<div class="sec-head"><div><h1>Plataforma</h1><p>Entidades contratantes. Cada entidade tem seus dados isolados, usuários próprios e numeração patrimonial independente.</p></div><button class="btn pri" id="nt">${ICON.plus}Nova entidade</button></div>
      ${ts.length ? `<div class="tablebox"><table class="t"><thead><tr><th>Entidade</th><th>Natureza</th><th class="r">Unidades</th><th class="r">Bens ativos</th><th class="r">Usuários</th><th>Situação</th><th></th></tr></thead><tbody>
      ${ts.map(t => `<tr><td><b>${esc(t.nome)}</b><br><span class="hint mono">${esc(t.slug)}</span>${t.cnpj ? ` <span class="hint">· ${esc(t.cnpj)}</span>` : ""}</td><td>${esc(NATUREZA[t.natureza] || t.natureza)}</td><td class="r num">${t.unidades}</td><td class="r num">${t.bens}</td><td class="r num">${t.usuarios}</td><td>${t.ativo ? '<span class="chip ok">Ativa</span>' : '<span class="chip bad">Suspensa</span>'}</td>
        <td><div class="row"><button class="btn sm pri" data-in="${t.id}">Entrar</button><button class="btn sm" data-tg="${t.id}" data-on="${t.ativo ? 0 : 1}">${t.ativo ? "Suspender" : "Reativar"}</button></div></td></tr>`).join("")}</tbody></table></div>`
      : `<div class="panel empty"><h2>Nenhuma entidade</h2><p>Cadastre a primeira entidade contratante e o administrador dela.</p></div>`}
      <p class="hint" style="margin-top:12px">“Entrar” abre a entidade em modo suporte, com perfil de administrador. O acesso fica registrado na auditoria da entidade.</p>`;
    PH.$$("[data-in]", el).forEach(x => x.onclick = async () => { await PH.api("POST", "/plataforma/entrar", { tenant_id: Number(x.dataset.in) }); PH.S.cfg = null; PH.invalidate(); await PH.boot(); PH.go("#/painel"); });
    PH.$$("[data-tg]", el).forEach(x => x.onclick = async () => { try { await PH.api("PATCH", "/plataforma/tenants/" + x.dataset.tg, { ativo: x.dataset.on === "1" }); PH.render(); } catch (e) { PH.toast(e.message, true); } });
    PH.$("#nt").onclick = () => {
      PH.modal("Nova entidade", `<fieldset><legend>Entidade contratante</legend><div class="fg">
        <label class="w6"><span class="req">Nome</span><input type="text" id="n_nome" placeholder="Ex.: Secretaria Municipal de Saúde de … / Instituto …"></label>
        <label>CNPJ<input type="text" id="n_cnpj"></label><label>Natureza<select id="n_nat">${PH.opt(Object.keys(NATUREZA), "direta", Object.values(NATUREZA))}</select></label>
        <label class="w4">Ente proprietário dos bens<input type="text" id="n_ente" placeholder="Ex.: Prefeitura Municipal de …"></label><label class="w2">Prefixo<input type="text" id="n_pref" value="PAT" maxlength="8"></label>
        <label class="w4">Primeira unidade hospitalar<input type="text" id="n_uni"></label><label class="w2">CNES<input type="text" id="n_cnes"></label></div></fieldset>
        <fieldset><legend>Administrador da entidade</legend><div class="fg">
        <label class="w6"><span class="req">Nome</span><input type="text" id="n_an"></label><label><span class="req">E-mail</span><input type="email" id="n_ae"></label><label>Cargo<input type="text" id="n_ac"></label></div></fieldset>`,
        `<button class="btn" data-close>Cancelar</button><button class="btn pri" id="n-ok">Criar entidade</button>`);
      PH.$("#n-ok").onclick = e => PH.busy(e.currentTarget, async () => {
        const r = await PH.api("POST", "/plataforma/tenants", { nome: PH.val("n_nome"), cnpj: PH.val("n_cnpj"), natureza: PH.val("n_nat"), ente: PH.val("n_ente"), prefixo: PH.val("n_pref"), unidade: PH.val("n_uni"), cnes: PH.val("n_cnes"), admin_nome: PH.val("n_an"), admin_email: PH.val("n_ae"), admin_cargo: PH.val("n_ac") });
        senhaModal("Entidade criada", PH.val("n_an"), PH.val("n_ae"), r.senha_provisoria); wireCopy(r.senha_provisoria);
        PH.$("#modal-root [data-close]")?.addEventListener("click", () => PH.render());
      });
    };
  }, { superOnly: true, semTenant: true });

  /* ================= Login e senha ================= */
  PH.renderLogin = function (app) {
    app.innerHTML = `<div class="login"><form class="box" id="lf">
      <div class="row" style="gap:12px"><div class="seal">${ICON.seal}</div><div><h1>${esc(S.appName || "Patrimônio Hospitalar")}</h1><span class="hint">Controle de patrimônio público hospitalar</span></div></div>
      <label>E-mail<input type="email" id="l_email" autocomplete="username" required></label>
      <label>Senha<input type="password" id="l_senha" autocomplete="current-password" required></label>
      <p class="err" id="l_err" role="alert"></p>
      <button class="btn pri" type="submit" id="l_btn">Entrar</button>
      <p class="foot">Acesso restrito a usuários autorizados. As operações são registradas.${S.owner ? `<br>${esc(S.owner)}` : ""}</p>
    </form></div>`;
    PH.$("#l_email").focus();
    PH.$("#lf").onsubmit = async e => {
      e.preventDefault(); const btn = PH.$("#l_btn"); btn.disabled = true; PH.$("#l_err").textContent = "";
      try { await PH.api("POST", "/auth/login", { email: PH.val("l_email"), senha: PH.$("#l_senha").value }); await PH.boot(); const target = sessionStorage.getItem("ph_after_login"); sessionStorage.removeItem("ph_after_login"); location.hash = S.me.user.must_change ? "#/senha" : (target || "#/"); PH.render(); }
      catch (err) { PH.$("#l_err").textContent = err.message; btn.disabled = false; }
    };
  };
  PH.renderSenha = function (app, obrigatoria) {
    app.innerHTML = `<div class="login"><form class="box" id="sf"><h1>${obrigatoria ? "Crie sua senha" : "Trocar senha"}</h1>
      <p class="hint" style="margin:0">${obrigatoria ? "Por segurança, substitua a senha provisória por uma senha só sua." : ""} Use pelo menos 10 caracteres, com letras e números.</p>
      <label>Senha atual<input type="password" id="s_at" autocomplete="current-password" required></label>
      <label>Nova senha<input type="password" id="s_nv" autocomplete="new-password" minlength="10" required></label>
      <label>Repita a nova senha<input type="password" id="s_nv2" autocomplete="new-password" required></label>
      <p class="err" id="s_err" role="alert"></p>
      <button class="btn pri" type="submit">Salvar nova senha</button>${obrigatoria ? `<button class="btn ghost" type="button" id="s_out">Sair</button>` : `<a class="btn ghost" href="#/">Cancelar</a>`}</form></div>`;
    PH.$("#s_at").focus();
    const out = PH.$("#s_out"); if (out) out.onclick = PH.logout;
    PH.$("#sf").onsubmit = async e => {
      e.preventDefault(); const err = PH.$("#s_err");
      if (PH.$("#s_nv").value !== PH.$("#s_nv2").value) { err.textContent = "As senhas novas não conferem."; return; }
      try { await PH.api("POST", "/auth/senha", { atual: PH.$("#s_at").value, nova: PH.$("#s_nv").value }); PH.toast("Senha alterada."); await PH.boot(); location.hash = "#/"; PH.render(); }
      catch (x) { err.textContent = x.message; }
    };
  };
})();
