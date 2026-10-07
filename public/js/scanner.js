/* Leitura de etiquetas QR pela câmera (BarcodeDetector nativo ou jsQR como alternativa). */
(function () {
  "use strict";
  const PH = window.PH;
  let jsqrLoading = null;
  const loadJsQR = () => jsqrLoading || (jsqrLoading = new Promise((res, rej) => {
    if (window.jsQR) return res();
    const s = document.createElement("script"); s.src = "/vendor/jsQR.js"; s.onload = res; s.onerror = () => rej(new Error("Leitor indisponível."));
    document.head.appendChild(s);
  }));

  /** Interpreta o conteúdo lido: URL da etiqueta (…/#/q/<entidade>/<número>), "PAT-000012" ou só o número. */
  PH.parseCode = function (text) {
    const t = String(text || "").trim();
    let m = t.match(/#\/q\/([a-z0-9-]+)\/(\d+)/i);
    if (m) return { slug: m[1], numero: Number(m[2]) };
    m = t.match(/^[A-Z]{1,8}-0*(\d{1,9})$/i) || t.match(/^0*(\d{1,9})$/);
    if (m) return { slug: null, numero: Number(m[1]) };
    return null;
  };

  /**
   * Abre a câmera e chama onCode(resultado) a cada etiqueta lida.
   * onCode retorna true para fechar o leitor ou false para continuar lendo (conferência em sequência).
   */
  PH.scan = async function ({ titulo = "Aponte para a etiqueta", onCode }) {
    if (!navigator.mediaDevices?.getUserMedia) { PH.toast("Este navegador não permite usar a câmera. Digite o número da plaqueta.", true); return; }
    const el = document.createElement("div");
    el.className = "scanner";
    el.innerHTML = `<video playsinline muted></video><div class="frame"></div><div class="top-msg">${PH.esc(titulo)}</div>
      <div class="bar"><span class="msg" aria-live="polite">Procurando etiqueta…</span><button class="btn" data-torch hidden>Lanterna</button><button class="btn" data-close>Fechar</button></div>`;
    document.body.appendChild(el);
    const video = el.querySelector("video"), msg = el.querySelector(".msg");
    let stream, stop = false, last = "", lastAt = 0;
    const close = () => { stop = true; stream?.getTracks().forEach(t => t.stop()); el.remove(); };
    el.querySelector("[data-close]").onclick = close;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
    } catch (e) {
      close(); PH.toast(e.name === "NotAllowedError" ? "Acesso à câmera negado. Libere a câmera nas permissões do navegador." : "Não foi possível abrir a câmera.", true); return;
    }
    video.srcObject = stream; await video.play().catch(() => {});
    const track = stream.getVideoTracks()[0];
    if (track?.getCapabilities?.().torch) {
      const tb = el.querySelector("[data-torch]"); tb.hidden = false; let on = false;
      tb.onclick = () => { on = !on; track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {}); };
    }
    let detector = null;
    if ("BarcodeDetector" in window) { try { detector = new window.BarcodeDetector({ formats: ["qr_code"] }); } catch (_) { detector = null; } }
    if (!detector) { try { await loadJsQR(); } catch (_) { close(); PH.toast("Leitor de QR indisponível. Digite o número.", true); return; } }
    const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d", { willReadFrequently: true });

    const handle = async text => {
      const now = Date.now();
      if (text === last && now - lastAt < 2500) return;          // evita leitura repetida da mesma etiqueta
      last = text; lastAt = now;
      const code = PH.parseCode(text);
      if (!code) { msg.textContent = "Código lido não é uma etiqueta patrimonial."; return; }
      if (navigator.vibrate) navigator.vibrate(60);
      msg.textContent = `Lido: nº ${code.numero}`;
      const fechar = await onCode(code, m => { msg.textContent = m; });
      if (fechar !== false) close();
    };
    const tick = async () => {
      if (stop) return;
      if (video.readyState >= 2) {
        try {
          if (detector) {
            const codes = await detector.detect(video);
            if (codes[0]) await handle(codes[0].rawValue);
          } else {
            const w = Math.min(640, video.videoWidth), h = Math.round(video.videoHeight * w / video.videoWidth);
            canvas.width = w; canvas.height = h; ctx.drawImage(video, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const r = window.jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
            if (r?.data) await handle(r.data);
          }
        } catch (_) { /* quadro ilegível: tenta o próximo */ }
      }
      setTimeout(() => requestAnimationFrame(tick), 120);
    };
    tick();
  };
})();
