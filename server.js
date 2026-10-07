"use strict";
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const { migrate, one, q } = require("./src/db");
const auth = require("./src/auth");
const { HttpError } = require("./src/util");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'"],
      "style-src-attr": ["'unsafe-inline'"],
      "img-src": ["'self'", "data:", "blob:"],
      "font-src": ["'self'"],
      "connect-src": ["'self'"],
      "media-src": ["'self'", "blob:"],
      "worker-src": ["'self'"],
      "frame-ancestors": ["'none'"],
      "form-action": ["'self'"],
      "upgrade-insecure-requests": process.env.NODE_ENV === "production" ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  permissionsPolicy: undefined,
}));
app.use((_req, res, next) => { res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()"); next(); });
app.use(compression());
app.use(express.json({ limit: "8mb" }));

app.get("/healthz", async (_req, res) => {
  try { await q("SELECT 1"); res.json({ ok: true }); } catch (_) { res.status(503).json({ ok: false }); }
});

app.use(auth.loadSession);
app.use("/api", auth.csrfGuard);
app.use("/api", require("./src/routes/conta"));
app.use("/api", require("./src/routes/bens"));
app.use("/api", require("./src/routes/inventario"));
app.use("/api", (_req, res) => res.status(404).json({ erro: "Recurso não encontrado." }));
app.use("/docs", require("./src/routes/docs"));

app.use("/vendor/jsQR.js", (_req, res) => res.sendFile(require.resolve("jsqr/dist/jsQR.js")));
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, p) => {
    if (p.endsWith("sw.js")) res.setHeader("Cache-Control", "no-cache");
    else if (/\.(woff2|png|svg)$/.test(p)) res.setHeader("Cache-Control", "public, max-age=604800");
    else res.setHeader("Cache-Control", "no-cache");
  },
}));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// Erros
app.use((err, req, res, _next) => {
  const status = err instanceof HttpError ? err.status : (err.type === "entity.too.large" ? 413 : 500);
  if (status >= 500) console.error(err);
  const msg = status === 413 ? "Arquivo grande demais." : status >= 500 ? "Erro interno. Tente novamente; se persistir, contate o suporte." : err.message;
  if (req.path.startsWith("/docs") && status !== 401) {
    return res.status(status).type("html").send(`<!doctype html><meta charset="utf-8"><title>Documento indisponível</title><link rel="stylesheet" href="/css/doc.css"><main class="folha"><h1>Documento indisponível</h1><p>${String(msg).replace(/</g, "&lt;")}</p><p><a href="/">Voltar ao sistema</a></p></main>`);
  }
  if (req.path.startsWith("/docs")) return res.redirect("/#/login");
  res.status(status).json({ erro: msg });
});

/* Inicialização: cria o esquema e o primeiro usuário da plataforma, se definido por variáveis de ambiente. */
async function bootstrap() {
  await migrate();
  const email = process.env.ADMIN_EMAIL, senha = process.env.ADMIN_PASSWORD;
  if (email && senha && !await one(`SELECT 1 FROM users WHERE superadmin`)) {
    const err = auth.validatePassword(senha);
    if (err) throw new Error("ADMIN_PASSWORD: " + err);
    await q(`INSERT INTO users (tenant_id,nome,email,papel,superadmin,senha_hash,must_change) VALUES (NULL,$1,$2,'admin',true,$3,true)`,
      [process.env.ADMIN_NAME || "Administrador da plataforma", email, await auth.hashPassword(senha)]);
    console.log(`Usuário da plataforma criado: ${email}`);
  }
  await q(`DELETE FROM sessions WHERE expira_em < now()`);
}

if (require.main === module) {
  bootstrap().then(() => {
    const port = Number(process.env.PORT || 3000);
    app.listen(port, () => console.log(`Patrimônio Hospitalar em http://localhost:${port}`));
  }).catch(e => { console.error("Falha ao iniciar:", e); process.exit(1); });
}

module.exports = { app, bootstrap };
