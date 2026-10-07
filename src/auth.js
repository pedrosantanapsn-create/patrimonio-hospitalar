"use strict";
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { q, one } = require("./db");

const COOKIE = "ph_sess";
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);
const PROD = process.env.NODE_ENV === "production";

const PAPEIS = {
  admin: "Administrador da entidade",
  patrimonio: "Setor de Patrimônio",
  engenharia: "Engenharia clínica",
  inventariante: "Comissão de inventário",
  consulta: "Somente consulta",
};

/* Matriz de permissões por perfil (princípio do menor privilégio) */
const PERM = {
  "bens.write":   ["admin", "patrimonio"],
  "bens.saude":   ["admin", "patrimonio", "engenharia"],
  "manut.write":  ["admin", "patrimonio", "engenharia"],
  "transf":       ["admin", "patrimonio"],
  "baixa":        ["admin", "patrimonio"],
  "reav":         ["admin", "patrimonio"],
  "inv.manage":   ["admin", "patrimonio"],
  "inv.conferir": ["admin", "patrimonio", "inventariante"],
  "bens.delete":  ["admin"],
  "cfg":          ["admin"],
  "users":        ["admin"],
  "audit":        ["admin"],
};

const sha = s => crypto.createHash("sha256").update(s).digest("hex");

function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach(p => {
    const i = p.indexOf("=");
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function setCookie(res, value, maxAgeSec) {
  const parts = [`${COOKIE}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSec}`];
  if (PROD) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

async function hashPassword(pw) { return bcrypt.hash(pw, 11); }
async function checkPassword(pw, hash) { return bcrypt.compare(pw, hash); }

function validatePassword(pw) {
  if (typeof pw !== "string" || pw.length < 10) return "A senha precisa ter pelo menos 10 caracteres.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "A senha precisa ter letras e números.";
  return null;
}

async function createSession(res, user, req) {
  const token = crypto.randomBytes(32).toString("base64url");
  const exp = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
  await q(`INSERT INTO sessions (token_hash, user_id, tenant_id, ip, user_agent, expira_em) VALUES ($1,$2,$3,$4,$5,$6)`,
    [sha(token), user.id, user.tenant_id, req.ip, (req.get("user-agent") || "").slice(0, 300), exp]);
  setCookie(res, token, SESSION_HOURS * 3600);
}

async function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) await q(`DELETE FROM sessions WHERE token_hash=$1`, [sha(token)]);
  setCookie(res, "", 0);
}

/** Carrega o usuário da sessão em req.user / req.tenant (ou nada). */
async function loadSession(req, _res, next) {
  try {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (!token) return next();
    const row = await one(
      `SELECT s.token_hash, s.tenant_id AS sess_tenant, s.expira_em,
              u.id, u.nome, u.email, u.cargo, u.matricula, u.papel, u.superadmin, u.must_change, u.ativo, u.tenant_id
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1`, [sha(token)]);
    if (!row || !row.ativo || new Date(row.expira_em) < new Date()) return next();
    const tenantId = row.superadmin ? row.sess_tenant : row.tenant_id;
    let tenant = null;
    if (tenantId) {
      tenant = await one(`SELECT * FROM tenants WHERE id=$1`, [tenantId]);
      if (tenant && !tenant.ativo && !row.superadmin) return next();
    }
    req.user = {
      id: row.id, nome: row.nome, email: row.email, cargo: row.cargo, matricula: row.matricula,
      papel: row.superadmin ? "admin" : row.papel, superadmin: row.superadmin, must_change: row.must_change,
    };
    req.tenant = tenant;
    req.sessionHash = row.token_hash;
    next();
  } catch (e) { next(e); }
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ erro: "Sua sessão terminou. Entre novamente." });
  if (req.user.must_change && !req.path.startsWith("/auth")) return res.status(403).json({ erro: "Troque sua senha antes de continuar.", codigo: "must_change" });
  next();
}
function requireTenant(req, res, next) {
  if (!req.tenant) return res.status(400).json({ erro: "Selecione uma entidade para continuar.", codigo: "no_tenant" });
  next();
}
function can(user, perm) { return !!user && (user.superadmin || (PERM[perm] || []).includes(user.papel)); }
function requirePerm(perm) {
  return (req, res, next) => can(req.user, perm) ? next() : res.status(403).json({ erro: "Seu perfil não permite esta operação." });
}
function requireSuper(req, res, next) {
  if (!req.user?.superadmin) return res.status(403).json({ erro: "Área restrita à equipe da plataforma." });
  next();
}
/** Proteção CSRF: toda escrita na API exige cabeçalho próprio, que outro site não consegue enviar. */
function csrfGuard(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("X-PH") !== "1") return res.status(403).json({ erro: "Requisição recusada." });
  next();
}

module.exports = { PAPEIS, PERM, can, hashPassword, checkPassword, validatePassword, createSession, destroySession,
  loadSession, requireAuth, requireTenant, requirePerm, requireSuper, csrfGuard, sha };
