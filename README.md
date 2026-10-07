# Patrimônio Hospitalar

Sistema web (SaaS) para controle de patrimônio público de hospitais, preparado para atender várias entidades contratantes na mesma instalação. Cada entidade (prefeitura, secretaria, fundação ou Organização Social) tem dados isolados, usuários próprios, numeração patrimonial independente e trilha de auditoria.

Funciona no navegador do computador e pode ser instalado no celular como aplicativo (PWA), com leitura de etiquetas QR pela câmera.

---

## 1 Funcionalidades

| Área | O que faz |
|---|---|
| Cadastro de bens | Nº de patrimônio sequencial e único por entidade, até 6 fotos, descrição padronizada, classe e conta PCASP, incorporação (compra, doação, comodato etc.), unidade, setor, responsável, conservação e situação |
| Descrição por IA (opcional) | Sugere descrição, especificação, marca, modelo e classe a partir da foto |
| Equipamentos de saúde | Registro Anvisa, classe de risco, periodicidade e datas de preventiva e calibração |
| Transferência | Um ou vários bens por vez, com guia numerada (nº/ano) para assinatura de quem entrega e de quem recebe |
| Manutenção | Ordens preventivas, corretivas e de calibração, com custo e situação do bem |
| Baixa | Exige motivo e processo/ato administrativo; preserva ficha e histórico |
| Reavaliação | Reavaliação e redução ao valor recuperável, com laudo e vida útil remanescente; a depreciação passa a usar a nova base |
| Depreciação | Linear mensal, com valor residual (NBC TSP 07 / MCASP) |
| Inventário | Campanha por unidade com comissão e ato de designação, conferência pela câmera ou pelo número, divergências de setor e ata gerada automaticamente |
| Engenharia clínica | Agenda de 12 meses, % em dia, disponibilidade, tempo médio de reparo, custos e alerta de possíveis antieconômicos |
| Documentos (padrão ABNT) | Termo de responsabilidade, guia de transferência, ata de inventário, relatório de inservíveis, ficha patrimonial, demonstrativo por conta contábil, plano de manutenção e etiquetas QR |
| Exportação | Planilha CSV compatível com Excel |
| Segurança | Login individual, 5 perfis de acesso, senha provisória com troca obrigatória, bloqueio de tentativas, proteção CSRF, cabeçalhos de segurança e trilha de auditoria imutável |
| Plataforma | Painel da consultoria para cadastrar e suspender entidades e entrar em modo suporte (registrado na auditoria da entidade) |

### 1.1 Perfis de acesso

| Perfil | Permissões |
|---|---|
| Administrador da entidade | Tudo, incluindo usuários, configurações, exclusão de cadastro e auditoria |
| Setor de Patrimônio | Cadastrar, transferir, reavaliar, baixar e gerenciar inventários |
| Engenharia clínica | Manutenções e dados técnicos de equipamentos de saúde |
| Comissão de inventário | Conferir bens em inventários abertos |
| Somente consulta | Ver bens e documentos |

---

## 2 Base legal e normativa considerada

- **Lei nº 4.320/1964, arts. 94 a 96**: registro analítico dos bens, identificação do responsável e inventário.
- **NBC TSP 07 e MCASP (STN)**: depreciação, valor residual, reavaliação e redução ao valor recuperável.
- **PCASP**: contas 1.2.3.1.1.xx de bens móveis.
- **Decreto nº 10.540/2020**: rastreabilidade das operações (trilha de auditoria com usuário, data e operação).
- **Lei nº 14.133/2021, art. 76**: alienação de bens públicos.
- **Decreto nº 9.373/2018**: classificação de inservíveis; norma federal usada como referência quando o ente não tiver regulamento próprio.
- **RDC Anvisa nº 509/2021** e **ABNT NBR 15943**: gerenciamento de equipamentos de saúde.
- **Lei nº 13.709/2018 (LGPD)**: dados pessoais mínimos (nome, e-mail, cargo, matrícula) e registro de IP apenas para segurança e auditoria.
- **ABNT NBR 14724 e NBR 6024**, além das normas de apresentação tabular do IBGE: formatação dos documentos.

As vidas úteis e os valores residuais vêm como referência e devem ser ajustados à política contábil de cada ente.

---

## 3 Instalação

### 3.1 Requisitos
- Node.js 20 ou superior
- PostgreSQL 13 ou superior

### 3.2 Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim | Conexão PostgreSQL |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Na 1ª execução | Cria o usuário da plataforma (senha com 10+ caracteres, letras e números). Troca obrigatória no primeiro acesso |
| `NODE_ENV` | Recomendada | `production` ativa cookies seguros (HTTPS) |
| `PUBLIC_URL` | Recomendada | Endereço público (ex.: `https://patrimonio.suaempresa.com.br`), usado nos QR Codes das etiquetas |
| `APP_NAME` / `APP_OWNER` | Não | Nome do sistema e da empresa exibidos na interface |
| `ANTHROPIC_API_KEY` | Não | Liga a descrição por IA. `AI_MODEL` permite trocar o modelo |
| `SESSION_HOURS` | Não | Duração da sessão (padrão 12 h) |
| `DATABASE_SSL` | Não | `true` ou `false` para forçar o uso de SSL no banco |

### 3.3 Executar localmente
```bash
npm install
DATABASE_URL=postgres://usuario:senha@localhost:5432/patrimonio \
ADMIN_EMAIL=voce@empresa.com.br ADMIN_PASSWORD=SenhaInicial2026 \
npm start
```
O esquema do banco é criado automaticamente na inicialização.

### 3.4 Publicar no Render
1. Envie esta pasta para um repositório no GitHub.
2. No Render, escolha **New → Blueprint** e selecione o repositório. O arquivo `render.yaml` cria o serviço web e o banco.
3. Informe `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `PUBLIC_URL`.
4. Para uso em produção, use planos pagos de serviço e de banco, porque os planos gratuitos têm limitações de disponibilidade e de retenção de dados. Ative os backups do banco.

### 3.5 Testes
Com o servidor rodando sobre um banco vazio:
```bash
ADMIN_EMAIL=... ADMIN_PASSWORD=... node test/smoke.js http://localhost:3000
```
O teste cobre os fluxos principais, o isolamento entre entidades, as permissões, a proteção CSRF e a auditoria.

---

## 4 Primeiros passos

1. Entre com o usuário da plataforma e troque a senha.
2. Em **Plataforma → Nova entidade**, cadastre a entidade contratante, a primeira unidade e o administrador. Entregue a senha provisória por canal seguro.
3. O administrador da entidade cadastra os setores e os dados da entidade em **Configurações** e cria os usuários.
4. Cadastre os bens, imprima as etiquetas em **Relatórios** e cole-as nos bens.
5. Abra o inventário com a portaria da comissão e confira os bens pelo celular.

---

## 5 Observações e limitações

- **Fotos**: ficam no próprio banco de dados, reduzidas no aparelho antes do envio. Para acervos muito grandes, convém migrar para armazenamento de objetos (S3 ou equivalente).
- **Localização dos dados**: o Render não tem região no Brasil. A LGPD permite transferência internacional com as salvaguardas do art. 33. Se o contratante exigir dados no país, publique em provedor com região no Brasil (por exemplo, AWS, Azure, Google Cloud ou Magalu Cloud em São Paulo).
- **Integração contábil**: a conciliação é feita pelo demonstrativo por conta contábil e pela planilha. A integração automática com o SIAFIC do ente depende do sistema usado em cada ente.
- **E-mail**: o sistema não envia e-mails. Senhas provisórias são exibidas uma única vez para o administrador repassar.
- **Contratação**: a venda a órgãos públicos segue a Lei nº 14.133/2021 (ou o regulamento de compras, no caso de OS) e deve incluir cláusulas de tratamento de dados (LGPD), de suporte e de devolução dos dados ao fim do contrato.
