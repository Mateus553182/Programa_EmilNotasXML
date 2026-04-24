require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const {
  addNote,
  ensureStorage,
  findNoteById,
  listNotes,
  removeNote,
} = require('./storage');
const {
  ensureCompanies,
  readCompanyRegistry,
  writeCompanyRegistry,
  loginCompany,
  getSessionFromToken,
  logoutSession,
} = require('./auth');
const { parseNfeMetadata } = require('./xml-parser');
const { sendVerificationEmail } = require('./email-service');

const app = express();
const PORT = process.env.PORT || 3310;
const EMAIL_CODE_TTL_MS = Number(process.env.EMAIL_CODE_TTL_MS || 10 * 60 * 1000);
const emailVerificationStore = new Map();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function decodeXmlBuffer(buffer) {
  if (!buffer || !buffer.length) {
    return '';
  }

  // UTF-8 BOM
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.toString('utf-8');
  }

  // UTF-16 LE BOM
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString('utf16le');
  }

  // UTF-16 BE BOM
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer);
    for (let i = 0; i + 1 < swapped.length; i += 2) {
      const tmp = swapped[i];
      swapped[i] = swapped[i + 1];
      swapped[i + 1] = tmp;
    }
    return swapped.toString('utf16le');
  }

  return buffer.toString('utf-8');
}

function normalizeXmlText(rawText) {
  let text = String(rawText || '').replace(/^\uFEFF/, '').trim();

  // Some sample files include malformed pseudo-comment lines like:
  // <-- Powered By WebDANFE -->
  text = text.replace(/<--[\s\S]*?-->/g, '').trim();

  // Remove any garbage before the first tag.
  const firstTagIndex = text.indexOf('<');
  if (firstTagIndex > 0) {
    text = text.slice(firstTagIndex);
  }

  return text;
}

function isLikelyXml(text) {
  const trimmed = String(text || '').trim();
  return trimmed.startsWith('<') && trimmed.includes('>');
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim();
}

function authMiddleware(req, res, next) {
  const token = getBearerToken(req);
  const session = getSessionFromToken(token);

  if (!session) {
    return res.status(401).json({ message: 'Sessao invalida ou expirada.' });
  }

  req.auth = session;
  return next();
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/auth/login', async (req, res) => {
  const { companyCode, username, password } = req.body || {};

  if (!companyCode || !username || !password) {
    return res.status(400).json({ message: 'Informe codigo da empresa, usuario e senha.' });
  }

  const session = await loginCompany(companyCode, username, password);

  if (!session) {
    return res.status(401).json({ message: 'Credenciais invalidas.' });
  }

  return res.json({
    token: session.token,
    company: {
      id: session.companyId,
      code: session.companyCode,
      name: session.companyName,
    },
  });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  return res.json({
    company: {
      id: req.auth.companyId,
      code: req.auth.companyCode,
      name: req.auth.companyName,
    },
    user: {
      id: req.auth.userId,
      username: req.auth.username,
      email: req.auth.email,
      accessLevel: req.auth.accessLevel,
    },
  });
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  const token = getBearerToken(req);
  logoutSession(token);
  return res.status(204).send();
});

app.get('/api/notas', authMiddleware, async (req, res) => {
  const notes = await listNotes(req.auth.companyId, req.query);
  res.json(notes);
});

app.post('/api/notas', authMiddleware, upload.single('xml'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Arquivo XML nao enviado.' });
    }

    const fileName = req.file.originalname || '';
    const notaName = (req.body.notaName || '').trim();
    let xmlText = normalizeXmlText(decodeXmlBuffer(req.file.buffer));

    // Fallback: some text editors save XML in UTF-16 LE without explicit BOM.
    if (!isLikelyXml(xmlText)) {
      const fallback = normalizeXmlText(req.file.buffer.toString('utf16le'));
      if (isLikelyXml(fallback)) {
        xmlText = fallback;
      }
    }

    if (!isLikelyXml(xmlText)) {
      return res.status(400).json({
        message: 'Arquivo nao parece ser XML valido. Envie um arquivo contendo XML de NFe.',
      });
    }

    let metadata;
    let parseWarning = null;

    try {
      metadata = parseNfeMetadata(xmlText);
    } catch (error) {
      // In this project we prioritize storage over strict validation.
      // If metadata extraction fails, keep the XML and save basic record info.
      metadata = {
        chave: '',
        numero: '',
        serie: '',
        emissao: '',
        cnpjEmitente: '',
        razaoEmitente: '',
        cnpjDestinatario: '',
        razaoDestinatario: '',
        valorTotal: '',
      };
      parseWarning =
        error && error.message
          ? `XML salvo, mas sem leitura completa dos campos da NFe: ${error.message}`
          : 'XML salvo, mas sem leitura completa dos campos da NFe.';
    }

    const id = uuidv4();
    const xmlPath = path.join(__dirname, '..', 'storage', 'xml', `${id}.xml`);
    await fs.writeFile(xmlPath, req.file.buffer);

    const note = {
      id,
      companyId: req.auth.companyId,
      notaName,
      ...metadata,
      fileName,
      xmlPath,
      uploadedAt: new Date().toISOString(),
      parseWarning,
    };

    await addNote(note);

    return res.status(201).json(note);
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Erro ao processar XML.' });
  }
});

app.get('/api/notas/:id/download', authMiddleware, async (req, res) => {
  const note = await findNoteById(req.params.id, req.auth.companyId);

  if (!note) {
    return res.status(404).json({ message: 'Nota nao encontrada.' });
  }

  return res.download(note.xmlPath, note.fileName || `${note.id}.xml`);
});

app.delete('/api/notas/:id', authMiddleware, async (req, res) => {
  const removed = await removeNote(req.params.id, req.auth.companyId);

  if (!removed) {
    return res.status(404).json({ message: 'Nota nao encontrada.' });
  }

  return res.status(204).send();
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

/* ---- Cadastro de novo usuário + empresa ---- */
const PACKAGE_OPTIONS = {
  essencial: {
    id: 'essencial',
    label: 'Essencial',
    companyLimit: 1,
    userLimit: 2,
  },
  profissional: {
    id: 'profissional',
    label: 'Profissional',
    companyLimit: 3,
    userLimit: 8,
  },
  corporativo: {
    id: 'corporativo',
    label: 'Corporativo',
    companyLimit: 10,
    userLimit: 25,
  },
};

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function generateCompanyCode(companies) {
  const existingCodes = new Set(companies.map((company) => String(company.code || '')));
  let code = '';

  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (existingCodes.has(code));

  return code;
}

function parseCompaniesData(rawValue) {
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function createEmailVerificationCode() {
  return String(100000 + crypto.randomInt(900000));
}

function readEmailVerification(email) {
  const key = String(email || '').trim().toLowerCase();
  if (!key) return null;

  const entry = emailVerificationStore.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    emailVerificationStore.delete(key);
    return null;
  }

  return entry;
}

function saveEmailVerification(email, code) {
  const key = String(email || '').trim().toLowerCase();
  const now = Date.now();
  const entry = {
    email: key,
    code,
    createdAt: now,
    expiresAt: now + EMAIL_CODE_TTL_MS,
    verifiedAt: null,
  };

  emailVerificationStore.set(key, entry);
  return entry;
}

function mockAddressFromCertificate(fileName) {
  const key = String(fileName || '').toLowerCase();
  if (key.includes('sp')) {
    return { cep: '01310-100', street: 'Avenida Paulista', city: 'Sao Paulo', state: 'SP' };
  }
  if (key.includes('rj')) {
    return { cep: '20040-002', street: 'Rua Primeiro de Marco', city: 'Rio de Janeiro', state: 'RJ' };
  }

  return { cep: '30140-071', street: 'Avenida Afonso Pena', city: 'Belo Horizonte', state: 'MG' };
}

const uploadCadastro = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).single('certificado');

app.post('/api/cadastro/email/send-code', async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Informe um e-mail valido para verificacao.' });
  }

  try {
    const code = createEmailVerificationCode();
    const verification = saveEmailVerification(email, code);
    const result = await sendVerificationEmail({
      to: email,
      code,
      expiresInMinutes: Math.max(1, Math.round(EMAIL_CODE_TTL_MS / 60000)),
    });

    const response = {
      ok: true,
      message: `Codigo de verificacao enviado para ${email}.`,
      expiresAt: new Date(verification.expiresAt).toISOString(),
    };

    if (result.mode === 'ethereal' && result.previewUrl) {
      response.previewUrl = result.previewUrl;
      response.message += ' Ambiente de teste detectado: abra o link de preview para visualizar o e-mail.';
    }

    return res.json(response);
  } catch (error) {
    console.error('Falha ao enviar codigo de verificacao:', error);
    return res.status(500).json({
      error:
        error && error.message
          ? error.message
          : 'Nao foi possivel enviar o codigo de verificacao por e-mail.',
    });
  }
});

app.post('/api/cadastro/email/verify-code', async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const code = String((req.body && req.body.code) || '').trim();

  if (!email || !code) {
    return res.status(400).json({ error: 'Informe e-mail e codigo para validacao.' });
  }

  const verification = readEmailVerification(email);
  if (!verification) {
    return res.status(400).json({ error: 'Codigo expirado ou nao encontrado. Solicite um novo codigo.' });
  }

  if (verification.code !== code) {
    return res.status(400).json({ error: 'Codigo de verificacao invalido.' });
  }

  verification.verifiedAt = Date.now();
  emailVerificationStore.set(email, verification);

  return res.json({ ok: true, message: 'E-mail verificado com sucesso.' });
});

app.post('/api/cadastro/certificado/address-preview', (req, res) => {
  uploadCadastro(req, res, async (err) => {
    if (err) return res.status(400).json({ error: 'Erro no upload: ' + err.message });

    if (!req.file) {
      return res.status(400).json({ error: 'Envie um certificado para extrair os dados de endereco.' });
    }

    // Placeholder for real parsing from certificate metadata.
    const preview = mockAddressFromCertificate(req.file.originalname);
    return res.json(preview);
  });
});

app.post('/api/cadastro', (req, res) => {
  uploadCadastro(req, res, async (err) => {
    if (err) return res.status(400).json({ error: 'Erro no upload: ' + err.message });

    try {
      const {
        accessLevel,
        packageId,
        nomeUsuario,
        cpf,
        cargo,
        email,
        emailCode,
        senha,
        senhaCertificado,
        certificadoValidade,
        extractedCep,
        companiesData,
      } = req.body;

      const selectedPackage = PACKAGE_OPTIONS[packageId];
      const companyEntries = parseCompaniesData(companiesData);
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const normalizedCpf = normalizeDigits(cpf);
      const userAccessLevel = 'master';

      if (!nomeUsuario || !normalizedCpf || !cargo || !normalizedEmail || !senha) {
        return res.status(400).json({ error: 'Preencha todos os campos obrigatorios do usuario.' });
      }

      if (!selectedPackage) {
        return res.status(400).json({ error: 'Selecione um pacote valido.' });
      }

      const verification = readEmailVerification(normalizedEmail);
      if (!verification) {
        return res.status(400).json({ error: 'Codigo de verificacao expirado ou ausente. Solicite novamente.' });
      }

      if (verification.code !== String(emailCode || '').trim()) {
        return res.status(400).json({ error: 'Codigo de verificacao de e-mail invalido.' });
      }

      if (!verification.verifiedAt) {
        return res.status(400).json({ error: 'Valide o codigo de e-mail antes de concluir o cadastro.' });
      }

      if (!companyEntries.length) {
        return res.status(400).json({ error: 'Adicione pelo menos uma empresa ao cadastro.' });
      }

      if (companyEntries.length > selectedPackage.companyLimit) {
        return res.status(400).json({ error: 'A quantidade de empresas excede o limite do pacote selecionado.' });
      }

      const registry = await readCompanyRegistry();

      if (registry.users.some((user) => String(user.email || '').trim().toLowerCase() === normalizedEmail)) {
        return res.status(409).json({ error: 'E-mail ja cadastrado.' });
      }

      if (registry.users.some((user) => normalizeDigits(user.cpf) === normalizedCpf)) {
        return res.status(409).json({ error: 'CPF ja cadastrado.' });
      }

      const userId = uuidv4();
      const now = new Date().toISOString();
      const companyIds = [];
      const generatedCodes = [];
      const linkedCompanies = [];
      const newCompanies = [];
      let certStorageName = null;
      let managedBy = null;

      if (req.file) {
        const certDir = path.join(__dirname, '..', 'storage', 'certificados');
        await fs.mkdir(certDir, { recursive: true });
        certStorageName = `${userId}${path.extname(req.file.originalname || '.pfx') || '.pfx'}`;
        await fs.writeFile(path.join(certDir, certStorageName), req.file.buffer);
      }

      for (const entry of companyEntries) {
        const normalizedCnpj = normalizeDigits(entry.cnpj);
        if (!entry.nomeEmpresa || !normalizedCnpj) {
          return res.status(400).json({ error: 'Preencha nome e CNPJ para cada nova empresa.' });
        }

        const existingMasterForCnpj = registry.companies.find(
          (company) => normalizeDigits(company.cnpj) === normalizedCnpj && company.masterUserId
        );

        if (existingMasterForCnpj) {
          return res.status(409).json({ error: `Ja existe usuario master para o CNPJ ${entry.cnpj}.` });
        }

        const cnpjExists = registry.companies.some((company) => normalizeDigits(company.cnpj) === normalizedCnpj)
          || newCompanies.some((company) => normalizeDigits(company.cnpj) === normalizedCnpj);

        if (cnpjExists) {
          return res.status(409).json({ error: `O CNPJ ${entry.cnpj} ja esta cadastrado.` });
        }

        const companyId = uuidv4();
        const code = generateCompanyCode([...registry.companies, ...newCompanies]);
        const company = {
          id: companyId,
          code,
          name: String(entry.nomeEmpresa || '').trim(),
          cnpj: normalizedCnpj,
          address: {
            cep: String(entry.cep || extractedCep || '').trim(),
            street: String(entry.endereco || '').trim(),
            city: String(entry.cidade || '').trim(),
            state: String(entry.estado || '').trim().toUpperCase(),
          },
          userIds: [userId],
          masterUserId: userAccessLevel === 'master' ? userId : null,
          active: true,
          createdAt: now,
        };

        if (req.file) {
          company.certificate = {
            originalName: req.file.originalname,
            storedAs: certStorageName,
            expiresAt: certificadoValidade || '',
            hasPassword: Boolean(String(senhaCertificado || '').trim()),
            uploadedAt: now,
          };
        }

        newCompanies.push(company);
        companyIds.push(companyId);
        generatedCodes.push({ name: company.name, code });
      }

      const uniqueCompanyIds = [...new Set(companyIds)];
      const newUser = {
        id: userId,
        name: String(nomeUsuario || '').trim(),
        username: normalizedEmail,
        email: normalizedEmail,
        cpf: normalizedCpf,
        roleTitle: String(cargo || '').trim(),
        password: String(senha || ''),
        accessLevel: userAccessLevel,
        package: selectedPackage,
        companyIds: uniqueCompanyIds,
        managedBy,
        onboardingCertificate: req.file
          ? {
              originalName: req.file.originalname,
              storedAs: certStorageName,
              expiresAt: certificadoValidade || '',
              uploadedAt: now,
            }
          : null,
        active: true,
        createdAt: now,
      };

      registry.users.push(newUser);
      registry.companies.push(...newCompanies);
      await writeCompanyRegistry(registry);
      emailVerificationStore.delete(normalizedEmail);

      res.status(201).json({
        ok: true,
        message: 'Cadastro realizado com sucesso!',
        companyCodes: generatedCodes,
        linkedCompanies,
      });
    } catch (error) {
      console.error('Erro no cadastro:', error);
      res.status(500).json({ error: 'Erro interno ao processar cadastro.' });
    }
  });
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

app.get('/acesso', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'acesso.html'));
});

app.get('/cadastro', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'cadastro.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

Promise.all([ensureStorage(), ensureCompanies()])
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Falha ao iniciar armazenamento:', error);
    process.exit(1);
  });
