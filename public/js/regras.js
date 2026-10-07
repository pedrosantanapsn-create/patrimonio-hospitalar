/* Regras de negócio compartilhadas entre o servidor (Node) e o navegador. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Regras = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Classes de bens móveis e contas do PCASP (1.2.3.1.1.xx). Vida útil e residual são referências ajustáveis. */
  const CLASSES = {
    med:  { nome: "Equipamento médico-hospitalar", conta: "1.2.3.1.1.01", vida: 10, residual: 10, saude: true },
    maq:  { nome: "Máquinas, aparelhos e ferramentas", conta: "1.2.3.1.1.01", vida: 10, residual: 10 },
    info: { nome: "Bens de informática", conta: "1.2.3.1.1.02", vida: 5, residual: 10 },
    mov:  { nome: "Móveis e utensílios", conta: "1.2.3.1.1.03", vida: 10, residual: 10 },
    com:  { nome: "Materiais de comunicação, culturais e educacionais", conta: "1.2.3.1.1.04", vida: 10, residual: 10 },
    vei:  { nome: "Veículos", conta: "1.2.3.1.1.05", vida: 15, residual: 10 },
    out:  { nome: "Demais bens móveis", conta: "1.2.3.1.1.99", vida: 10, residual: 10 },
  };
  const SITUACOES = ["Em uso", "Em manutenção", "Em almoxarifado", "Ocioso", "Inservível", "Baixado"];
  const CONSERV = ["Novo", "Bom", "Regular", "Ruim"];
  const INSERV = ["Ocioso", "Recuperável", "Antieconômico", "Irrecuperável"];
  const INCORP = ["Compra", "Doação recebida", "Transferência recebida", "Cessão de uso (terceiro)", "Comodato (terceiro)",
    "Locação (terceiro)", "Fabricação própria", "Incorporação por inventário"];
  const MOTIVOS_BAIXA = ["Alienação (venda/leilão)", "Doação", "Transferência a outro órgão", "Inutilização ou abandono",
    "Furto, roubo ou extravio", "Sinistro", "Devolução ao proprietário (bem de terceiro)"];
  const RISCO = ["", "Classe I", "Classe II", "Classe III", "Classe IV"];
  const TIPOS_INV = ["Anual", "Inicial", "Transferência de gestão", "Extraordinário"];

  const isTerceiro = b => /terceiro/i.test(b.incorporacao || "");
  const ativo = b => b.situacao !== "Baixado";

  function parse(iso) { if (!iso) return null; const s = String(iso).slice(0, 10); const d = new Date(s + "T12:00:00"); return isNaN(d) ? null : d; }
  function iso(d) { if (!d) return null; return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function addMonths(isoDate, m) { const d = parse(isoDate); if (!d || !m) return null; d.setMonth(d.getMonth() + Number(m)); return d; }
  function monthsBetween(a, b) { let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()); if (b.getDate() < a.getDate()) m--; return Math.max(0, m); }

  /**
   * Depreciação linear mensal (NBC TSP 07 / MCASP):
   *   quota = (base − valor residual) ÷ meses de vida útil.
   * Após reavaliação ou redução ao valor recuperável, a base passa a ser o novo valor
   * e a vida útil passa a ser a vida útil remanescente informada no laudo.
   */
  function deprec(b, hoje) {
    if (isTerceiro(b)) return null;
    const ref = b.baixa && b.baixa.data ? parse(b.baixa.data) : (hoje || new Date());
    const c = CLASSES[b.classe] || CLASSES.out;
    let base, ini, vida, res;
    if (b.reav && b.reav.data) {
      base = Number(b.reav.valor_novo); ini = parse(b.reav.data); vida = Number(b.reav.vida_restante); res = Number(b.reav.residual ?? 0);
    } else {
      base = Number(b.valor); ini = parse(b.data_aquisicao); vida = Number(b.vida_util) || c.vida; res = Number(b.residual ?? c.residual);
    }
    if (!base || !ini || !vida) return null;
    const meses = monthsBetween(ini, ref);
    const residualValor = base * res / 100;
    const depreciavel = base - residualValor;
    const mensal = depreciavel / (vida * 12);
    const acum = Math.min(depreciavel, mensal * meses);
    return {
      custo: Number(b.valor) || 0, base, residualValor, mensal, acum, liquido: base - acum, meses, vida,
      pct: depreciavel ? acum / depreciavel : 0, encerrada: acum >= depreciavel - 0.005, reavaliado: !!(b.reav && b.reav.data),
    };
  }

  /** Alertas de gestão de um bem (sev: bad = vencido, warn = atenção). */
  function alertas(b, hoje) {
    const out = []; if (!ativo(b)) return out;
    const now = hoje || new Date();
    const dias = d => d ? Math.round((d - now) / 86400000) : null;
    if ((CLASSES[b.classe] || {}).saude) {
      const chk = (per, ult, nome) => {
        if (!per) return;
        if (!ult) { out.push({ sev: "warn", tipo: nome, t: `${nome} sem registro` }); return; }
        const d = dias(addMonths(ult, per));
        if (d < 0) out.push({ sev: "bad", tipo: nome, t: `${nome} vencida há ${-d} dia(s)` });
        else if (d <= 30) out.push({ sev: "warn", tipo: nome, t: `${nome} vence em ${d} dia(s)` });
      };
      chk(b.per_preventiva, b.ult_preventiva, "Preventiva");
      chk(b.per_calibracao, b.ult_calibracao, "Calibração");
    }
    const g = dias(parse(b.garantia));
    if (g !== null && g >= 0 && g <= 60) out.push({ sev: "warn", tipo: "Garantia", t: `Garantia termina em ${g} dia(s)` });
    if (!b.responsavel) out.push({ sev: "warn", tipo: "Responsável", t: "Sem responsável (termo de responsabilidade)" });
    if (b.situacao === "Inservível") out.push({ sev: "warn", tipo: "Inservível", t: "Inservível aguardando desfazimento" });
    const d = deprec(b, now);
    if (d && d.encerrada && b.situacao === "Em uso") out.push({ sev: "warn", tipo: "Reavaliação", t: "Totalmente depreciado e em uso: avaliar reavaliação" });
    return out;
  }

  function numFmt(prefixo, numero) { return (prefixo || "PAT") + "-" + String(numero || 0).padStart(6, "0"); }

  return { CLASSES, SITUACOES, CONSERV, INSERV, INCORP, MOTIVOS_BAIXA, RISCO, TIPOS_INV, isTerceiro, ativo, parse, iso, addMonths, deprec, alertas, numFmt };
});
