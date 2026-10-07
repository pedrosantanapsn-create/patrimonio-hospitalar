/* Service worker: guarda a interface para abrir rápido e funcionar como aplicativo instalado.
   Dados (API) e documentos nunca são guardados no aparelho: sempre vêm do servidor. */
const CACHE = "ph-shell-v1";
const SHELL = ["/", "/index.html", "/css/app.css", "/css/doc.css", "/js/regras.js", "/js/core.js", "/js/scanner.js", "/js/v-bens.js",
  "/js/v-operacoes.js", "/js/v-gestao.js", "/js/main.js", "/js/print.js", "/vendor/jsQR.js", "/manifest.webmanifest", "/icons/icon-192.png",
  "/fonts/archivo-latin-600-normal.woff2", "/fonts/archivo-latin-700-normal.woff2", "/fonts/ibm-plex-sans-latin-400-normal.woff2",
  "/fonts/ibm-plex-sans-latin-500-normal.woff2", "/fonts/ibm-plex-sans-latin-600-normal.woff2", "/fonts/ibm-plex-mono-latin-500-normal.woff2", "/fonts/ibm-plex-mono-latin-600-normal.woff2"];

self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/docs/")) return;
  // Rede primeiro (versão mais nova), cache como reserva quando estiver sem conexão
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request.mode === "navigate" ? "/index.html" : e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request.mode === "navigate" ? "/index.html" : e.request)));
});
