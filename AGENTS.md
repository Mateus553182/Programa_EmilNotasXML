# Emil NotasXML — Instruções para Agentes de IA

## Resumo Executivo
**Emil NotasXML** é um aplicativo PWA (Progressive Web App) para armazenamento, consulta e gerenciamento de notas fiscais eletrônicas (NFe) em XML. O projeto é um MVP com stack Node.js + Express no backend e vanilla JavaScript/HTML/CSS no frontend, sem frameworks complexos.

**Repositório de referência:** [README.md](README.md) | **Escopo completo:** [Escopo do Projeto](/memories/repo/escopo-projeto.md)

---

## Stack Tecnológico

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| **Backend** | Node.js + Express | ^4.19.2 |
| **Parser XML** | fast-xml-parser | ^4.4.1 |
| **Upload** | multer | ^1.4.5-lts.1 |
| **Certificado Digital** | node-forge | ^1.4.0 |
| **Email** | nodemailer + resend | ^8.0.5, ^6.12.2 |
| **Compressão** | archiver | ^8.0.0 |
| **Frontend** | Vanilla JS/HTML/CSS | — |
| **PWA** | Service Worker (sw.js) | — |
| **IDs** | uuid | ^11.0.3 |

**Sem dependências externas:** React, Vue, Angular, TypeScript, ou frameworks de frontend.

---

## Começar Rápido

### Desenvolvimento
```bash
npm install
npm run dev    # watch mode na porta 3310
```

### Produção
```bash
npm start      # porta conforme ENV PORT ou 3310
```

**URL local:** `http://localhost:3310`

### Credenciais de Teste
```
Demo:
  Código Empresa: emil-demo
  Usuário: admin
  Senha: 123456

Teste:
  Código Empresa: xml-teste
  Usuário: teste
  Senha: teste123
```

---

## Arquitetura & Diretórios

```
.
├── src/
│   ├── server.js          # Express app, rotas, webhooks
│   ├── auth.js            # Gerenciamento de usuários, sessões, login
│   ├── storage.js         # Persistência JSON (notas fiscais)
│   ├── xml-parser.js      # Extração de metadados do NFe
│   └── email-service.js   # SMTP, verificação email
├── public/
│   ├── app.js             # Lógica frontend (login, upload, filtros)
│   ├── *.html             # Telas (login, cadastro, dashboard, etc)
│   ├── styles.css         # Estilos únicos
│   └── sw.js              # Service Worker (PWA)
└── storage/
    ├── companies.json     # Registro de usuários, empresas, sessões
    ├── index.json         # Índice de notas por empresa
    └── xml/               # Arquivos XML reais (UUIDs como nomes)
```

### Fluxo de Dados
1. **Frontend** (`public/app.js`) → POST `/api/notas` (multipart form)
2. **Backend** (`server.js`) → multer recebe XML → extrai metadados → `storage.js` persiste
3. **Storage** → `storage/xml/{uuid}.xml` + índice em `index.json`
4. **Persistência de Usuários** → `storage/companies.json` (usuários, empresas, masters)

---

## Variáveis de Ambiente Importantes

### SMTP / Email
```
SMTP_HOST           # ex: smtp.gmail.com
SMTP_PORT           # ex: 587
SMTP_SECURE         # true (465) ou false (587)
SMTP_USER           # endereço SMTP
SMTP_PASS           # senha
SMTP_FROM           # remetente customizado (opcional)
EMAIL_CODE_TTL_MS   # expiração do código verificação (default: 600000 ms)
EMAIL_ALLOW_ETHEREAL # true para usar inbox de teste Ethereal
```

### Mercado Pago (Futuro)
```
MERCADO_PAGO_API_BASE
MERCADO_PAGO_ACCESS_TOKEN
MERCADO_PAGO_WEBHOOK_URL
MERCADO_PAGO_SUCCESS_URL
MERCADO_PAGO_FAILURE_URL
MERCADO_PAGO_PENDING_URL
MERCADO_PAGO_PREAPPROVAL_REDIRECT_URL
MERCADO_PAGO_BRICKS_REDIRECT_URL
```

### Aplicação
```
PORT            # default: 3310
APP_BASE_URL    # default: http://localhost:{PORT}
```

---

## Padrões & Convenções

### Backend (Node.js/Express)

**Estrutura de Resposta:**
```javascript
// Sucesso
res.json({
  success: true,
  data: { /* dados */ },
  message: 'descricao'
});

// Erro
res.status(400).json({
  success: false,
  error: 'codigo-erro',
  message: 'descrição legível'
});
```

**Autenticação:**
- Token em `Authorization: Bearer <token>` header
- Sessions armazenadas em memória (`auth.js:sessions Map`)
- Login por email + senha (em futuro: validação CPF + 2FA)

**Multer (Upload):**
- Memória (não disco): `multer.memoryStorage()`
- Limite: 10 MB

**XML Parsing:**
- `fast-xml-parser` com opções customizadas
- BOM UTF-8/UTF-16 detectado automaticamente
- Metadados extraídos: número, série, chave, CNPJ, valor

### Frontend (Vanilla JS)

**Padrão UI:**
- Seções ocultas com classes `hidden` (CSS: `display: none`)
- Forms com validação cliente-side
- Fetch API para requisições (token no header `Authorization`)
- LocalStorage para token (`TOKEN_KEY = 'emil_notas_token'`)

**Arquivo Principal:** `public/app.js`
- Seletores de DOM declarados no topo
- Funções nomeadas: `setAuthenticated()`, `setLoggedOut()`, `handleUpload()`, etc.

**PWA Service Worker:**
- `public/sw.js` — cache offline e sincronização
- Manifest: `public/manifest.webmanifest`

---

## API Endpoints Principais

### Autenticação
- `POST /api/login` — Login por código empresa + senha
- `POST /api/logout` — Logout (limpa sessão)
- `POST /api/verify-email` — Verifica código de email
- `POST /api/send-verification-email` — Envia verificação

### Notas Fiscais
- `POST /api/notas` — Upload de XML (requer token)
- `GET /api/notas` — Lista todas (query: `filtros`)
- `GET /api/notas/:id` — Detalhes de uma nota
- `DELETE /api/notas/:id` — Remove nota

### Arquivos
- `GET /api/notas/:id/download` — Download do XML original

### Webhooks (Futuro)
- `POST /api/webhooks/mercado-pago` — Notificações de pagamento

---

## Modelo de Dados

### Empresa
```javascript
{
  id: "uuid",
  code: "string",        // código único (ex: "emil-demo")
  name: "string",
  cnpj: "string",
  userIds: ["user-ids"], // N:N relacionamento
  masterUserId: "user-id", // usuário admin da empresa
  active: true
}
```

### Usuário
```javascript
{
  id: "uuid",
  name: "string",
  username: "string",
  email: "string",
  password: "string",    // TODO: hash com bcrypt
  accessLevel: "master" | "common",
  companyIds: ["empresa-ids"], // N:N
  active: true
}
```

### Nota Fiscal
```javascript
{
  id: "uuid",            // ID único local
  companyId: "uuid",     // FK para empresa
  filename: "string",    // nome original upload
  chave: "string",       // chave NF-e 44 dígitos
  numero: "number",
  serie: "number",
  cnpjEmitente: "string",
  valor: "number",
  dataEmissao: "string", // ISO date
  uploadedAt: "string",  // ISO timestamp
  xmlPath: "string"      // storage/xml/{uuid}.xml
}
```

---

## Pontos-Chave para Agentes

### ⚠️ Antes de Modificar
1. **Sessões em memória:** Perdem dados ao restart. Futuro: usar Redis ou DB.
2. **Sem hash de senha:** Senhas armazenadas em texto plano (`companies.json`). **CRÍTICO PARA PROD:** use `bcrypt`.
3. **CORS aberto:** Aceita requisições de qualquer origem. Revisar para prod.
4. **Sem sanitização input:** Validar inputs (CPF, CNPJ) antes de persistir.

### 🔄 Refatorações Planejadas (backlog)
- [ ] N:N usuário-empresa (em progresso)
- [ ] Sistema de planos/pacotes
- [ ] Integração API Gov (NF-e, CT-e)
- [ ] Certificado digital (upload, extração)
- [ ] Alerta vencimento certificado (email)
- [ ] Geração de notas (Entrada, Retorno, Devolução)
- [ ] Dashboard customizado

### 🧪 Teste Padrão
```bash
# 1. Upload XML
curl -X POST http://localhost:3310/api/notas \
  -H "Authorization: Bearer {token}" \
  -F "file=@seu-arquivo.xml"

# 2. Listar
curl http://localhost:3310/api/notas?token={token}

# 3. Download
curl http://localhost:3310/api/notas/{id}/download -o arquivo.xml
```

---

## Boas Práticas para Este Projeto

1. **Nomes descritivos:** Variáveis e funções em camelCase PT-BR (ex: `verificarEmail()`, `armazenarXML()`)
2. **Comentários em PT-BR:** Especialmente em lógica complexa
3. **Sem tipos:** Projeto em JS vanilla. Se TypeScript for adicionado, usar JSDoc comments por enquanto
4. **Modular:** Cada arquivo tem responsabilidade clara (auth, storage, parsing, email)
5. **Dados sensíveis:** SMTP, API keys no `.env` (git-ignored)
6. **Testes:** Ainda não há suíte de testes. Considerar estrutura ao adicionar.

---

## Referências Internas
- [Escopo Completo](/memories/repo/escopo-projeto.md)
- [Ideias Futuras](/memories/repo/ideias-futuras-paginas.md)
- [Facts Técnicos](/memories/repo/emil-notasxml-facts.md)

---

**Última atualização:** 2026-07-01 | **Versão:** 1.0 | **Status:** MVP em desenvolvimento
