/* Telas: painel, lista de bens, ficha do bem e cadastro. */
(function () {
  "use strict";
  const PH = window.PH, R = PH.R, S = PH.S, { esc, brl, dbr, ICON } = PH;

  /* ================= Painel ================= */
  PH.route("/painel", async el => {
    const [bens] = await Promise.all([PH.loadBens(), PH.loadCfg(), PH.loadInvs()]);
    const ano = new Date().getFullYear();
    const at = bens.filter(R.ativo), prop = at.filter(b => !R.isTerceiro(b));
    const vAq = prop.reduce((s, b) => s + (Number(b.valor) || 0), 0);
    const vLiq = prop.reduce((s, b) => { const d = R.deprec(b); return s + (d ? d.liquido : Number(b.valor) || 0); }, 0);
    const invAberto = (S.invs || []).filter(i => i.status === "aberto");
    const conf = at.filter(b => b.ult_conferencia && b.ult_conferencia.slice(0, 4) === String(ano)).length;
    const pct = at.length ? Math.round(conf / at.length * 100) : 0;
    const al = []; at.forEach(b => R.alertas(b).forEach(x => al.push({ b, ...x })));
    al.sort((x, y) => (x.sev === "bad" ? 0 : 1) - (y.sev === "bad" ? 0 : 1));
    const porSetor = {}; at.forEach(b => { const k = b.setor || "Sem setor"; porSetor[k] = (porSetor[k] || 0) + 1; });
    const setores = Object.entries(porSetor).sort((a, b) => b[1] - a[1]).slice(0, 12); const maxS = Math.max(1, ...setores.map(s => s[1]));
    const porSit = {}; bens.forEach(b => { porSit[b.situacao] = (porSit[b.situacao] || 0) + 1; });

    if (!bens.length) {
      const semSetor = !(S.cfg.setores || []).length;
      el.innerHTML = `<div class="panel empty"><h2>Comece o cadastro patrimonial</h2>
        <p>${semSetor ? "Primeiro cadastre as unidades e os setores da entidade em Configurações. Depois cadastre os bens com foto e descrição." : "Cadastre o primeiro bem com foto, descrição e número de patrimônio. Indicadores e alertas aparecem aqui."}</p>
        <div class="row" style="justify-content:center">${semSetor && PH.can("cfg") ? `<a class="btn pri" href="#/config">Cadastrar unidades e setores</a>` : PH.can("bens.write") ? `<a class="btn pri" href="#/novo">${ICON.plus}Cadastrar primeiro bem</a>` : ""}</div></div>`;
      return;
    }
    el.innerHTML = `
      <div class="sec-head"><div><h1>Painel patrimonial</h1><p>Posição em ${dbr(PH.hoje())}. Valores dos bens próprios; bens de terceiros são controlados à parte.</p></div>
        <div class="row">${PH.can("bens.write") ? `<a class="btn pri" href="#/novo">${ICON.plus}Novo bem</a>` : ""}<button class="btn" data-scan>${ICON.qr}Ler etiqueta</button></div></div>
      <div class="stack">
      <div class="kpis">
        <div class="kpi"><div class="l">Bens ativos</div><div class="v">${at.length}</div><div class="s">${at.length - prop.length} de terceiros · ${bens.length - at.length} baixados</div></div>
        <div class="kpi"><div class="l">Valor de aquisição</div><div class="v">${brl(vAq)}</div><div class="s">Custo histórico dos bens próprios</div></div>
        <div class="kpi"><div class="l">Valor contábil líquido</div><div class="v">${brl(vLiq)}</div><div class="s">Depreciação acumulada de ${brl(vAq - vLiq)}</div></div>
        <div class="kpi"><div class="l">Conferidos em ${ano}</div><div class="v">${pct}%</div><div class="s">${conf} de ${at.length} · ${invAberto.length ? `${invAberto.length} inventário(s) aberto(s)` : "nenhum inventário aberto"}</div><div class="meter"><i style="width:${pct}%"></i></div></div>
      </div>
      <div class="grid2">
        <div class="panel"><h2>Pendências e alertas <small>${al.length} item(ns)</small></h2>
          ${al.length ? `<ul class="list">${al.slice(0, 15).map(x => `<li class="link ${x.sev}" data-bem="${esc(x.b.id)}" tabindex="0"><i class="stripe"></i><div class="t"><b>${esc(x.t)}</b><span><span class="mono">${esc(PH.num(x.b.numero))}</span> · ${esc(x.b.descricao)} · ${esc(x.b.setor || "Sem setor")}</span></div><span class="chip ${x.sev === "bad" ? "bad" : "warn"} plain">${x.sev === "bad" ? "Vencido" : "Atenção"}</span></li>`).join("")}</ul>
          ${al.length > 15 ? `<p class="count">E mais ${al.length - 15} alerta(s). Veja a engenharia clínica e a lista de bens.</p>` : ""}` : `<p class="empty">Nenhuma pendência. Manutenções, calibrações e responsáveis estão em dia.</p>`}
        </div>
        <div class="stack" style="align-content:start">
          <div class="panel"><h2>Bens ativos por setor</h2><div class="bars">${setores.map(([n, c]) => `<div class="bar"><span class="n" title="${esc(n)}">${esc(n)}</span><span class="track"><i style="width:${c / maxS * 100}%"></i></span><span class="c">${c}</span></div>`).join("")}</div></div>
          <div class="panel"><h2>Situação</h2><div class="row">${R.SITUACOES.filter(s => porSit[s]).map(s => `${PH.sitChip(s)}<span class="mono" style="margin-right:10px">${porSit[s]}</span>`).join("")}</div></div>
          ${invAberto.length ? `<div class="panel"><h2>Inventários abertos</h2><ul class="list">${invAberto.map(i => `<li class="link info" data-inv="${i.id}"><i class="stripe"></i><div class="t"><b>${esc(i.unidade)} · ${i.tipo} ${i.ano}</b><span>${i.conferidos} de ${i.total} conferidos</span></div><span class="chip info plain">${i.total ? Math.round(i.conferidos / i.total * 100) : 0}%</span></li>`).join("")}</ul></div>` : ""}
        </div>
      </div></div>`;
    PH.$$("[data-bem]", el).forEach(li => { const go = () => PH.go("#/bem/" + li.dataset.bem); li.onclick = go; li.onkeydown = e => { if (e.key === "Enter") go(); }; });
    PH.$$("[data-inv]", el).forEach(li => { li.onclick = () => PH.go("#/inventario/" + li.dataset.inv); });
    PH.$("[data-scan]", el).onclick = PH.scanToBem;
  });

  /** Lê uma etiqueta e abre a ficha do bem. */
  PH.scanToBem = () => PH.scan({ titulo: "Aponte para a etiqueta patrimonial", onCode: code => { PH.openByCode(code); return true; } });
  PH.openByCode = async code => {
    if (code.slug && code.slug !== S.me.tenant.slug) { PH.toast("Esta etiqueta pertence a outra entidade.", true); return; }
    try { const b = await PH.api("GET", "/bens/numero/" + code.numero); PH.go("#/bem/" + b.id); }
    catch (e) { PH.toast(e.message, true); }
  };
  PH.route("/q/:slug/:numero", async (el, slug, numero) => {
    el.innerHTML = `<p class="loading">Abrindo bem nº ${esc(numero)}…</p>`;
    if (slug !== S.me.tenant.slug) { el.innerHTML = `<div class="panel empty"><h2>Etiqueta de outra entidade</h2><p>Este bem não pertence a ${esc(S.me.tenant.nome)}. Entre com o usuário da entidade correta.</p></div>`; return; }
    try { const b = await PH.api("GET", "/bens/numero/" + Number(numero)); location.replace("#/bem/" + b.id); }
    catch (e) { el.innerHTML = `<div class="panel empty"><h2>Bem não encontrado</h2><p>${esc(e.message)}</p></div>`; }
  });

  /* ================= Lista de bens ================= */
  const F = { q: "", unidade: "", setor: "", classe: "", sit: "ativos" };
  const sel = new Set();
  function filtrar(bens) {
    const q = F.q.trim().toLowerCase();
    return bens.filter(b => {
      if (F.sit === "ativos" && !R.ativo(b)) return false;
      if (F.sit && F.sit !== "ativos" && b.situacao !== F.sit) return false;
      if (F.unidade && String(b.unidade_id) !== F.unidade) return false;
      if (F.setor && String(b.setor_id) !== F.setor) return false;
      if (F.classe && b.classe !== F.classe) return false;
      if (q) {
        const hay = [PH.num(b.numero), b.numero, b.descricao, b.especificacao, b.marca, b.modelo, b.serie, b.setor, b.unidade, b.responsavel, b.documento, b.anvisa].join(" ").toLowerCase();
        if (!q.split(/\s+/).every(w => hay.includes(w))) return false;
      }
      return true;
    });
  }
  PH.route("/bens", async el => {
    await Promise.all([PH.loadBens(), PH.loadCfg()]);
    const unidades = PH.unidadesAtivas();
    el.innerHTML = `<div class="sec-head"><div><h1>Bens patrimoniais</h1><p>Busque por número, descrição, série, setor, responsável ou documento.</p></div>
      <div class="row"><button class="btn" data-scan>${ICON.qr}Ler etiqueta</button>${PH.can("bens.write") ? `<a class="btn pri" href="#/novo">${ICON.plus}Novo bem</a>` : ""}</div></div>
      <div class="filters">
        <input class="q" type="search" id="f-q" placeholder="Buscar… ex.: 12, monitor UTI, série" aria-label="Buscar" value="${esc(F.q)}">
        <select id="f-unidade" aria-label="Unidade"><option value="">Todas as unidades</option>${unidades.map(u => `<option value="${u.id}" ${F.unidade == u.id ? "selected" : ""}>${esc(u.nome)}</option>`).join("")}</select>
        <select id="f-setor" aria-label="Setor"></select>
        <select id="f-classe" aria-label="Classe"><option value="">Todas as classes</option>${Object.entries(R.CLASSES).map(([k, c]) => `<option value="${k}" ${F.classe === k ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select>
        <select id="f-sit" aria-label="Situação"><option value="ativos" ${F.sit === "ativos" ? "selected" : ""}>Somente ativos</option><option value="" ${F.sit === "" ? "selected" : ""}>Todas as situações</option>${R.SITUACOES.map(s => `<option ${F.sit === s ? "selected" : ""}>${s}</option>`).join("")}</select>
      </div><div id="b-list"></div>`;
    const fillSetores = () => {
      const list = (S.cfg.setores || []).filter(s => !F.unidade || String(s.unidade_id) === F.unidade);
      PH.$("#f-setor").innerHTML = `<option value="">Todos os setores</option>` + list.map(s => `<option value="${s.id}" ${F.setor == s.id ? "selected" : ""}>${esc(F.unidade ? s.nome : s.unidade + " · " + s.nome)}</option>`).join("");
    };
    fillSetores();
    PH.$("#f-q").oninput = e => { F.q = e.target.value; lista(); };
    PH.$("#f-unidade").onchange = e => { F.unidade = e.target.value; F.setor = ""; fillSetores(); lista(); };
    ["setor", "classe", "sit"].forEach(k => { PH.$("#f-" + k).onchange = e => { F[k] = e.target.value; lista(); }; });
    PH.$("[data-scan]", el).onclick = PH.scanToBem;
    lista();
  });
  function lista() {
    const box = PH.$("#b-list"); if (!box) return;
    const list = filtrar(S.bens);
    if (!S.bens.length) { box.innerHTML = `<div class="panel empty"><h2>Nenhum bem cadastrado</h2><p>Use “Novo bem” para registrar o primeiro item com foto e descrição.</p></div>`; return; }
    if (!list.length) { box.innerHTML = `<div class="panel empty"><h2>Nada encontrado</h2><p>Ajuste a busca ou os filtros.</p></div>`; return; }
    const total = list.filter(b => !R.isTerceiro(b)).reduce((s, b) => s + (Number(b.valor) || 0), 0);
    const shown = list.slice(0, 500);
    const flags = b => `${R.alertas(b).some(a => a.sev === "bad") ? '<span class="chip bad plain">Vencido</span>' : ""} ${R.isTerceiro(b) ? '<span class="chip info plain">Terceiro</span>' : ""}`;
    box.innerHTML = `<div class="tablebox resp"><table class="t"><thead><tr><th class="cb"><input type="checkbox" id="sel-all" aria-label="Selecionar todos"></th><th>Patrimônio</th><th>Bem</th><th>Localização / responsável</th><th>Situação</th><th class="r">Aquisição</th><th class="r">Valor líquido</th></tr></thead><tbody>
      ${shown.map(b => { const d = R.deprec(b); return `<tr class="link ${sel.has(b.id) ? "sel" : ""}" data-id="${esc(b.id)}" tabindex="0"><td class="cb"><input type="checkbox" data-sel="${esc(b.id)}" ${sel.has(b.id) ? "checked" : ""} aria-label="Selecionar"></td><td class="mono">${esc(PH.num(b.numero))}</td><td><div class="itm">${PH.thumb(b)}<div class="d"><b>${esc(b.descricao)}</b><span>${esc([b.marca, b.modelo].filter(Boolean).join(" ") || R.CLASSES[b.classe]?.nome || "")}</span></div></div></td><td>${esc(b.setor || "—")}<br><span class="hint">${esc(b.unidade || "")}${b.responsavel ? " · " + esc(b.responsavel) : " · sem responsável"}</span></td><td>${PH.sitChip(b.situacao)} ${flags(b)}</td><td class="r num">${R.isTerceiro(b) ? "—" : brl(b.valor)}</td><td class="r num">${d ? brl(d.liquido) : "—"}</td></tr>`; }).join("")}
      </tbody></table></div>
      <div class="cards">${shown.map(b => `<div class="card" data-id="${esc(b.id)}" tabindex="0">${PH.thumb(b)}<div style="min-width:0"><div class="mono hint">${esc(PH.num(b.numero))}</div><b>${esc(b.descricao)}</b><div class="hint">${esc(b.setor || "Sem setor")} · ${esc(b.responsavel || "sem responsável")}</div><div class="meta">${PH.sitChip(b.situacao)}${flags(b)}</div></div></div>`).join("")}</div>
      <p class="count">${list.length} bem(ns)${list.length > 500 ? " (mostrando os 500 primeiros; refine a busca)" : ""} · valor de aquisição dos próprios: <span class="num">${brl(total)}</span></p>
      <div id="selbar"></div>`;
    PH.$$("[data-id]", box).forEach(r => {
      r.addEventListener("click", e => { if (e.target.closest("input")) return; PH.go("#/bem/" + r.dataset.id); });
      r.addEventListener("keydown", e => { if (e.key === "Enter") PH.go("#/bem/" + r.dataset.id); });
    });
    PH.$$("[data-sel]", box).forEach(c => c.onchange = () => { c.checked ? sel.add(c.dataset.sel) : sel.delete(c.dataset.sel); c.closest("tr").classList.toggle("sel", c.checked); selbar(); });
    PH.$("#sel-all").onchange = e => { shown.forEach(b => e.target.checked ? sel.add(b.id) : sel.delete(b.id)); lista(); };
    selbar();
  }
  function selbar() {
    const sb = PH.$("#selbar"); if (!sb) return;
    const ids = [...sel].filter(id => S.bens.some(b => b.id === id && R.ativo(b)));
    if (!ids.length) { sb.innerHTML = ""; return; }
    sb.innerHTML = `<div class="selbar"><b>${ids.length} selecionado(s)</b><span class="spacer"></span>
      ${PH.can("transf") ? `<button class="btn sm" data-a="transf">Transferir</button>` : ""}
      <a class="btn sm" href="/docs/etiquetas?ids=${ids.join(",")}" target="_blank" rel="noopener">${ICON.qr}Etiquetas</a>
      <button class="btn sm" data-a="clear">Limpar</button></div>`;
    PH.$("[data-a=clear]", sb).onclick = () => { sel.clear(); lista(); };
    const t = PH.$("[data-a=transf]", sb); if (t) t.onclick = () => PH.openTransf(ids, () => { sel.clear(); });
  }

  /* ================= Ficha do bem ================= */
  PH.route("/bem/:id", async (el, id) => {
    const [b] = await Promise.all([PH.api("GET", "/bens/" + id), PH.loadCfg(), PH.loadInvs()]);
    const d = R.deprec(b), al = R.alertas(b), c = R.CLASSES[b.classe] || R.CLASSES.out, ano = new Date().getFullYear();
    const ativo = R.ativo(b);
    const inv = (S.invs || []).find(i => i.status === "aberto" && i.unidade_id === b.unidade_id);
    const kv = (l, v) => `<div><dt>${l}</dt><dd>${v || "—"}</dd></div>`;
    const abertas = (b.manutencoes || []).filter(m => !m.conclusao);
    el.innerHTML = `
    <div class="sec-head"><div><a href="#/bens" class="hint">← Bens patrimoniais</a></div>
      <div class="row"><a class="btn" href="/docs/ficha/${esc(b.id)}" target="_blank" rel="noopener">${ICON.doc}Ficha</a><a class="btn" href="/docs/etiquetas?ids=${esc(b.id)}" target="_blank" rel="noopener">${ICON.qr}Etiqueta</a></div></div>
    <div class="stack">
    <div class="hero">
      <div>${b.fotos.length ? `<img class="bigph" id="d-main" src="/api/fotos/${esc(b.fotos[0])}" alt="Foto do bem">` : `<div class="bigph">${ICON[b.classe] || ICON.out}</div>`}
        ${b.fotos.length > 1 ? `<div class="mini">${b.fotos.map(f => `<img src="/api/fotos/${esc(f)}?t=thumb" data-f="${esc(f)}" alt="Outra foto">`).join("")}</div>` : ""}</div>
      <div style="min-width:0">
        <div class="tag"><span class="a">${esc(b.unidade || S.me.tenant.nome)}</span><span class="b">${esc(PH.num(b.numero))}</span></div>
        <h2>${esc(b.descricao)}</h2>
        <p style="margin:0 0 10px;color:var(--muted)">${esc(b.especificacao || "")}</p>
        <div class="row">${PH.sitChip(b.situacao)}<span class="chip plain">Conservação: ${esc(b.conservacao)}</span>${b.class_inservivel ? `<span class="chip bad plain">${esc(b.class_inservivel)}</span>` : ""}${R.isTerceiro(b) ? '<span class="chip info plain">Bem de terceiro</span>' : ""}${ativo ? (b.ult_conferencia && b.ult_conferencia.startsWith(String(ano)) ? `<span class="chip ok plain">Conferido em ${dbr(b.ult_conferencia)}</span>` : `<span class="chip warn plain">Não conferido em ${ano}</span>`) : ""}</div>
        ${al.length ? `<ul class="list" style="margin-top:12px">${al.map(x => `<li class="${x.sev}"><i class="stripe"></i><div class="t"><b>${esc(x.t)}</b></div><span></span></li>`).join("")}</ul>` : ""}
      </div>
    </div>
    ${ativo && inv && PH.can("inv.conferir") ? `<div class="callout"><span style="flex:1;min-width:200px">Inventário ${esc(inv.tipo.toLowerCase())} ${inv.ano} aberto para ${esc(inv.unidade)}.</span><button class="btn pri" data-a="conf">Conferir este bem</button></div>` : ""}
    ${ativo ? `<div class="row">
      ${PH.can("bens.write") || (PH.can("bens.saude") && c.saude) ? `<a class="btn pri" href="#/editar/${esc(b.id)}">Editar</a>` : ""}
      ${PH.can("transf") ? `<button class="btn" data-a="transf">Transferir</button>` : ""}
      ${PH.can("manut.write") ? `<button class="btn" data-a="manut">Registrar manutenção</button>` : ""}
      ${PH.can("reav") && !R.isTerceiro(b) ? `<button class="btn" data-a="reav">Reavaliar</button>` : ""}
      ${PH.can("baixa") ? `<button class="btn danger" data-a="baixa">Dar baixa</button>` : ""}
    </div>` : ""}
    <div class="panel"><h2>Dados cadastrais</h2><dl class="kv">
      ${kv("Classe / conta PCASP", `${esc(c.nome)} · <span class="mono">${esc(c.conta)}</span>`)}
      ${kv("Marca / modelo", esc([b.marca, b.modelo].filter(Boolean).join(" / ")))}
      ${kv("Nº de série", `<span class="mono">${esc(b.serie || "")}</span>`)}
      ${kv("Unidade / setor", esc([b.unidade, b.setor].filter(Boolean).join(" · ")))}
      ${kv("Localização física", esc(b.local))}
      ${kv("Responsável", b.responsavel ? esc(b.responsavel) + (b.responsavel_mat ? ` <span class="hint">mat. ${esc(b.responsavel_mat)}</span>` : "") : '<span style="color:var(--bad)">Não definido</span>')}
      ${kv("Incorporação", esc(b.incorporacao))}
      ${kv("Documento de origem", esc(b.documento))}
      ${kv("Fornecedor / doador", esc(b.fornecedor))}
      ${kv("Data de aquisição", dbr(b.data_aquisicao))}
      ${kv("Garantia até", dbr(b.garantia))}
      ${kv("Observações", esc(b.obs))}
    </dl></div>
    ${c.saude ? `<div class="panel"><h2>Equipamento de saúde</h2><dl class="kv">
      ${kv("Registro Anvisa", `<span class="mono">${esc(b.anvisa || "")}</span>`)}${kv("Classe de risco", esc(b.risco))}
      ${kv("Preventiva", b.per_preventiva ? `a cada ${b.per_preventiva} mês(es) · última ${dbr(b.ult_preventiva)} · próxima ${b.ult_preventiva ? dbr(R.iso(R.addMonths(b.ult_preventiva, b.per_preventiva))) : "—"}` : "")}
      ${kv("Calibração / segurança elétrica", b.per_calibracao ? `a cada ${b.per_calibracao} mês(es) · última ${dbr(b.ult_calibracao)} · próxima ${b.ult_calibracao ? dbr(R.iso(R.addMonths(b.ult_calibracao, b.per_calibracao))) : "—"}` : "")}
    </dl></div>` : ""}
    <div class="panel"><h2>Depreciação <small>linear, mensal${d?.reavaliado ? " · após reavaliação" : ""}</small></h2>
      ${d ? `<div class="dep">
        <div><div class="l">${d.reavaliado ? "Valor reavaliado" : "Custo"}</div><div class="v">${brl(d.base)}</div></div>
        <div><div class="l">Valor residual</div><div class="v">${brl(d.residualValor)}</div></div>
        <div><div class="l">Quota mensal</div><div class="v">${brl(d.mensal)}</div></div>
        <div><div class="l">Acumulada (${d.meses} m)</div><div class="v">${brl(d.acum)}</div></div>
        <div><div class="l">Valor líquido</div><div class="v">${brl(d.liquido)}</div></div>
      </div><div class="meter" style="margin-top:12px"><i style="width:${Math.round(d.pct * 100)}%"></i></div>
      <p class="hint" style="margin:6px 0 0">${Math.round(d.pct * 100)}% da vida útil de ${d.vida} ano(s) consumida${d.encerrada ? " · depreciação encerrada" : ""}.</p>`
      : `<p class="hint" style="margin:0">${R.isTerceiro(b) ? "Bem de terceiro: não é depreciado pela entidade. Controle a guarda e a devolução." : "Informe valor e data de aquisição para calcular."}</p>`}
      ${b.reavaliacoes.length ? `<div class="tablebox" style="margin-top:12px"><table class="t"><thead><tr><th>Data</th><th>Tipo</th><th class="r">Anterior</th><th class="r">Novo</th><th>Vida rem.</th><th>Laudo</th></tr></thead><tbody>${b.reavaliacoes.map(r => `<tr><td class="mono">${dbr(r.data)}</td><td>${esc(r.tipo)}</td><td class="r num">${brl(r.valor_anterior)}</td><td class="r num">${brl(r.valor_novo)}</td><td>${r.vida_restante} ano(s)</td><td>${esc(r.laudo)}</td></tr>`).join("")}</tbody></table></div>` : ""}
    </div>
    ${b.manutencoes.length ? `<div class="panel"><h2>Manutenções <small>${b.manutencoes.length} registro(s) · custo total ${brl(b.manutencoes.reduce((s, m) => s + (Number(m.custo) || 0), 0))}</small></h2>
      <div class="tablebox"><table class="t"><thead><tr><th>Tipo</th><th>Abertura</th><th>Conclusão</th><th>Empresa / OS</th><th class="r">Custo</th><th></th></tr></thead><tbody>
      ${b.manutencoes.map(m => `<tr><td>${esc(m.tipo)}</td><td class="mono">${dbr(m.abertura)}</td><td class="mono">${m.conclusao ? dbr(m.conclusao) : '<span class="chip warn plain">Aberta</span>'}</td><td>${esc([m.empresa, m.os && "OS " + m.os].filter(Boolean).join(" · ") || "—")}</td><td class="r num">${brl(m.custo)}</td><td>${!m.conclusao && PH.can("manut.write") ? `<button class="btn sm" data-concluir="${m.id}">Concluir</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div></div>` : ""}
    ${b.baixa ? `<div class="panel"><h2>Baixa patrimonial</h2><dl class="kv">${kv("Data", dbr(b.baixa.data))}${kv("Motivo", esc(b.baixa.motivo))}${kv("Processo / ato", esc(b.baixa.processo))}${kv("Destinatário", esc(b.baixa.destinatario))}${kv("Valor líquido na baixa", b.baixa.valor_liquido != null ? brl(b.baixa.valor_liquido) : "—")}${kv("Observação", esc(b.baixa.obs))}</dl></div>` : ""}
    <div class="panel"><h2>Histórico <small>${b.eventos.length} registro(s)</small></h2>
      <ul class="timeline">${b.eventos.map(h => `<li><span class="when">${PH.dtbr(h.em).split(",")[0]}</span><div><b>${esc(h.tipo)}</b> — ${esc(h.texto)}${h.dados?.guia ? ` <a href="/docs/guia/${h.dados.guia}" target="_blank" rel="noopener">guia</a>` : ""}<span>${esc(h.por || "")} · ${PH.dtbr(h.em)}</span></div></li>`).join("") || '<li><span></span><div class="hint">Sem movimentações.</div></li>'}</ul>
    </div>
    ${PH.can("bens.delete") && ativo ? `<div id="del-zone"><button class="btn ghost danger" data-a="del">Excluir cadastro (somente erro de digitação ou duplicidade)</button></div>` : ""}
    </div>`;
    PH.$$(".mini img", el).forEach(i => i.onclick = () => { PH.$("#d-main").src = "/api/fotos/" + i.dataset.f; });
    const reload = () => { PH.invalidate(); PH.render(); };
    const on = (a, fn) => { const x = PH.$(`[data-a=${a}]`, el); if (x) x.onclick = fn; };
    on("transf", () => PH.openTransf([b.id], reload));
    on("manut", () => PH.openManut(b, reload));
    on("reav", () => PH.openReav(b, d, reload));
    on("baixa", () => PH.openBaixa(b, d, reload));
    on("conf", () => PH.openConferir(inv, b, reload));
    PH.$$("[data-concluir]", el).forEach(x => x.onclick = () => PH.openConcluir(b.manutencoes.find(m => String(m.id) === x.dataset.concluir), reload));
    on("del", () => {
      PH.$("#del-zone").innerHTML = `<div class="confirm"><span style="flex:1;min-width:220px">A exclusão apaga o cadastro e as fotos. A trilha de auditoria guarda uma cópia. Para bens que saíram da entidade, use a baixa.</span>
        <input type="text" id="del-mot" placeholder="Motivo (ex.: cadastro em duplicidade do nº 15)" style="flex:2;min-width:220px"><button class="btn" data-x="no">Manter</button><button class="btn danger" data-x="yes">Excluir</button></div>`;
      PH.$("[data-x=no]").onclick = () => PH.render();
      PH.$("[data-x=yes]").onclick = async () => {
        try { await PH.api("DELETE", "/bens/" + b.id, { motivo: PH.val("del-mot") }); PH.invalidate(); PH.toast("Cadastro excluído."); PH.go("#/bens"); }
        catch (e) { PH.toast(e.message, true); }
      };
    });
  });

  /* ================= Cadastro / edição ================= */
  PH.route("/novo", el => form(el, null), { perm: "bens.write" });
  PH.route("/editar/:id", async (el, id) => form(el, await PH.api("GET", "/bens/" + id)));

  async function form(el, b) {
    await PH.loadCfg();
    const novo = !b, soSaude = !novo && !PH.can("bens.write");
    const unidades = PH.unidadesAtivas();
    if (novo && !PH.setoresDe(unidades[0]?.id).length && !(S.cfg.setores || []).length) {
      el.innerHTML = `<div class="panel empty"><h2>Cadastre os setores primeiro</h2><p>Cada bem fica vinculado a uma unidade e a um setor. ${PH.can("cfg") ? `<a href="#/config">Ir para Configurações</a>.` : "Peça ao administrador da entidade para cadastrá-los."}</p></div>`;
      return;
    }
    const v = b || { classe: "med", situacao: "Em uso", conservacao: "Novo", incorporacao: "Compra", data_aquisicao: PH.hoje(), vida_util: R.CLASSES.med.vida, residual: R.CLASSES.med.residual, unidade_id: unidades[0]?.id };
    const fotosNovas = []; let fotosAtuais = b ? [...b.fotos] : [];
    const dis = soSaude ? "disabled" : "";
    el.innerHTML = `<div class="sec-head"><div><a href="${novo ? "#/bens" : "#/bem/" + esc(b.id)}" class="hint">← ${novo ? "Bens patrimoniais" : "Voltar à ficha"}</a><h1>${novo ? "Cadastrar bem" : "Editar " + esc(PH.num(b.numero))}</h1>
      <p>${novo ? "O número de patrimônio é gerado ao salvar, em sequência única da entidade." : soSaude ? "Seu perfil altera somente os dados técnicos de equipamento de saúde." : "Mudanças de setor e de responsável são feitas por transferência, que gera a guia."}</p></div></div>
    <div class="stack" id="bem-form">
      ${soSaude ? "" : `<fieldset><legend>Fotos do bem</legend><div class="photos" id="ff-photos"></div>
        ${S.me.ai ? `<div class="ai" id="ff-ai" hidden><span>${ICON.spark}</span><span style="flex:1;min-width:200px">A IA sugere descrição padronizada, especificação, marca, modelo e classe a partir da foto. Revise antes de salvar.</span><button type="button" class="btn" id="ff-ai-btn">Descrever pela foto</button></div><p class="hint" id="ff-ai-msg" style="margin:8px 0 0"></p>` : ""}</fieldset>`}
      <fieldset ${dis}><legend>Identificação</legend><div class="fg">
        <label class="w6"><span class="req">Descrição padronizada</span><input type="text" id="f_descricao" value="${esc(v.descricao)}" placeholder="Substantivo + qualificador. Ex.: Monitor multiparamétrico" maxlength="160"></label>
        <label class="w6">Especificação técnica<textarea id="f_especificacao" placeholder="Características que individualizam o bem: dimensões, material, cor, acessórios, capacidade">${esc(v.especificacao)}</textarea></label>
        <label class="w2">Marca<input type="text" id="f_marca" value="${esc(v.marca)}"></label>
        <label class="w2">Modelo<input type="text" id="f_modelo" value="${esc(v.modelo)}"></label>
        <label class="w2">Nº de série<input type="text" id="f_serie" value="${esc(v.serie)}"></label>
      </div></fieldset>
      <fieldset ${dis}><legend>Classificação contábil (PCASP)</legend><div class="fg">
        <label class="w4"><span class="req">Classe do bem</span><select id="f_classe">${Object.entries(R.CLASSES).map(([k, c]) => `<option value="${k}" ${v.classe === k ? "selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></label>
        <label class="w2">Conta contábil<input type="text" id="f_conta" value="${esc(R.CLASSES[v.classe]?.conta)}" disabled></label>
        <label class="w2">Vida útil (anos)<input type="number" id="f_vida" min="1" max="100" step="0.5" value="${esc(v.vida_util)}"></label>
        <label class="w2">Valor residual (%)<input type="number" id="f_residual" min="0" max="90" value="${esc(v.residual)}"></label>
        <div class="f w2"><span>&nbsp;</span><span class="hint">Referências ajustáveis conforme a política contábil do ente.</span></div>
      </div></fieldset>
      <fieldset ${dis}><legend>Incorporação</legend><div class="fg">
        <label><span class="req">Forma de incorporação</span><select id="f_incorporacao">${PH.opt(R.INCORP, v.incorporacao)}</select></label>
        <label><span class="req">Data de aquisição / entrada</span><input type="date" id="f_data" value="${esc(v.data_aquisicao)}"></label>
        <label>Valor de aquisição (R$)<input type="number" id="f_valor" min="0" step="0.01" value="${esc(v.valor)}"><span class="hint">Doação: valor justo de avaliação. Bem de terceiro: opcional.</span></label>
        <label>Documento de origem<input type="text" id="f_documento" value="${esc(v.documento)}" placeholder="NF, empenho, processo, termo de doação"></label>
        <label>Fornecedor / doador (nome e CNPJ)<input type="text" id="f_fornecedor" value="${esc(v.fornecedor)}"></label>
        <label>Garantia até<input type="date" id="f_garantia" value="${esc(v.garantia)}"></label>
      </div></fieldset>
      <fieldset ${dis}><legend>Localização e responsabilidade</legend><div class="fg">
        <label><span class="req">Unidade</span><select id="f_unidade" ${novo ? "" : "disabled"}>${unidades.map(u => `<option value="${u.id}" ${v.unidade_id === u.id ? "selected" : ""}>${esc(u.nome)}</option>`).join("")}</select></label>
        <label><span class="req">Setor</span><select id="f_setor" ${novo ? "" : "disabled"}></select></label>
        <label>Localização física<input type="text" id="f_local" value="${esc(v.local)}" placeholder="Bloco, andar, sala, leito"></label>
        <label>Matrícula do responsável<input type="text" id="f_respmat" value="${esc(v.responsavel_mat)}" ${novo ? "" : "disabled"}></label>
        <label class="w6">Responsável (detentor da carga)<input type="text" id="f_responsavel" value="${esc(v.responsavel)}" ${novo ? "" : "disabled"} placeholder="Nome e cargo de quem assina o termo de responsabilidade"></label>
      </div></fieldset>
      <fieldset ${dis}><legend>Estado</legend><div class="fg">
        <label><span class="req">Estado de conservação</span><select id="f_conservacao">${PH.opt(R.CONSERV, v.conservacao)}</select></label>
        <label><span class="req">Situação</span><select id="f_situacao">${PH.opt(R.SITUACOES.filter(s => s !== "Baixado"), v.situacao)}</select></label>
        <label class="w6" id="f_inserv_w" ${v.situacao === "Inservível" ? "" : "hidden"}>Classificação do bem inservível<select id="f_inserv">${PH.opt(R.INSERV, v.class_inservivel)}</select><span class="hint">Conforme a norma de desfazimento do ente (referência: Decreto federal 9.373/2018).</span></label>
      </div></fieldset>
      <fieldset id="f_saude" ${R.CLASSES[v.classe]?.saude ? "" : "hidden"}><legend>Equipamento de saúde (RDC Anvisa 509/2021)</legend><div class="fg">
        <label>Nº de registro/notificação Anvisa<input type="text" id="f_anvisa" value="${esc(v.anvisa)}" placeholder="Conforme rótulo ou instruções de uso"></label>
        <label>Classe de risco<select id="f_risco">${PH.opt(R.RISCO, v.risco || "", R.RISCO.map(x => x || "Não informada"))}</select></label>
        <label class="w2">Preventiva a cada (meses)<input type="number" id="f_perprev" min="0" value="${esc(v.per_preventiva)}"></label>
        <label class="w4">Última manutenção preventiva<input type="date" id="f_ultprev" value="${esc(v.ult_preventiva)}"></label>
        <label class="w2">Calibração a cada (meses)<input type="number" id="f_percal" min="0" value="${esc(v.per_calibracao)}"></label>
        <label class="w4">Última calibração / teste de segurança elétrica<input type="date" id="f_ultcal" value="${esc(v.ult_calibracao)}"></label>
      </div></fieldset>
      <fieldset ${dis}><legend>Observações</legend><textarea id="f_obs" placeholder="Acessórios, restrições de uso, histórico relevante">${esc(v.obs)}</textarea></fieldset>
      <div class="row"><p class="err" id="f_err" role="alert"></p><span class="spacer"></span><a class="btn" href="${novo ? "#/bens" : "#/bem/" + esc(b.id)}">Cancelar</a><button class="btn pri" id="f-save">${novo ? "Cadastrar bem" : "Salvar alterações"}</button></div>
    </div>`;
    const fillSet = () => { const sid = v.setor_id; PH.$("#f_setor").innerHTML = PH.setoresDe(PH.$("#f_unidade").value).map(s => `<option value="${s.id}" ${s.id === sid ? "selected" : ""}>${esc(s.nome)}</option>`).join("") || `<option value="">Nenhum setor nesta unidade</option>`; };
    if (novo) { fillSet(); PH.$("#f_unidade").onchange = fillSet; }
    else PH.$("#f_setor").innerHTML = `<option>${esc(b.setor)}</option>`;
    PH.$("#f_classe").onchange = e => { const c = R.CLASSES[e.target.value]; PH.$("#f_conta").value = c.conta; PH.$("#f_vida").value = c.vida; PH.$("#f_residual").value = c.residual; PH.$("#f_saude").hidden = !c.saude; };
    PH.$("#f_situacao").onchange = e => { PH.$("#f_inserv_w").hidden = e.target.value !== "Inservível"; };

    const renderFotos = () => {
      const box = PH.$("#ff-photos"); if (!box) return;
      box.innerHTML = fotosAtuais.map(f => `<div class="ph"><img src="/api/fotos/${esc(f)}?t=thumb" alt="Foto"><button type="button" data-rm="${esc(f)}" aria-label="Remover foto">×</button></div>`).join("")
        + fotosNovas.map((f, i) => `<div class="ph"><img src="data:image/jpeg;base64,${f.thumb}" alt="Nova foto"><button type="button" data-rn="${i}" aria-label="Remover foto">×</button></div>`).join("")
        + (fotosAtuais.length + fotosNovas.length < 6 ? `<button type="button" class="addph" id="ff-add">${ICON.plus}<span>Adicionar foto<br><span class="hint">câmera ou arquivo</span></span></button>` : "");
      PH.$$("[data-rm]", box).forEach(x => x.onclick = async () => {
        try { await PH.api("DELETE", "/fotos/" + x.dataset.rm); fotosAtuais = fotosAtuais.filter(f => f !== x.dataset.rm); PH.invalidate(); renderFotos(); PH.toast("Foto removida."); }
        catch (e) { PH.toast(e.message, true); }
      });
      PH.$$("[data-rn]", box).forEach(x => x.onclick = () => { fotosNovas.splice(Number(x.dataset.rn), 1); renderFotos(); });
      const add = PH.$("#ff-add"); if (add) add.onclick = async () => {
        const f = await PH.pickImage(); if (!f) return;
        if (novo) { fotosNovas.push(f); renderFotos(); }
        else {
          try { const r = await PH.api("POST", `/bens/${b.id}/fotos`, f); fotosAtuais.push(r.id); fotosNovas.length = 0; PH.invalidate(); renderFotos(); PH.toast("Foto adicionada."); PH.lastPhoto = f; }
          catch (e) { PH.toast(e.message, true); }
        }
        PH.lastPhoto = f; const ai = PH.$("#ff-ai"); if (ai) ai.hidden = false;
      };
    };
    renderFotos();
    const aiBtn = PH.$("#ff-ai-btn");
    if (aiBtn) aiBtn.onclick = async () => {
      const msg = PH.$("#ff-ai-msg"); if (!PH.lastPhoto) return;
      aiBtn.disabled = true; msg.textContent = "Analisando a foto… pode levar alguns segundos.";
      try {
        const r = await PH.api("POST", "/ai/descrever", { imagem: PH.lastPhoto.full });
        const set = (id, val) => { const x = PH.$("#" + id); if (x && val && !x.value.trim()) x.value = val; };
        set("f_descricao", r.descricao); set("f_especificacao", r.especificacao); set("f_marca", r.marca); set("f_modelo", r.modelo); set("f_serie", r.serie);
        if (r.classe && R.CLASSES[r.classe] && novo) { PH.$("#f_classe").value = r.classe; PH.$("#f_classe").dispatchEvent(new Event("change")); }
        if (R.CONSERV.includes(r.conservacao)) PH.$("#f_conservacao").value = r.conservacao;
        msg.textContent = "Sugestão aplicada nos campos vazios. Confira marca, modelo e série na plaqueta do fabricante.";
      } catch (e) { msg.textContent = e.message; }
      finally { aiBtn.disabled = false; }
    };

    PH.$("#f-save").onclick = async () => {
      const g = PH.val, err = PH.$("#f_err"); err.textContent = "";
      const body = {
        descricao: g("f_descricao"), especificacao: g("f_especificacao"), marca: g("f_marca"), modelo: g("f_modelo"), serie: g("f_serie"), classe: g("f_classe"),
        vida_util: g("f_vida"), residual: g("f_residual"), incorporacao: g("f_incorporacao"), data_aquisicao: g("f_data"), valor: g("f_valor"), documento: g("f_documento"),
        fornecedor: g("f_fornecedor"), garantia: g("f_garantia"), local: g("f_local"), conservacao: g("f_conservacao"), situacao: g("f_situacao"), class_inservivel: g("f_inserv"), obs: g("f_obs"),
        anvisa: g("f_anvisa"), risco: g("f_risco"), per_preventiva: g("f_perprev"), ult_preventiva: g("f_ultprev"), per_calibracao: g("f_percal"), ult_calibracao: g("f_ultcal"),
      };
      if (novo) Object.assign(body, { unidade_id: g("f_unidade"), setor_id: g("f_setor"), responsavel: g("f_responsavel"), responsavel_mat: g("f_respmat") });
      const btn = PH.$("#f-save"); btn.disabled = true; btn.textContent = "Salvando…";
      try {
        const saved = novo ? await PH.api("POST", "/bens", body) : await PH.api("PUT", "/bens/" + b.id, body);
        let falhas = 0;
        for (const f of fotosNovas) { try { await PH.api("POST", `/bens/${saved.id}/fotos`, f); } catch (_) { falhas++; } }
        PH.invalidate();
        PH.toast(novo ? `Bem ${PH.num(saved.numero)} cadastrado.${falhas ? ` ${falhas} foto(s) não foram enviadas.` : ""}` : "Alterações salvas.", falhas > 0);
        PH.go("#/bem/" + saved.id);
      } catch (e) { err.textContent = e.message; btn.disabled = false; btn.textContent = novo ? "Cadastrar bem" : "Salvar alterações"; }
    };
  }
})();
