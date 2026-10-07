/* Núcleo da interface: estado, API, utilitários, modal e roteamento. */
(function () {
  "use strict";
  const R = window.Regras;
  const PH = window.PH = { R, routes: [], S: { me: null, cfg: null, bens: null, invs: null } };
  const S = PH.S;

  /* ---------- Utilitários ---------- */
  PH.$ = (s, r = document) => r.querySelector(s);
  PH.$$ = (s, r = document) => [...r.querySelectorAll(s)];
  PH.esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  PH.brl = n => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  PH.dbr = iso => { if (!iso) return "—"; const [y, m, d] = String(iso).slice(0, 10).split("-"); return d && m && y ? `${d}/${m}/${y}` : "—"; };
  PH.dtbr = ts => ts ? new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
  PH.hoje = () => R.iso(new Date());
  PH.num = n => R.numFmt(S.me?.tenant?.prefixo, n);
  PH.can = p => !!S.me?.perms?.includes(p);
  PH.opt = (list, val, labels) => list.map((o, i) => `<option value="${PH.esc(o)}" ${String(o) === String(val ?? "") ? "selected" : ""}>${PH.esc(labels ? labels[i] : o)}</option>`).join("");
  const esc = PH.esc;

  /* ---------- API ---------- */
  PH.api = async function (method, path, body) {
    const res = await fetch("/api" + path, {
      method, credentials: "same-origin",
      headers: { "content-type": "application/json", "X-PH": "1" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch (_) { /* sem corpo */ }
    if (!res.ok) {
      if (res.status === 401 && !path.startsWith("/auth/")) { S.me = null; location.hash = "#/login"; }
      if (data?.codigo === "must_change") { location.hash = "#/senha"; }
      const e = new Error(data?.erro || `Não foi possível concluir (erro ${res.status}).`); e.status = res.status; e.codigo = data?.codigo; throw e;
    }
    return data;
  };

  /* ---------- Avisos ---------- */
  PH.toast = function (msg, bad) {
    const t = PH.$("#toast"); t.textContent = msg; t.className = "toast" + (bad ? " bad" : ""); t.hidden = false;
    clearTimeout(PH.toast._t); PH.toast._t = setTimeout(() => { t.hidden = true; }, bad ? 6000 : 3500);
  };

  /* ---------- Ícones ---------- */
  const sv = (p, w = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  PH.ICON = {
    med: sv('<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M6 11h3l1.5-3 2.5 6 1.5-3H18M9 21h6M12 17v4"/>'),
    maq: sv('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
    info: sv('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>'),
    mov: sv('<path d="M5 11V6a2 2 0 012-2h10a2 2 0 012 2v5M3 11h18v5H3zM5 16v4M19 16v4"/>'),
    com: sv('<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M10 9l5 2.5-5 2.5z"/>'),
    vei: sv('<path d="M3 16V9l3-4h9l3 4h3v7"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>'),
    out: sv('<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>'),
    plus: sv('<path d="M12 5v14M5 12h14"/>', 2), x: sv('<path d="M6 6l12 12M18 6L6 18"/>', 2),
    qr: sv('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M17 21h4v-4M14 21v-3"/>'),
    doc: sv('<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
    dl: sv('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', 2),
    spark: sv('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'),
    user: sv('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
    out2: sv('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>'),
    seal: sv('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M8 6V4h8v2M12 10v5M9.5 12.5h5"/>', 2),
  };
  PH.thumb = (b, cls = "thumb") => b.foto ? `<img class="${cls}" src="/api/fotos/${esc(b.foto)}?t=thumb" alt="" loading="lazy">` : `<div class="${cls}">${PH.ICON[b.classe] || PH.ICON.out}</div>`;
  PH.sitChip = s => `<span class="chip ${({ "Em uso": "ok", "Em manutenção": "warn", "Em almoxarifado": "info", "Inservível": "bad" })[s] || "mute"}">${esc(s)}</span>`;

  /* ---------- Modal (painel lateral) ---------- */
  PH.modal = function (title, body, footer, opts = {}) {
    const root = PH.$("#modal-root");
    root.innerHTML = `<div class="scrim"><div class="sheet${opts.narrow ? " narrow" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-h"><h2>${esc(title)}</h2><button class="btn ghost icon" data-close aria-label="Fechar">${PH.ICON.x}</button></div>
      <div class="sheet-b">${body}</div>${footer ? `<div class="sheet-f"><p class="err" id="m-err" role="alert"></p>${footer}</div>` : ""}</div></div>`;
    document.body.style.overflow = "hidden";
    const scrim = root.firstElementChild;
    scrim.addEventListener("click", e => { if (e.target === scrim || e.target.closest("[data-close]")) PH.closeModal(); });
    const f = root.querySelector("input:not([disabled]):not([type=hidden]), select, textarea");
    if (f && !opts.noFocus && matchMedia("(pointer:fine)").matches) setTimeout(() => f.focus(), 50);
    return root.firstElementChild;
  };
  PH.closeModal = function () { PH.$("#modal-root").innerHTML = ""; document.body.style.overflow = ""; };
  PH.modalErr = msg => { const e = PH.$("#m-err"); if (e) e.textContent = msg || ""; };
  document.addEventListener("keydown", e => { if (e.key === "Escape" && PH.$("#modal-root").firstElementChild) PH.closeModal(); });

  /** Executa uma ação de botão com estado de carregamento e mensagem de erro no modal. */
  PH.busy = async function (btn, fn) {
    const txt = btn.innerHTML; btn.disabled = true; btn.textContent = "Salvando…"; PH.modalErr("");
    try { return await fn(); }
    catch (e) { PH.modalErr(e.message); if (!PH.$("#m-err")) PH.toast(e.message, true); }
    finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = txt; } }
  };
  PH.val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };

  /* ---------- Imagens ---------- */
  PH.readImage = file => new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); res(im); }; im.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Não foi possível ler essa imagem.")); };
    im.src = url;
  });
  PH.jpeg = (im, max, q) => {
    const s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", q).split(",")[1];
  };
  PH.pickImage = () => new Promise(resolve => {
    const fp = PH.$("#filepick"); fp.value = "";
    fp.onchange = async () => {
      const f = fp.files?.[0]; if (!f) return resolve(null);
      try { const im = await PH.readImage(f); resolve({ full: PH.jpeg(im, 1600, 0.82), thumb: PH.jpeg(im, 240, 0.72) }); }
      catch (e) { PH.toast(e.message, true); resolve(null); }
    };
    fp.click();
  });

  /* ---------- Dados em cache ---------- */
  PH.loadCfg = async (force) => { if (!S.cfg || force) S.cfg = await PH.api("GET", "/cfg"); return S.cfg; };
  PH.loadBens = async (force) => { if (!S.bens || force) S.bens = await PH.api("GET", "/bens"); return S.bens; };
  PH.loadInvs = async (force) => { if (!S.invs || force) S.invs = await PH.api("GET", "/inventarios"); return S.invs; };
  PH.invalidate = () => { S.bens = null; S.invs = null; };
  PH.setoresDe = uid => (S.cfg?.setores || []).filter(s => s.unidade_id === Number(uid) && s.ativo);
  PH.unidadesAtivas = () => (S.cfg?.unidades || []).filter(u => u.ativo);

  /* ---------- Roteamento ---------- */
  PH.route = (pattern, handler, opts = {}) => PH.routes.push({ re: new RegExp("^" + pattern.replace(/:[a-z]+/g, "([^/]+)") + "$"), handler, ...opts });
  PH.go = h => { if (location.hash === h) PH.render(); else location.hash = h; };
})();
