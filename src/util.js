"use strict";

/** Envolve handlers assíncronos para encaminhar erros ao Express. */
const a = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}
const fail = (status, msg) => { throw new HttpError(status, msg); };

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const str = (v, max = 500) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const num = v => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const int = v => { const n = num(v); return n === null ? null : Math.trunc(n); };
const date = v => {
  const s = str(v, 10);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(new Date(s + "T12:00:00"))) fail(400, `Data inválida: ${s}. Use o formato AAAA-MM-DD.`);
  return s;
};
const oneOf = (v, list, label) => {
  if (v === null || v === undefined || v === "") return null;
  if (!list.includes(v)) fail(400, `${label} inválido(a): ${v}.`);
  return v;
};
const brl = n => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dbr = isoDate => {
  if (!isoDate) return "—";
  const s = isoDate instanceof Date ? isoDate.toISOString() : String(isoDate);
  const [y, m, d] = s.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : "—";
};
const hojeISO = () => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: process.env.TZ_LOCAL || "America/Sao_Paulo" }));
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};
const uuidOk = s => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

module.exports = { a, HttpError, fail, esc, str, num, int, date, oneOf, brl, dbr, hojeISO, uuidOk };
