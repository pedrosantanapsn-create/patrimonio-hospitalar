-- Patrimônio Hospitalar — esquema PostgreSQL (multi-entidade)
-- Idempotente: pode ser executado a cada inicialização.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Entidades contratantes (prefeitura, secretaria, OS, fundação etc.)
CREATE TABLE IF NOT EXISTS tenants (
  id            SERIAL PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  nome          TEXT NOT NULL,
  cnpj          TEXT,
  natureza      TEXT NOT NULL DEFAULT 'direta',   -- direta | indireta | os | outra
  ente          TEXT,                              -- ente público ao qual o patrimônio pertence
  contrato      TEXT,                              -- contrato de gestão / instrumento, quando OS
  prefixo       TEXT NOT NULL DEFAULT 'PAT',
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS unidades (
  id         SERIAL PRIMARY KEY,
  tenant_id  INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  cnes       TEXT,
  endereco   TEXT,
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, nome)
);

CREATE TABLE IF NOT EXISTS setores (
  id          SERIAL PRIMARY KEY,
  tenant_id   INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unidade_id  INT NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (unidade_id, nome)
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  tenant_id     INT REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = equipe da plataforma
  nome          TEXT NOT NULL,
  email         TEXT NOT NULL,
  cargo         TEXT,
  matricula     TEXT,
  papel         TEXT NOT NULL DEFAULT 'consulta',  -- admin | patrimonio | engenharia | inventariante | consulta
  superadmin    BOOLEAN NOT NULL DEFAULT FALSE,
  senha_hash    TEXT NOT NULL,
  must_change   BOOLEAN NOT NULL DEFAULT TRUE,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_login  TIMESTAMPTZ,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   INT REFERENCES tenants(id) ON DELETE CASCADE,  -- entidade em uso (suporte da plataforma pode alternar)
  ip          TEXT,
  user_agent  TEXT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em   TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

-- Contadores atômicos por entidade (nº de patrimônio, nº de guia)
CREATE TABLE IF NOT EXISTS counters (
  tenant_id  INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  valor      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, nome)
);

CREATE TABLE IF NOT EXISTS bens (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  numero             INT NOT NULL,
  unidade_id         INT REFERENCES unidades(id),
  setor_id           INT REFERENCES setores(id),
  local              TEXT,
  responsavel        TEXT,
  responsavel_mat    TEXT,
  descricao          TEXT NOT NULL,
  especificacao      TEXT,
  marca              TEXT,
  modelo             TEXT,
  serie              TEXT,
  classe             TEXT NOT NULL DEFAULT 'out',
  vida_util          NUMERIC(6,2),
  residual           NUMERIC(5,2),
  incorporacao       TEXT NOT NULL DEFAULT 'Compra',
  documento          TEXT,
  fornecedor         TEXT,
  data_aquisicao     DATE,
  valor              NUMERIC(14,2) NOT NULL DEFAULT 0,
  garantia           DATE,
  conservacao        TEXT NOT NULL DEFAULT 'Bom',
  situacao           TEXT NOT NULL DEFAULT 'Em uso',
  class_inservivel   TEXT,
  anvisa             TEXT,
  risco              TEXT,
  per_preventiva     INT,
  ult_preventiva     DATE,
  per_calibracao     INT,
  ult_calibracao     DATE,
  ult_conferencia    DATE,
  reav               JSONB,     -- última reavaliação / redução ao valor recuperável vigente
  baixa              JSONB,
  obs                TEXT,
  criado_por         INT REFERENCES users(id),
  atualizado_por     INT REFERENCES users(id),
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, numero)
);
CREATE INDEX IF NOT EXISTS bens_tenant_idx ON bens(tenant_id, situacao);
CREATE INDEX IF NOT EXISTS bens_setor_idx ON bens(setor_id);

CREATE TABLE IF NOT EXISTS fotos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bem_id     UUID NOT NULL REFERENCES bens(id) ON DELETE CASCADE,
  mime       TEXT NOT NULL DEFAULT 'image/jpeg',
  dados      BYTEA NOT NULL,
  thumb      BYTEA NOT NULL,
  ordem      INT NOT NULL DEFAULT 0,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fotos_bem_idx ON fotos(bem_id);

-- Histórico (linha do tempo) de cada bem
CREATE TABLE IF NOT EXISTS eventos (
  id         BIGSERIAL PRIMARY KEY,
  tenant_id  INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bem_id     UUID NOT NULL REFERENCES bens(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL,
  texto      TEXT NOT NULL,
  dados      JSONB,
  user_id    INT REFERENCES users(id),
  em         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eventos_bem_idx ON eventos(bem_id, em);

CREATE TABLE IF NOT EXISTS guias (
  id         SERIAL PRIMARY KEY,
  tenant_id  INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  numero     INT NOT NULL,
  ano        INT NOT NULL,
  data       DATE NOT NULL,
  origem     JSONB NOT NULL,   -- [{bem_id, setor, unidade, responsavel}]
  destino    JSONB NOT NULL,   -- {unidade_id, setor_id, setor, unidade, responsavel, local}
  motivo     TEXT,
  user_id    INT REFERENCES users(id),
  em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ano, numero)
);

CREATE TABLE IF NOT EXISTS manutencoes (
  id          SERIAL PRIMARY KEY,
  tenant_id   INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bem_id      UUID NOT NULL REFERENCES bens(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,          -- Preventiva | Corretiva | Calibração
  abertura    DATE NOT NULL,
  conclusao   DATE,
  empresa     TEXT,
  os          TEXT,
  descricao   TEXT,
  custo       NUMERIC(14,2) NOT NULL DEFAULT 0,
  user_id     INT REFERENCES users(id),
  em          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS manut_bem_idx ON manutencoes(bem_id);

CREATE TABLE IF NOT EXISTS reavaliacoes (
  id              SERIAL PRIMARY KEY,
  tenant_id       INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bem_id          UUID NOT NULL REFERENCES bens(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL,     -- Reavaliação | Redução ao valor recuperável
  data            DATE NOT NULL,
  valor_anterior  NUMERIC(14,2) NOT NULL,
  valor_novo      NUMERIC(14,2) NOT NULL,
  vida_restante   NUMERIC(6,2) NOT NULL,
  residual        NUMERIC(5,2) NOT NULL DEFAULT 0,
  laudo           TEXT NOT NULL,
  avaliadores     TEXT,
  user_id         INT REFERENCES users(id),
  em              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventarios (
  id            SERIAL PRIMARY KEY,
  tenant_id     INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unidade_id    INT NOT NULL REFERENCES unidades(id),
  ano           INT NOT NULL,
  tipo          TEXT NOT NULL DEFAULT 'Anual',   -- Anual | Inicial | Transferência de gestão | Extraordinário
  portaria      TEXT,
  comissao      JSONB NOT NULL DEFAULT '[]'::jsonb,
  status        TEXT NOT NULL DEFAULT 'aberto',  -- aberto | encerrado
  observacoes   TEXT,
  aberto_por    INT REFERENCES users(id),
  aberto_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  encerrado_em  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS inventario_itens (
  inventario_id  INT NOT NULL REFERENCES inventarios(id) ON DELETE CASCADE,
  bem_id         UUID NOT NULL REFERENCES bens(id) ON DELETE CASCADE,
  status         TEXT NOT NULL,      -- localizado | divergente
  setor_id       INT REFERENCES setores(id),
  conservacao    TEXT,
  observacao     TEXT,
  user_id        INT REFERENCES users(id),
  em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (inventario_id, bem_id)
);

-- Trilha de auditoria: somente inserção (Decreto 10.540/2020 — rastreabilidade)
CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    INT,
  user_id      INT,
  user_nome    TEXT,
  acao         TEXT NOT NULL,
  entidade     TEXT NOT NULL,
  entidade_id  TEXT,
  antes        JSONB,
  depois       JSONB,
  ip           TEXT,
  em           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_tenant_idx ON audit_log(tenant_id, em DESC);

CREATE OR REPLACE FUNCTION audit_log_imutavel() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'A trilha de auditoria não pode ser alterada nem excluída';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_change ON audit_log;
CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_imutavel();
