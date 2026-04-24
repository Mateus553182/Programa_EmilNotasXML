# Emil Notas XML

Aplicacao para armazenamento e controle de XML de notas fiscais (NFe), com foco em uso web e base pronta para empacotar em APK.

## O que este MVP faz

- Upload de arquivos XML de NFe
- Extracao automatica de dados principais (numero, serie, chave, CNPJ emitente, valor)
- Listagem e filtros
- Download do XML original
- Exclusao de nota
- Interface web responsiva
- Suporte PWA (instalavel no navegador)

## Stack

- Node.js + Express
- Multer para upload
- fast-xml-parser para leitura de XML
- Frontend HTML/CSS/JS

## Como executar

1. Instale dependencias:

```bash
npm install
```

2. Rode em desenvolvimento:

```bash
npm run dev
```

3. Abra no navegador:

```text
http://localhost:3310
```

## Verificacao de e-mail no cadastro

O cadastro usa envio real de e-mail para validar o usuario master.

### SMTP real (recomendado)

Defina estas variaveis de ambiente antes de iniciar a aplicacao:

- `SMTP_HOST`: host do provedor SMTP
- `SMTP_PORT`: porta SMTP (ex.: `587`)
- `SMTP_SECURE`: `true` para TLS direto (porta 465), senao `false`
- `SMTP_USER`: usuario da conta SMTP
- `SMTP_PASS`: senha da conta SMTP
- `SMTP_FROM` (opcional): remetente exibido no e-mail
- `EMAIL_CODE_TTL_MS` (opcional): expiracao do codigo em ms (padrao: `600000`)
- `EMAIL_ALLOW_ETHEREAL` (opcional, padrao `false`): habilita inbox de teste Ethereal

Exemplo PowerShell:

```powershell
$env:SMTP_HOST="smtp.seuprovedor.com"
$env:SMTP_PORT="587"
$env:SMTP_SECURE="false"
$env:SMTP_USER="no-reply@seudominio.com"
$env:SMTP_PASS="sua-senha-ou-app-password"
$env:SMTP_FROM="Emil NotasXML <no-reply@seudominio.com>"
npm start
```

### Modo teste (opcional)

Por padrao, sem SMTP configurado o envio e bloqueado com erro claro de configuracao.

Para usar inbox de teste Ethereal, habilite:

```powershell
$env:EMAIL_ALLOW_ETHEREAL="true"
```

Nesse modo, o endpoint de envio retorna `previewUrl` para visualizar o e-mail de teste.

### Rotas de tela

- Home institucional: `/login`
- Tela de acesso: `/acesso`
- Painel de XML: `/dashboard`

## Login inicial (demo)

- Codigo da empresa: `emil-demo`
- Usuario: `admin`
- Senha: `123456`

## Login de teste

- Codigo da empresa: `xml-teste`
- Usuario: `teste`
- Senha: `teste123`

## Estrutura

- `src/server.js`: API e servidor web
- `src/xml-parser.js`: leitura dos campos de NFe
- `src/storage.js`: persistencia do indice e arquivos
- `public/`: frontend
- `storage/xml/`: XMLs enviados
- `storage/index.json`: metadados

## Transformar em APK (caminho recomendado)

Opcao 1 (rapida): usar PWABuilder
1. Publicar a aplicacao em um dominio (ex: https://seu-dominio)
2. Acessar https://www.pwabuilder.com
3. Informar a URL e gerar pacote Android

Opcao 2 (mais controle): usar Capacitor
1. Separar frontend em build estatico
2. Integrar com Capacitor Android
3. Gerar APK pelo Android Studio

## Proximos passos sugeridos

- Login por usuario e permissoes
- Banco de dados relacional (PostgreSQL)
- Backup automatico dos XML
- Dashboard de indicadores (quantidade, valor total, por emitente)
- Importacao em lote (ZIP com varios XML)
- Integracao com seus sistemas internos

## Observacao importante

Este MVP salva arquivos localmente. Para ambiente de producao, use armazenamento seguro, backup, trilha de auditoria e controle de acesso.
