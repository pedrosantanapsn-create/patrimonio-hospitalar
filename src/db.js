"use strict";
const fs = require("fs");
const path = require("path");
const { Pool, types } = require("pg");

// DATE como texto 'AAAA-MM-DD' (evita deslocamento de fuso) e NUMERIC como número
types.setTypeParser(1082, v => v);
types.setTypeParser(1700, v => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, v => (v === null ? null : parseInt(v, 10)));

const connectionString = process.env.DATABASE_URL || "postgres://app@localhost:5432/patrimonio";
const useSSL = process.env.DATABASE_SSL === "true" || (/render\.com|railway|amazonaws|neon\.tech|supabase/.test(connectionString) && process.env.DATABASE_SSL !== "false");

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: Number(process.env.DB_POOL_MAX || 10),
});

async function q(text, params) { return pool.query(text, params); }
async function one(text, params) { const r = await pool.query(text, params); return r.rows[0] || null; }

/** Executa fn(client) dentro de uma transação. */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch (_) { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}

/** Próximo valor de um contador da entidade (atômico, sem colisão entre usuários simultâneos). */
async function nextCounter(client, tenantId, nome) {
  const r = await client.query(
    `INSERT INTO counters (tenant_id, nome, valor) VALUES ($1, $2, 1)
     ON CONFLICT (tenant_id, nome) DO UPDATE SET valor = counters.valor + 1
     RETURNING valor`, [tenantId, nome]);
  return r.rows[0].valor;
}

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(sql);
}

module.exports = { pool, q, one, tx, nextCounter, migrate };
