/* Inicialização, layout e roteamento. */
(function () {
  "use strict";
  const PH = window.PH, S = PH.S, { esc, ICON } = PH;

  PH.boot = async function () {
    const me = await PH.api("GET", "/auth/me");
    S.appName = me.appName; S.owner = me.owner;
    S.me = me.user ? { ...me, user: me.user } : null;
    if (S.me) document.title = `${me.tenant ? me.tenant.nome + " · " : ""}${me.appName}`;
  };
  PH.logout = async function () {
    try { await PH.api("POST", "/auth/logout"); } catch (_) { /* segue */ }
    S.me = null; S.cfg = null; PH.invalidate(); location.hash = "#/login"; PH.render();
  };

  const NAV = [
    ["#/painel", "Painel", null], ["#/bens", "Bens", null], ["#/inventario", "Inventário", null], ["#/engenharia", "Engenharia clínica", null],
    ["#/relatorios", "Relatórios", null], ["#/config", "Configurações", "cfg"],
  ];

  function layout(app) {
    const me = S.me, t = me.tenant, u = me.user;
    const hash = location.hash || "#/painel";
    const nav = t ? NAV.filter(([, , p]) => !p || PH.can(p)) : [];
    if (u.superadmin) nav.push(["#/plataforma", "Plataforma", null]);
    app.innerHTML = `
      ${u.superadmin && t ? `<div class="support">Modo suporte em <b>${esc(t.nome)}</b>. Suas operações ficam registradas na auditoria da entidade.<button class="btn sm" id="sup-exit">Sair do modo suporte</button></div>` : ""}
      <header class="top"><div class="wrap">
        <a class="brand" href="#/painel"><div class="seal">${ICON.seal}</div><div class="brand-t"><b>${esc(S.appName)}</b><span>${esc(t ? t.nome : "Equipe da plataforma")}</span></div></a>
        <div class="top-actions">${t ? `<button class="btn icon" id="scan-top" aria-label="Ler etiqueta" title="Ler etiqueta">${ICON.qr}</button>` : ""}
          <button class="btn" id="me-btn" aria-haspopup="true">${ICON.user}<span class="hide-sm">${esc(u.nome.split(" ")[0])}</span></button></div>
        <nav class="tabs" aria-label="Seções">${nav.map(([h, l]) => `<a class="tab" href="${h}" ${hash.startsWith(h) || (h === "#/bens" && /^#\/(bem|novo|editar)/.test(hash)) ? 'aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
      </div></header>
      <main id="view" class="wrap"><p class="loading">Carregando…</p></main>
      <footer class="foot-app">${esc(S.appName)}${S.owner ? " · " + esc(S.owner) : ""}</footer>`;
    const st = PH.$("#scan-top"); if (st) st.onclick = PH.scanToBem;
    const se = PH.$("#sup-exit"); if (se) se.onclick = async () => { await PH.api("POST", "/plataforma/entrar", { tenant_id: null }); S.cfg = null; PH.invalidate(); await PH.boot(); PH.go("#/plataforma"); };
    PH.$("#me-btn").onclick = () => {
      PH.modal("Minha conta", `<dl class="kv"><div><dt>Nome</dt><dd>${esc(u.nome)}</dd></div><div><dt>E-mail</dt><dd>${esc(u.email)}</dd></div>
        <div><dt>Perfil</dt><dd>${u.superadmin ? "Equipe da plataforma" : esc(me.papeis[u.papel] || u.papel)}</dd></div><div><dt>Entidade</dt><dd>${esc(t?.nome || "—")}</dd></div></dl>
        <div class="row"><a class="btn" href="#/senha-trocar" data-close>Trocar senha</a><button class="btn danger" id="lo">${ICON.out2}Sair</button></div>`, null, { narrow: true });
      PH.$("#lo").onclick = () => { PH.closeModal(); PH.logout(); };
    };
    return PH.$("#view");
  }

  let rendering = 0;
  PH.render = async function () {
    const my = ++rendering;
    const app = PH.$("#app");
    PH.closeModal();
    const hash = (location.hash || "#/").slice(1) || "/";
    if (!S.me) {
      if (hash !== "/login" && hash !== "/") sessionStorage.setItem("ph_after_login", "#" + hash);
      if (hash !== "/login") history.replaceState(null, "", "#/login");
      return PH.renderLogin(app);
    }
    if (S.me.user.must_change || hash === "/senha") return PH.renderSenha(app, S.me.user.must_change);
    if (hash === "/senha-trocar") return PH.renderSenha(app, false);
    let path = hash === "/" || hash === "/login" ? (S.me.tenant ? "/painel" : "/plataforma") : hash;
    if (!S.me.tenant && !S.me.user.superadmin) { app.innerHTML = `<div class="login"><div class="box"><h1>Sem entidade vinculada</h1><p>Seu usuário não está vinculado a uma entidade. Fale com o suporte.</p><button class="btn" id="lo">Sair</button></div></div>`; PH.$("#lo").onclick = PH.logout; return; }
    let match = null, params = [];
    for (const r of PH.routes) { const m = path.match(r.re); if (m) { match = r; params = m.slice(1).map(decodeURIComponent); break; } }
    if (match && !S.me.tenant && !match.semTenant) { path = "/plataforma"; match = PH.routes.find(r => r.re.test("/plataforma")); params = []; }
    if (path !== hash) history.replaceState(null, "", "#" + path);
    const view = layout(app);
    if (!match) { view.innerHTML = `<div class="panel empty"><h2>Página não encontrada</h2><p><a href="#/painel">Voltar ao painel</a></p></div>`; return; }
    if ((match.perm && !PH.can(match.perm)) || (match.superOnly && !S.me.user.superadmin)) { view.innerHTML = `<div class="panel empty"><h2>Acesso não permitido</h2><p>Seu perfil não tem acesso a esta área.</p></div>`; return; }
    try {
      await match.handler(view, ...params);
    } catch (e) {
      if (my !== rendering) return;
      if (e.status === 401) return;
      view.innerHTML = `<div class="panel empty"><h2>Não foi possível carregar</h2><p>${esc(e.message)}</p><button class="btn" id="retry">Tentar de novo</button></div>`;
      PH.$("#retry").onclick = () => { PH.invalidate(); PH.render(); };
    }
    if (my === rendering) window.scrollTo({ top: 0 });
  };

  window.addEventListener("hashchange", () => PH.render());
  (async () => {
    try { await PH.boot(); } catch (e) { S.me = null; }
    PH.render();
  })();

  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
})();
