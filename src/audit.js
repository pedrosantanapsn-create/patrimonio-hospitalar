"use strict";
const { q } = require("./db");

/**
 * Registra uma operação na trilha de auditoria (somente inserção; o banco bloqueia alteração/exclusão).
 * `client` opcional: usa a transação em curso para que auditoria e operação sejam atômicas.
 */
async function audit(req, acao, entidade, entidadeId, antes, depois, client) {
  const runner = client || { query: q };
  const strip = o => {
    if (!o) return null;
    const c = { ...o };
    delete c.senha_hash; delete c.dados; delete c.thumb;
    return c;
  };
  await runner.query(
    `INSERT INTO audit_log (tenant_id, user_id, user_nome, acao, entidade, entidade_id, antes, depois, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [req.tenant?.id || null, req.user?.id || null, req.user?.nome || null, acao, entidade,
     entidadeId == null ? null : String(entidadeId), JSON.stringify(strip(antes)), JSON.stringify(strip(depois)), req.ip]);
}

module.exports = { audit };
