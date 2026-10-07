"use strict";
/* Autenticação, plataforma (entidades contratantes), configuração da entidade, usuários e auditoria. */
const express = require("express");
const crypto = require("crypto");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { q, one, tx } = require("../db");
const { audit } = require("../audit");
const auth = require("../auth");
const { a, fail, str, int, num, oneOf } = require("../util");

const r = express.Router();

const tenantPublic = t => t && ({ id: t.id, slug: t.slug, nome: t.nome, cnpj: t.cnpj, natureza: t.natureza, ente: t.ente,
  contrato: t.contrato, prefixo: t.prefixo, config: t.config || {}, ativo: t.ativo });
const tempPassword = () => crypto.randomBytes(9).toString("base64url").replace(/[-_]/g, "x") + "7a";
const slugify = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const NATUREZAS = ["direta", "indireta", "os", "outra"];

/* ---------------- Autenticação ---------------- */
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => ipKeyGenerator(req.ip) + "|" + String(req.body?.email || "").toLowerCase(),
  message: { erro: "Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente." } });

r.post("/auth/login", loginLimiter, a(async (req, res) => {
  const email = str(req.body.email, 200), senha = String(req.body.senha || "");
  if (!email || !senha) fail(400, "Informe e-mail e senha.");
  const u = await one(`SELECT * FROM users WHERE lower(email)=lower($1)`, [email]);
  const ok = u && u.ativo && await auth.checkPassword(senha, u.senha_hash);
  if (!ok) {
    await audit(req, "login_falhou", "usuario", u?.id || null, null, { email });
    fail(401, "E-mail ou senha incorretos.");
  }
  if (u.tenant_id) {
    const t = await one(`SELECT ativo FROM tenants WHERE id=$1`, [u.tenant_id]);
    if (!t?.ativo) fail(403, "O acesso desta entidade está suspenso. Fale com o suporte da plataforma.");
  }
  await auth.createSession(res, u, req);
  await q(`UPDATE users SET ultimo_login=now() WHERE id=$1`, [u.id]);
  req.user = u; req.tenant = u.tenant_id ? { id: u.tenant_id } : null;
  await audit(req, "login", "usuario", u.id, null, null);
  res.json({ ok: true, must_change: u.must_change });
}));

r.post("/auth/logout", a(async (req, res) => {
  if (req.user) await audit(req, "logout", "usuario", req.user.id, null, null);
  await auth.destroySession(req, res);
  res.json({ ok: true });
}));

r.get("/auth/me", a(async (req, res) => {
  if (!req.user) return res.json({ user: null, appName: process.env.APP_NAME || "Patrimônio Hospitalar", owner: process.env.APP_OWNER || "" });
  const perms = Object.keys(auth.PERM).filter(p => auth.can(req.user, p));
  res.json({ user: req.user, tenant: tenantPublic(req.tenant), perms, papeis: auth.PAPEIS,
    ai: !!process.env.ANTHROPIC_API_KEY, appName: process.env.APP_NAME || "Patrimônio Hospitalar", owner: process.env.APP_OWNER || "" });
}));

r.post("/auth/senha", a(async (req, res) => {
  if (!req.user) fail(401, "Entre novamente.");
  const u = await one(`SELECT * FROM users WHERE id=$1`, [req.user.id]);
  if (!await auth.checkPassword(String(req.body.atual || ""), u.senha_hash)) fail(400, "A senha atual não confere.");
  const nova = String(req.body.nova || "");
  const err = auth.validatePassword(nova); if (err) fail(400, err);
  if (nova === req.body.atual) fail(400, "A nova senha precisa ser diferente da atual.");
  await q(`UPDATE users SET senha_hash=$1, must_change=false WHERE id=$2`, [await auth.hashPassword(nova), u.id]);
  await q(`DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2`, [u.id, req.sessionHash]);
  await audit(req, "senha_alterada", "usuario", u.id, null, null);
  res.json({ ok: true });
}));

/* ---------------- Plataforma (equipe da consultoria) ---------------- */
r.get("/plataforma/tenants", auth.requireAuth, auth.requireSuper, a(async (_req, res) => {
  const rows = (await q(`SELECT t.*,
      (SELECT count(*) FROM bens b WHERE b.tenant_id=t.id AND b.situacao<>'Baixado') AS bens,
      (SELECT count(*) FROM users u WHERE u.tenant_id=t.id AND u.ativo) AS usuarios,
      (SELECT count(*) FROM unidades x WHERE x.tenant_id=t.id) AS unidades
    FROM tenants t ORDER BY t.nome`)).rows;
  res.json(rows);
}));

r.post("/plataforma/tenants", auth.requireAuth, auth.requireSuper, a(async (req, res) => {
  const b = req.body || {};
  const nome = str(b.nome, 200); if (!nome) fail(400, "Informe o nome da entidade.");
  const slug = slugify(b.slug || nome); if (!slug) fail(400, "Identificador inválido.");
  const adminNome = str(b.admin_nome, 200), adminEmail = str(b.admin_email, 200);
  if (!adminNome || !adminEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) fail(400, "Informe nome e e-mail válidos do administrador da entidade.");
  if (await one(`SELECT 1 FROM tenants WHERE slug=$1`, [slug])) fail(409, "Já existe uma entidade com esse identificador.");
  if (await one(`SELECT 1 FROM users WHERE lower(email)=lower($1)`, [adminEmail])) fail(409, "Esse e-mail já está cadastrado na plataforma.");
  const senha = tempPassword();
  const out = await tx(async c => {
    const t = (await c.query(`INSERT INTO tenants (slug,nome,cnpj,natureza,ente,contrato,prefixo) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [slug, nome, str(b.cnpj, 20), oneOf(b.natureza || "direta", NATUREZAS, "Natureza"), str(b.ente, 200), str(b.contrato, 200), (str(b.prefixo, 8) || "PAT").toUpperCase()])).rows[0];
    const uni = str(b.unidade, 200);
    if (uni) await c.query(`INSERT INTO unidades (tenant_id,nome,cnes) VALUES ($1,$2,$3)`, [t.id, uni, str(b.cnes, 20)]);
    const u = (await c.query(`INSERT INTO users (tenant_id,nome,email,cargo,papel,senha_hash,must_change) VALUES ($1,$2,$3,$4,'admin',$5,true) RETURNING id`,
      [t.id, adminNome, adminEmail, str(b.admin_cargo, 120), await auth.hashPassword(senha)])).rows[0];
    await audit(req, "criar", "entidade", t.id, null, t, c);
    return { tenant: t, admin_id: u.id };
  });
  res.status(201).json({ ...out, senha_provisoria: senha });
}));

r.patch("/plataforma/tenants/:id", auth.requireAuth, auth.requireSuper, a(async (req, res) => {
  const id = int(req.params.id);
  const before = await one(`SELECT * FROM tenants WHERE id=$1`, [id]); if (!before) fail(404, "Entidade não encontrada.");
  const ativo = typeof req.body.ativo === "boolean" ? req.body.ativo : before.ativo;
  const t = await one(`UPDATE tenants SET ativo=$2 WHERE id=$1 RETURNING *`, [id, ativo]);
  if (!ativo) await q(`DELETE FROM sessions s USING users u WHERE s.user_id=u.id AND u.tenant_id=$1`, [id]);
  await audit(req, ativo ? "reativar" : "suspender", "entidade", id, before, t);
  res.json(t);
}));

r.post("/plataforma/entrar", auth.requireAuth, auth.requireSuper, a(async (req, res) => {
  const id = req.body.tenant_id === null ? null : int(req.body.tenant_id);
  if (id !== null && !await one(`SELECT 1 FROM tenants WHERE id=$1`, [id])) fail(404, "Entidade não encontrada.");
  await q(`UPDATE sessions SET tenant_id=$1 WHERE token_hash=$2`, [id, req.sessionHash]);
  req.tenant = id ? { id } : null;
  await audit(req, id ? "suporte_entrar" : "suporte_sair", "entidade", id, null, null);
  res.json({ ok: true });
}));

/* ---------------- Configuração da entidade ---------------- */
r.get("/cfg", auth.requireAuth, auth.requireTenant, a(async (req, res) => {
  const t = req.tenant.id;
  const [unidades, setores] = await Promise.all([
    q(`SELECT * FROM unidades WHERE tenant_id=$1 ORDER BY nome`, [t]),
    q(`SELECT s.*, u.nome AS unidade FROM setores s JOIN unidades u ON u.id=s.unidade_id WHERE s.tenant_id=$1 ORDER BY u.nome, s.nome`, [t]),
  ]);
  res.json({ tenant: tenantPublic(req.tenant), unidades: unidades.rows, setores: setores.rows });
}));

r.put("/cfg/entidade", auth.requireAuth, auth.requireTenant, auth.requirePerm("cfg"), a(async (req, res) => {
  const b = req.body || {}, before = req.tenant;
  const nome = str(b.nome, 200) || before.nome;
  const config = { ...(before.config || {}),
    limite_antieconomico: Math.min(100, Math.max(10, num(b.limite_antieconomico) ?? before.config?.limite_antieconomico ?? 50)),
    gestor_patrimonio: str(b.gestor_patrimonio, 200) ?? before.config?.gestor_patrimonio ?? null,
    cidade: str(b.cidade, 120) ?? before.config?.cidade ?? null };
  const t = await one(`UPDATE tenants SET nome=$2, cnpj=$3, ente=$4, contrato=$5, prefixo=$6, natureza=$7, config=$8 WHERE id=$1 RETURNING *`,
    [before.id, nome, str(b.cnpj, 20), str(b.ente, 200), str(b.contrato, 200), (str(b.prefixo, 8) || before.prefixo).toUpperCase(),
     oneOf(b.natureza || before.natureza, NATUREZAS, "Natureza"), config]);
  await audit(req, "alterar", "entidade", t.id, before, t);
  res.json(tenantPublic(t));
}));

r.post("/cfg/unidades", auth.requireAuth, auth.requireTenant, auth.requirePerm("cfg"), a(async (req, res) => {
  const nome = str(req.body.nome, 200); if (!nome) fail(400, "Informe o nome da unidade.");
  const u = await one(`INSERT INTO unidades (tenant_id,nome,cnes,endereco) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,nome) DO NOTHING RETURNING *`,
    [req.tenant.id, nome, str(req.body.cnes, 20), str(req.body.endereco, 300)]);
  if (!u) fail(409, "Já existe uma unidade com esse nome.");
  await audit(req, "criar", "unidade", u.id, null, u);
  res.status(201).json(u);
}));
r.patch("/cfg/unidades/:id", auth.requireAuth, auth.requireTenant, auth.requirePerm("cfg"), a(async (req, res) => {
  const before = await one(`SELECT * FROM unidades WHERE id=$1 AND tenant_id=$2`, [int(req.params.id), req.tenant.id]);
  if (!before) fail(404, "Unidade não encontrada.");
  const u = await one(`UPDATE unidades SET nome=$2, cnes=$3, endereco=$4, ativo=$5 WHERE id=$1 RETURNING *`,
    [before.id, str(req.body.nome, 200) || before.nome, str(req.body.cnes, 20), str(req.body.endereco, 300), req.body.ativo !== false]);
  await audit(req, "alterar", "unidade", u.id, before, u);
  res.json(u);
}));

r.post("/cfg/setores", auth.requireAuth, auth.requireTenant, auth.requirePerm("cfg"), a(async (req, res) => {
  const unidade = await one(`SELECT id FROM unidades WHERE id=$1 AND tenant_id=$2`, [int(req.body.unidade_id), req.tenant.id]);
  if (!unidade) fail(400, "Selecione a unidade do setor.");
  const nomes = String(req.body.nome || "").split("\n").map(s => s.trim()).filter(Boolean).slice(0, 100);
  if (!nomes.length) fail(400, "Informe o nome do setor.");
  const criados = [];
  for (const n of nomes) {
    const s = await one(`INSERT INTO setores (tenant_id,unidade_id,nome) VALUES ($1,$2,$3) ON CONFLICT (unidade_id,nome) DO NOTHING RETURNING *`, [req.tenant.id, unidade.id, n.slice(0, 120)]);
    if (s) { criados.push(s); await audit(req, "criar", "setor", s.id, null, s); }
  }
  res.status(201).json(criados);
}));
r.patch("/cfg/setores/:id", auth.requireAuth, auth.requireTenant, auth.requirePerm("cfg"), a(async (req, res) => {
  const before = await one(`SELECT * FROM setores WHERE id=$1 AND tenant_id=$2`, [int(req.params.id), req.tenant.id]);
  if (!before) fail(404, "Setor não encontrado.");
  const s = await one(`UPDATE setores SET nome=$2, ativo=$3 WHERE id=$1 RETURNING *`, [before.id, str(req.body.nome, 120) || before.nome, req.body.ativo !== false]);
  await audit(req, "alterar", "setor", s.id, before, s);
  res.json(s);
}));

/* ---------------- Usuários da entidade ---------------- */
const PAPEIS = Object.keys(auth.PAPEIS);
r.get("/usuarios", auth.requireAuth, auth.requireTenant, auth.requirePerm("users"), a(async (req, res) => {
  res.json((await q(`SELECT id,nome,email,cargo,matricula,papel,ativo,must_change,ultimo_login,criado_em FROM users WHERE tenant_id=$1 ORDER BY nome`, [req.tenant.id])).rows);
}));
r.post("/usuarios", auth.requireAuth, auth.requireTenant, auth.requirePerm("users"), a(async (req, res) => {
  const b = req.body || {};
  const nome = str(b.nome, 200), email = str(b.email, 200);
  if (!nome || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, "Informe nome e e-mail válidos.");
  if (await one(`SELECT 1 FROM users WHERE lower(email)=lower($1)`, [email])) fail(409, "Esse e-mail já está cadastrado.");
  const senha = tempPassword();
  const u = await one(`INSERT INTO users (tenant_id,nome,email,cargo,matricula,papel,senha_hash) VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING id,nome,email,cargo,matricula,papel,ativo`, [req.tenant.id, nome, email, str(b.cargo, 120), str(b.matricula, 40),
    oneOf(b.papel || "consulta", PAPEIS, "Perfil"), await auth.hashPassword(senha)]);
  await audit(req, "criar", "usuario", u.id, null, u);
  res.status(201).json({ ...u, senha_provisoria: senha });
}));
r.patch("/usuarios/:id", auth.requireAuth, auth.requireTenant, auth.requirePerm("users"), a(async (req, res) => {
  const before = await one(`SELECT id,nome,email,cargo,matricula,papel,ativo FROM users WHERE id=$1 AND tenant_id=$2`, [int(req.params.id), req.tenant.id]);
  if (!before) fail(404, "Usuário não encontrado.");
  const papel = oneOf(req.body.papel || before.papel, PAPEIS, "Perfil");
  const ativo = typeof req.body.ativo === "boolean" ? req.body.ativo : before.ativo;
  if (before.id === req.user.id && (papel !== "admin" || !ativo)) fail(400, "Você não pode retirar seu próprio acesso de administrador.");
  const u = await one(`UPDATE users SET nome=$2, cargo=$3, matricula=$4, papel=$5, ativo=$6 WHERE id=$1 RETURNING id,nome,email,cargo,matricula,papel,ativo`,
    [before.id, str(req.body.nome, 200) || before.nome, str(req.body.cargo, 120), str(req.body.matricula, 40), papel, ativo]);
  if (!ativo) await q(`DELETE FROM sessions WHERE user_id=$1`, [u.id]);
  await audit(req, "alterar", "usuario", u.id, before, u);
  res.json(u);
}));
r.post("/usuarios/:id/reset", auth.requireAuth, auth.requireTenant, auth.requirePerm("users"), a(async (req, res) => {
  const u = await one(`SELECT id FROM users WHERE id=$1 AND tenant_id=$2`, [int(req.params.id), req.tenant.id]);
  if (!u) fail(404, "Usuário não encontrado.");
  const senha = tempPassword();
  await q(`UPDATE users SET senha_hash=$2, must_change=true WHERE id=$1`, [u.id, await auth.hashPassword(senha)]);
  await q(`DELETE FROM sessions WHERE user_id=$1`, [u.id]);
  await audit(req, "redefinir_senha", "usuario", u.id, null, null);
  res.json({ senha_provisoria: senha });
}));

/* ---------------- Trilha de auditoria ---------------- */
r.get("/auditoria", auth.requireAuth, auth.requireTenant, auth.requirePerm("audit"), a(async (req, res) => {
  const lim = Math.min(200, int(req.query.limit) || 100);
  const params = [req.tenant.id, lim];
  let where = "tenant_id=$1";
  if (req.query.before) { params.push(int(req.query.before)); where += ` AND id < $${params.length}`; }
  if (req.query.entidade) { params.push(String(req.query.entidade)); where += ` AND entidade = $${params.length}`; }
  if (req.query.entidade_id) { params.push(String(req.query.entidade_id)); where += ` AND entidade_id = $${params.length}`; }
  res.json((await q(`SELECT id,user_nome,acao,entidade,entidade_id,antes,depois,ip,em FROM audit_log WHERE ${where} ORDER BY id DESC LIMIT $2`, params)).rows);
}));

module.exports = r;
