# Emil Notas XML

Aplicacao web (MVP) para cadastro de usuarios/empresas e gestao de XML de NFe.

## Resumo rapido

O projeto cobre 3 frentes principais:

1. Autenticacao e cadastro (com verificacao de e-mail e etapa de pagamento no Mercado Pago).
2. Operacao fiscal (upload, leitura, filtro, download e exclusao de XML).
3. Gestao administrativa (empresas, relatorios e tela de documentos fiscais).

## Como rodar

1. Instalar dependencias:

```bash
npm install
```

2. Subir em dev (watch):

```bash
npm run dev
```

Ou em modo normal:

```bash
npm start
```

3. Acessar:

```text
http://localhost:3310
```

## Fluxo funcional (alto nivel)

1. Usuario faz login ou cadastro.
2. Cadastro valida e-mail e, para planos automaticos, exige pagamento aprovado.
3. Usuario entra no dashboard e envia XML de NFe.
4. Backend extrai metadados da NFe e grava:
	 - arquivo XML em storage/xml/
	 - metadados em storage/index.json
5. Telas de consulta usam API para listar, filtrar, baixar e excluir notas.

## Estrutura do projeto

### Backend (src/)

- src/server.js
	- Arquivo central da aplicacao (Express).
	- Registra middlewares, rotas de autenticacao, cadastro, pagamento, empresas e notas.
	- Faz validacoes de negocio (sessao, plano, pagamento aprovado, limite/uso etc).

- src/auth.js
	- Leitura e escrita do registro de usuarios/empresas (storage/companies.json).
	- Login por e-mail e senha.
	- Gestao de sessao em memoria via token.

- src/storage.js
	- Persistencia de notas fiscais.
	- Cria estrutura de storage, grava/consulta index.json e remove XML fisico.

- src/xml-parser.js
	- Parser de NFe com fast-xml-parser.
	- Extrai campos principais: chave, numero, serie, emissao, emitente/destinatario e valor total.

- src/email-service.js
	- Envio de codigo de verificacao por SMTP ou Resend.
	- Suporte a fallback de ambiente de teste.

### Frontend (public/)

Arquivos de pagina:

- public/login.html e public/acesso.html: entrada/autenticacao.
- public/cadastro.html: wizard de cadastro (usuario, plano, pagamento).
- public/dashboard.html: operacao principal de upload e consulta.
- public/empresas.html: cadastro/edicao de empresa principal.
- public/empresas-secundarias.html: gestao de empresas secundarias.
- public/relatorios.html: paineis e consultas com filtros avancados.
- public/documentos-fiscais.html: busca de documentos por periodo/CNPJ e exportacoes.
- public/alterar-senha.html: alteracao de senha.
- public/index.html: pagina inicial institucional.

Arquivos JavaScript principais:

- public/login.js: login por e-mail, bootstrap de sessao e redirecionamento.
- public/cadastro.js: wizard completo de cadastro, verificacao de e-mail, estado local e checkout.
- public/dashboard.js: upload/listagem/filtro/download/exclusao de XML.
- public/dashboard-home.js: validacao de sessao na home interna.
- public/empresas.js: CRUD de empresa principal, upload de certificado, consulta de CEP.
- public/empresas-secundarias.js: CRUD/consulta de secundarias e resumo de uso/plano.
- public/relatorios.js: filtros, KPIs e visualizacao analitica das notas.
- public/documentos-fiscais.js: consulta tabular por filtros e exportacao (Excel/ZIP/XML).
- public/alterar-senha.js: chamada da API de troca de senha.
- public/navbar.js: comportamento da navbar (dropdown, mobile, nome do usuario e logout).
- public/app.js: legado de fluxo login+notas em pagina unica.

Arquivos de estilo e PWA:

- public/styles.css: tema e layout global.
- public/sw.js: service worker (cache offline e estrategia de fetch).
- public/manifest.webmanifest: manifesto PWA.

### Dados locais (storage/)

- storage/companies.json
	- Registro de empresas e usuarios.
	- Base usada por login, cadastro e modulos administrativos.

- storage/index.json
	- Indice das notas fiscais (metadados para listagens e filtros).

- storage/xml/
	- Arquivos XML originais enviados pelos usuarios.

## Variaveis de ambiente importantes

### Aplicacao

- PORT: porta do servidor (padrao 3310).
- APP_BASE_URL: URL base publica usada em links e callbacks.

### E-mail

- EMAIL_PROVIDER: smtp ou resend.
- SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM.
- RESEND_API_KEY, RESEND_FROM_EMAIL.
- EMAIL_CODE_TTL_MS: validade do codigo de verificacao.
- EMAIL_ALLOW_ETHEREAL: fallback de inbox de teste via Ethereal.

### Mercado Pago (checkout de cadastro)

- MERCADO_PAGO_ACCESS_TOKEN
- MERCADO_PAGO_PUBLIC_KEY
- MERCADO_PAGO_WEBHOOK_URL
- MERCADO_PAGO_SUCCESS_URL
- MERCADO_PAGO_PENDING_URL
- MERCADO_PAGO_FAILURE_URL
- CADASTRO_ALLOW_TEST_REUSE (uso de teste para reaproveitar identidade no sandbox)

## Endpoints principais (resumido)

- Autenticacao
	- POST /api/auth/login
	- GET /api/auth/me
	- POST /api/auth/logout
	- POST /api/auth/alterar-senha

- Cadastro
	- POST /api/cadastro/email/send-code
	- POST /api/cadastro/email/verify-code
	- GET /api/cadastro/payment-outline
	- POST /api/cadastro/mercado-pago/checkout
	- POST /api/cadastro

- Notas fiscais
	- POST /api/notas
	- GET /api/notas
	- GET /api/notas/:id/download
	- DELETE /api/notas/:id

- Empresas
	- GET /api/empresas/me
	- POST /api/empresas/principal
	- POST /api/empresas/secundarias
	- PUT /api/empresas/secundarias/:id
	- DELETE /api/empresas/secundarias/:id

## Credenciais de desenvolvimento

- Demo:
	- Codigo empresa: emil-demo
	- Usuario: admin
	- Senha: 123456

- Teste:
	- Codigo empresa: xml-teste
	- Usuario: teste
	- Senha: teste123

## Observacoes

- MVP com persistencia em JSON local (sem banco relacional).
- Sessoes em memoria (reiniciar servidor invalida tokens).
- Para producao, recomenda-se banco de dados, hash de senha, hardening de CORS e politica de backup/auditoria.
