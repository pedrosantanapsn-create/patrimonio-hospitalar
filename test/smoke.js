/* Teste de fumaça de ponta a ponta da API. Uso: node test/smoke.js http://localhost:3000 */
"use strict";
const BASE = process.argv[2] || "http://localhost:3000";
const ADMIN = { email: process.env.ADMIN_EMAIL || "plataforma@teste.local", senha: process.env.ADMIN_PASSWORD || "SenhaForte2026" };
let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fails++; };

function client() {
  let cookie = "";
  return async function call(method, path, body, raw) {
    const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", "X-PH": "1", cookie }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
    const sc = res.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch (_) { data = text; }
    return raw ? { status: res.status, data, headers: res.headers } : { status: res.status, data };
  };
}
const jpg = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP" + "A".repeat(200);

(async () => {
  const sup = client();
  console.log("Plataforma");
  let r = await sup("POST", "/api/auth/login", ADMIN); ok(r.status === 200, "login da plataforma");
  if (r.data.must_change) { r = await sup("POST", "/api/auth/senha", { atual: ADMIN.senha, nova: ADMIN.senha + "x9" }); ok(r.status === 200, "troca de senha obrigatória"); ADMIN.senha += "x9"; }
  r = await sup("POST", "/api/plataforma/tenants", { nome: "Organização Saúde Teste", natureza: "os", ente: "Prefeitura de Exemplo", unidade: "Hospital Municipal Exemplo", admin_nome: "Gestora A", admin_email: `a${Date.now()}@t.local` });
  ok(r.status === 201, "cria entidade A"); const tA = r.data;
  r = await sup("POST", "/api/plataforma/tenants", { nome: "Fundação Teste B", admin_nome: "Gestor B", admin_email: `b${Date.now()}@t.local` });
  ok(r.status === 201, "cria entidade B"); const tB = r.data;

  const A = client();
  console.log("Entidade A");
  r = await A("POST", "/api/auth/login", { email: tA.tenant ? undefined : "", senha: "" }); ok(r.status === 400, "login vazio é recusado");
  const emailA = (await sup("GET", "/api/plataforma/tenants")).data.find(t => t.id === tA.tenant.id);
  // descobre e-mail do admin A pelo cadastro
  r = await A("POST", "/api/auth/login", { email: process.env.X || "", senha: "x" });
  const loginA = async (cl, email, senha) => { let x = await cl("POST", "/api/auth/login", { email, senha }); if (x.data.must_change) { await cl("POST", "/api/auth/senha", { atual: senha, nova: "NovaSenha2026ok" }); } return x; };
  // e-mails usados na criação
  const adminA = JSON.parse(JSON.stringify(tA));
  void emailA; void adminA;
  r = await sup("POST", "/api/plataforma/entrar", { tenant_id: tA.tenant.id }); ok(r.status === 200, "suporte entra na entidade A");
  r = await sup("GET", "/api/usuarios"); const admA = r.data[0]; ok(!!admA, "lista usuários A");
  await sup("POST", "/api/plataforma/entrar", { tenant_id: tB.tenant.id });
  const admB = (await sup("GET", "/api/usuarios")).data[0];

  r = await loginA(A, admA.email, tA.senha_provisoria); ok(r.status === 200, "admin A entra com senha provisória");
  r = await A("GET", "/api/bens"); ok(r.status === 200 && Array.isArray(r.data), "acessa bens após trocar a senha");
  r = await A("GET", "/api/cfg"); const uni = r.data.unidades[0]; ok(!!uni, "unidade inicial criada");
  r = await A("POST", "/api/cfg/setores", { unidade_id: uni.id, nome: "UTI Adulto\nPronto-Socorro\nCME" }); ok(r.status === 201 && r.data.length === 3, "cria 3 setores");
  const [uti, ps] = r.data;
  r = await A("PUT", "/api/cfg/entidade", { nome: "Organização Saúde Teste", cidade: "Americana", gestor_patrimonio: "Maria Souza", limite_antieconomico: 40 }); ok(r.status === 200, "configura entidade");

  r = await A("POST", "/api/bens", { descricao: "Monitor multiparamétrico", classe: "med", unidade_id: uni.id, setor_id: uti.id, data_aquisicao: "2022-03-15", valor: 18500, responsavel: "Enf. Ana", per_preventiva: 6, ult_preventiva: "2025-01-10", serie: "MX1" });
  ok(r.status === 201 && r.data.numero === 1, "cadastra bem nº 1"); const b1 = r.data;
  r = await A("POST", "/api/bens", { descricao: "Cama hospitalar", classe: "med", unidade_id: uni.id, setor_id: uti.id, data_aquisicao: "2019-01-10", valor: 9800, responsavel: "Enf. Ana", serie: "MX1" });
  ok(r.status === 409, "bloqueia nº de série duplicado");
  const nums = await Promise.all([1, 2, 3, 4, 5].map(i => A("POST", "/api/bens", { descricao: "Cadeira " + i, classe: "mov", unidade_id: uni.id, setor_id: ps.id, data_aquisicao: "2020-05-01", valor: 500 })));
  const ns = nums.map(x => x.data.numero).sort((x, y) => x - y);
  ok(nums.every(x => x.status === 201) && new Set(ns).size === 5, "5 cadastros simultâneos recebem números distintos: " + ns.join(","));
  r = await A("POST", "/api/bens", { descricao: "Sem valor", classe: "mov", unidade_id: uni.id, setor_id: ps.id, data_aquisicao: "2020-05-01", valor: 0 }); ok(r.status === 400, "exige valor de bem próprio");
  r = await A("POST", "/api/bens", { descricao: "Ventilador pulmonar", classe: "med", incorporacao: "Comodato (terceiro)", unidade_id: uni.id, setor_id: uti.id, data_aquisicao: "2025-02-01" }); ok(r.status === 201, "aceita bem de terceiro sem valor");

  r = await A("PUT", `/api/bens/${b1.id}`, { setor_id: ps.id }); ok(r.status === 400, "mudança de setor só por transferência");
  r = await A("PUT", `/api/bens/${b1.id}`, { conservacao: "Regular", local: "Leito 4" }); ok(r.status === 200 && r.data.conservacao === "Regular", "edita conservação");
  r = await A("POST", `/api/bens/${b1.id}/fotos`, { full: jpg, thumb: jpg }); ok(r.status === 201, "envia foto"); const foto = r.data.id;
  r = await A("GET", `/api/fotos/${foto}?t=thumb`, null, true); ok(r.status === 200, "baixa miniatura");

  r = await A("POST", "/api/transferencias", { bem_ids: [b1.id, nums[0].data.id], unidade_id: uni.id, setor_id: ps.id, responsavel: "Dr. Carlos", motivo: "Reorganização" });
  ok(r.status === 201 && r.data.numero === 1, "gera guia de transferência 1"); const guia = r.data;
  r = await A("GET", `/api/bens/${b1.id}`); ok(r.data.setor_id === ps.id && r.data.responsavel === "Dr. Carlos" && r.data.eventos.some(e => e.tipo === "Transferência"), "bem transferido e histórico registrado");

  r = await A("POST", `/api/bens/${b1.id}/manutencoes`, { tipo: "Corretiva", abertura: "2026-09-01", empresa: "TecMed", custo: 4000 }); ok(r.status === 201, "abre corretiva"); const m = r.data;
  r = await A("GET", `/api/bens/${b1.id}`); ok(r.data.situacao === "Em manutenção", "situação passa a Em manutenção");
  r = await A("PATCH", `/api/manutencoes/${m.id}`, { conclusao: "2026-09-10", custo: 4500 }); ok(r.status === 200, "conclui corretiva");
  r = await A("POST", `/api/bens/${b1.id}/manutencoes`, { tipo: "Preventiva", abertura: "2026-10-01", conclusao: "2026-10-01", custo: 3500 }); ok(r.status === 201, "registra preventiva");
  r = await A("GET", `/api/bens/${b1.id}`); ok(r.data.ult_preventiva === "2026-10-01" && r.data.situacao === "Em uso", "atualiza última preventiva");
  r = await A("GET", "/api/engenharia"); ok(r.status === 200 && r.data.antieconomicos.length === 1 && r.data.mttr === 9, `engenharia: antieconômico detectado e MTTR ${r.data.mttr} dias`);

  r = await A("POST", `/api/bens/${b1.id}/reavaliacao`, { tipo: "Redução ao valor recuperável", valor_novo: 999999, vida_restante: 4, laudo: "Laudo 1" }); ok(r.status === 400, "recusa redução com valor maior");
  r = await A("POST", `/api/bens/${b1.id}/reavaliacao`, { tipo: "Reavaliação", data: "2026-10-01", valor_novo: 12000, vida_restante: 5, residual: 10, laudo: "Laudo 12/2026", avaliadores: "Comissão" }); ok(r.status === 201, "registra reavaliação");

  r = await A("POST", "/api/inventarios", { unidade_id: uni.id, ano: 2026, portaria: "Portaria 10/2026", comissao: [{ nome: "João", funcao: "Presidente" }, { nome: "Lia" }] }); ok(r.status === 201, "abre inventário"); const inv = r.data;
  r = await A("POST", "/api/inventarios", { unidade_id: uni.id, comissao: [{ nome: "X" }] }); ok(r.status === 409, "impede 2 inventários abertos");
  r = await A("POST", `/api/inventarios/${inv.id}/conferir`, { numero: 1 }); ok(r.status === 200 && r.data.status === "localizado", "confere bem nº 1");
  r = await A("POST", `/api/inventarios/${inv.id}/conferir`, { numero: nums[1].data.numero, setor_id: uti.id }); ok(r.data.status === "divergente", "registra divergência de setor");
  r = await A("POST", `/api/inventarios/${inv.id}/encerrar`, { observacoes: "Sem mais." }); ok(r.status === 200, "encerra inventário");

  r = await A("POST", `/api/bens/${nums[4].data.id}/baixa`, { motivo: "Doação", data: "2026-10-05" }); ok(r.status === 400, "baixa exige processo");
  r = await A("POST", `/api/bens/${nums[4].data.id}/baixa`, { motivo: "Doação", processo: "Proc. 55/2026", data: "2026-10-05" }); ok(r.status === 200 && r.data.situacao === "Baixado", "baixa o bem");
  r = await A("PUT", `/api/bens/${nums[4].data.id}`, { descricao: "x" }); ok(r.status === 400, "bem baixado não é alterado");
  r = await A("DELETE", `/api/bens/${b1.id}`, { motivo: "teste" }); ok(r.status === 400, "não exclui bem com transferência");

  console.log("Documentos");
  for (const p of [`/docs/termo?setor_id=${ps.id}`, `/docs/guia/${guia.id}`, `/docs/ata/${inv.id}`, `/docs/inserviveis`, `/docs/ficha/${b1.id}`, `/docs/etiquetas`, `/docs/contas`, `/docs/plano-manutencao`, `/docs/bens.csv`]) {
    r = await A("GET", p); ok(r.status === 200 && String(r.data).length > 300, "gera " + p.split("?")[0]);
  }

  console.log("Isolamento e permissões");
  const B = client();
  await loginA(B, admB.email, tB.senha_provisoria);
  r = await B("GET", `/api/bens/${b1.id}`); ok(r.status === 404, "entidade B não vê bem da A");
  r = await B("GET", `/api/fotos/${foto}`); ok(r.status === 404, "entidade B não vê foto da A");
  r = await B("GET", `/docs/ficha/${b1.id}`); ok(r.status === 404, "entidade B não abre ficha da A");
  r = await B("GET", "/api/bens"); ok(r.data.length === 0, "lista da B está vazia");
  r = await A("POST", "/api/usuarios", { nome: "Consulta", email: `c${Date.now()}@t.local`, papel: "consulta" }); ok(r.status === 201, "cria usuário de consulta");
  const C = client(); await loginA(C, r.data.email, r.data.senha_provisoria);
  r = await C("POST", "/api/bens", { descricao: "x", unidade_id: uni.id, setor_id: ps.id, data_aquisicao: "2020-01-01", valor: 1 }); ok(r.status === 403, "consulta não cadastra");
  r = await C("GET", "/api/auditoria"); ok(r.status === 403, "consulta não vê auditoria");
  r = await A("GET", "/api/auditoria?limit=200"); ok(r.status === 200 && r.data.length > 20, `auditoria registrou ${r.data.length} operações`);
  const semCsrf = await fetch(BASE + "/api/auth/logout", { method: "POST" }); ok(semCsrf.status === 403, "escrita sem cabeçalho anti-CSRF é recusada");

  console.log(fails ? `\n${fails} falha(s)` : "\nTodos os testes passaram");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
