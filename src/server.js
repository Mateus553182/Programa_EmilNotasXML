require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const forge = require('node-forge');
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
  loginByEmail,
  loginCompany,
  getSessionFromToken,
  logoutSession,
} = require('./auth');
const { parseNfeMetadata } = require('./xml-parser');
const { sendVerificationEmail } = require('./email-service');

const app = express();
const PORT = process.env.PORT || 3310;
const EMAIL_CODE_TTL_MS = Number(process.env.EMAIL_CODE_TTL_MS || 30 * 60 * 1000);
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
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Informe e-mail e senha.' });
  }

  const session = await loginByEmail(email, password);

  if (!session) {
    return res.status(401).json({ message: 'E-mail ou senha incorretos.' });
  }

  return res.json({
    token: session.token,
    user: {
      id: session.userId,
      name: session.userName,
      email: session.email,
    },
  });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  return res.json({
    user: {
      id: req.auth.userId,
      name: req.auth.userName,
      username: req.auth.username,
      email: req.auth.email,
      accessLevel: req.auth.accessLevel,
      companyIds: req.auth.companyIds || [],
    },
  });
});

function getActiveUserCompanies(registry, user) {
  const userCompanyIds = Array.isArray(user && user.companyIds) ? user.companyIds : [];
  return registry.companies.filter(
    (company) => company.active !== false && userCompanyIds.includes(company.id)
  );
}

function normalizeCompanyKind(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'principal') return 'principal';
  if (normalized === 'secundaria' || normalized === 'secondary') return 'secundaria';
  return '';
}

function mapCompanyForResponse(company, kindFallback) {
  return {
    id: company.id,
    code: company.code,
    kind: normalizeCompanyKind(company.kind) || kindFallback,
    name: company.name,
    cnpj: company.cnpj || '',
    address: {
      cep: company.address && company.address.cep ? company.address.cep : '',
      street: company.address && company.address.street ? company.address.street : '',
      city: company.address && company.address.city ? company.address.city : '',
      state: company.address && company.address.state ? company.address.state : '',
    },
    createdAt: company.createdAt || null,
  };
}

function splitPrincipalAndSecondary(companies) {
  const principal = companies.find((company) => (company.kind || '') === 'principal') || companies[0] || null;
  const principalId = principal ? principal.id : null;
  const secundarias = companies.filter((company) => company.id !== principalId);
  return { principal, secundarias };
}

async function resolveAuthUser(req) {
  const registry = await readCompanyRegistry();
  const currentUser = registry.users.find((user) => user.id === req.auth.userId && user.active !== false);

  if (!currentUser) {
    return { registry, currentUser: null, companies: [] };
  }

  const userCompanyIds = Array.isArray(currentUser.companyIds) ? currentUser.companyIds : [];
  const companies = userCompanyIds
    .map((id) => registry.companies.find((company) => company.id === id && company.active !== false))
    .filter(Boolean)
    .map((company, index) => mapCompanyForResponse(company, index === 0 ? 'principal' : 'secundaria'));

  return { registry, currentUser, companies };
}

async function createCompanyForUser(req, preferredKind) {
  const registry = await readCompanyRegistry();
  const currentUser = registry.users.find((user) => user.id === req.auth.userId && user.active !== false);

  if (!currentUser) {
    return { status: 404, payload: { message: 'Usuario da sessao nao encontrado.' } };
  }

  if ((currentUser.accessLevel || 'common') !== 'master') {
    return { status: 403, payload: { message: 'Apenas usuario master pode cadastrar empresas.' } };
  }

  const packageConfig = getUserPackageConfig(currentUser);
  const existingCompanies = getActiveUserCompanies(registry, currentUser);

  if (Number.isFinite(packageConfig.companyLimit) && existingCompanies.length >= packageConfig.companyLimit) {
    return { status: 400, payload: { message: 'Limite de empresas do plano atingido.' } };
  }

  const requestedKind = normalizeCompanyKind(preferredKind || (req.body && req.body.kind));
  const effectiveKind = requestedKind || (existingCompanies.length === 0 ? 'principal' : 'secundaria');

  const hasPrincipal = existingCompanies.some((company) => normalizeCompanyKind(company.kind) === 'principal')
    || existingCompanies.length > 0;

  if (effectiveKind === 'principal' && hasPrincipal) {
    return { status: 400, payload: { message: 'A empresa principal ja foi cadastrada.' } };
  }

  if (effectiveKind === 'secundaria' && !hasPrincipal) {
    return { status: 400, payload: { message: 'Cadastre primeiro a empresa principal.' } };
  }

  const name = String(req.body && req.body.name ? req.body.name : '').trim();
  const normalizedCnpj = normalizeDigits(req.body && req.body.cnpj ? req.body.cnpj : '');
  const cep = String(req.body && req.body.cep ? req.body.cep : '').trim();
  const street = String(req.body && req.body.street ? req.body.street : '').trim();
  const city = String(req.body && req.body.city ? req.body.city : '').trim();
  const state = String(req.body && req.body.state ? req.body.state : '').trim().toUpperCase();

  if (!name || !normalizedCnpj) {
    return { status: 400, payload: { message: 'Informe nome da empresa e CNPJ.' } };
  }

  if (normalizedCnpj.length !== 14) {
    return { status: 400, payload: { message: 'CNPJ invalido. Informe 14 digitos.' } };
  }

  const cnpjExists = registry.companies.some((company) => normalizeDigits(company.cnpj) === normalizedCnpj);
  if (cnpjExists) {
    return { status: 409, payload: { message: 'Este CNPJ ja esta cadastrado.' } };
  }

  const companyId = uuidv4();
  const code = generateCompanyCode(registry.companies);
  const now = new Date().toISOString();

  const company = {
    id: companyId,
    code,
    kind: effectiveKind,
    name,
    cnpj: normalizedCnpj,
    address: {
      cep,
      street,
      city,
      state,
    },
    userIds: [currentUser.id],
    masterUserId: currentUser.id,
    active: true,
    createdAt: now,
  };

  if (!Array.isArray(currentUser.companyIds)) {
    currentUser.companyIds = [];
  }

  currentUser.companyIds.push(companyId);
  registry.companies.push(company);
  await writeCompanyRegistry(registry);

  return {
    status: 201,
    payload: {
      message: 'Empresa cadastrada com sucesso.',
      company: mapCompanyForResponse(company, effectiveKind),
    },
  };
}

async function getOwnedSecondaryCompany(req, companyId) {
  const { registry, currentUser } = await resolveAuthUser(req);

  if (!currentUser) {
    return { registry, currentUser: null, company: null };
  }

  const ownedIds = Array.isArray(currentUser.companyIds) ? currentUser.companyIds : [];
  const company = registry.companies.find(
    (item) => item.id === companyId
      && item.active !== false
      && ownedIds.includes(item.id)
      && normalizeCompanyKind(item.kind) === 'secundaria'
  ) || null;

  return { registry, currentUser, company };
}

function updateCompanyFromPayload(company, body) {
  const name = String(body && body.name ? body.name : '').trim();
  const normalizedCnpj = normalizeDigits(body && body.cnpj ? body.cnpj : '');
  const cep = String(body && body.cep ? body.cep : '').trim();
  const street = String(body && body.street ? body.street : '').trim();
  const city = String(body && body.city ? body.city : '').trim();
  const state = String(body && body.state ? body.state : '').trim().toUpperCase();

  if (!name || !normalizedCnpj) {
    return { error: 'Informe nome da empresa e CNPJ.' };
  }

  if (normalizedCnpj.length !== 14) {
    return { error: 'CNPJ invalido. Informe 14 digitos.' };
  }

  company.name = name;
  company.cnpj = normalizedCnpj;
  company.address = {
    cep,
    street,
    city,
    state,
  };

  return { company };
}

app.get('/api/empresas/me', authMiddleware, async (req, res) => {
  const { registry, currentUser, companies } = await resolveAuthUser(req);

  if (!currentUser) {
    return res.status(404).json({ message: 'Usuario da sessao nao encontrado.' });
  }

  const packageConfig = getUserPackageConfig(currentUser);
  const { principal, secundarias } = splitPrincipalAndSecondary(companies);

  const canAddCompany = !Number.isFinite(packageConfig.companyLimit) || companies.length < packageConfig.companyLimit;

  return res.json({
    plan: {
      id: packageConfig.id,
      label: packageConfig.label,
      companyLimit: packageConfig.companyLimit,
      userLimit: packageConfig.userLimit,
    },
    usage: {
      companies: companies.length,
    },
    canAddCompany,
    principal,
    secundarias,
    companies,
  });
});

app.post('/api/empresas/me', authMiddleware, async (req, res) => {
  const result = await createCompanyForUser(req, null);
  return res.status(result.status).json(result.payload);
});

app.get('/api/empresas/principal', authMiddleware, async (req, res) => {
  const { currentUser, companies } = await resolveAuthUser(req);
  if (!currentUser) {
    return res.status(404).json({ message: 'Usuario da sessao nao encontrado.' });
  }

  const { principal } = splitPrincipalAndSecondary(companies);
  return res.json({ principal });
});

app.post('/api/empresas/principal', authMiddleware, async (req, res) => {
  const result = await createCompanyForUser(req, 'principal');
  return res.status(result.status).json(result.payload);
});

app.get('/api/empresas/secundarias', authMiddleware, async (req, res) => {
  const { currentUser, companies } = await resolveAuthUser(req);
  if (!currentUser) {
    return res.status(404).json({ message: 'Usuario da sessao nao encontrado.' });
  }

  const { secundarias } = splitPrincipalAndSecondary(companies);
  return res.json({ secundarias });
});

app.post('/api/empresas/secundarias', authMiddleware, async (req, res) => {
  const result = await createCompanyForUser(req, 'secundaria');
  return res.status(result.status).json(result.payload);
});

app.get('/api/empresas/secundarias/:id', authMiddleware, async (req, res) => {
  const { currentUser, company } = await getOwnedSecondaryCompany(req, req.params.id);
  if (!currentUser) {
    return res.status(404).json({ message: 'Usuario da sessao nao encontrado.' });
  }

  if (!company) {
    return res.status(404).json({ message: 'Empresa secundaria nao encontrada.' });
  }

  return res.json({ company: mapCompanyForResponse(company, 'secundaria') });
});

app.put('/api/empresas/secundarias/:id', authMiddleware, async (req, res) => {
  const { registry, currentUser, company } = await getOwnedSecondaryCompany(req, req.params.id);
  if (!currentUser) {
    return res.status(404).json({ message: 'Usuario da sessao nao encontrado.' });
  }

  if (!company) {
    return res.status(404).json({ message: 'Empresa secundaria nao encontrada.' });
  }

  const duplicateCnpj = registry.companies.find(
    (item) => item.id !== company.id && item.active !== false && normalizeDigits(item.cnpj) === normalizeDigits(req.body && req.body.cnpj)
  );
  if (duplicateCnpj) {
    return res.status(409).json({ message: 'Este CNPJ ja esta cadastrado.' });
  }

  const result = updateCompanyFromPayload(company, req.body || {});
  if (result.error) {
    return res.status(400).json({ message: result.error });
  }

  await writeCompanyRegistry(registry);
  return res.json({ message: 'Empresa secundaria atualizada com sucesso.', company: mapCompanyForResponse(company, 'secundaria') });
});

app.delete('/api/empresas/secundarias/:id', authMiddleware, async (req, res) => {
  const { registry, currentUser, company } = await getOwnedSecondaryCompany(req, req.params.id);
  if (!currentUser) {
    return res.status(404).json({ message: 'Usuario da sessao nao encontrado.' });
  }

  if (!company) {
    return res.status(404).json({ message: 'Empresa secundaria nao encontrada.' });
  }

  company.active = false;
  currentUser.companyIds = (currentUser.companyIds || []).filter((id) => id !== company.id);
  await writeCompanyRegistry(registry);
  return res.status(204).send();
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
  const token = getBearerToken(req);
  logoutSession(token);
  return res.status(204).send();
});

app.get('/api/notas', authMiddleware, async (req, res) => {
  const { currentUser, companies } = await resolveAuthUser(req);
  if (!currentUser) {
    return res.status(404).json({ message: 'Usuario da sessao nao encontrado.' });
  }

  const allowedCompanyIds = companies.map((company) => company.id);
  if (!allowedCompanyIds.length) {
    return res.json([]);
  }

  const requestedCompanyId = String(req.query.companyId || '').trim();
  if (requestedCompanyId && !allowedCompanyIds.includes(requestedCompanyId)) {
    return res.status(403).json({ message: 'Empresa selecionada nao pertence ao usuario logado.' });
  }

  const targetCompanyId = requestedCompanyId || allowedCompanyIds[0];
  const filters = { ...req.query };
  delete filters.companyId;

  const notes = await listNotes(targetCompanyId, filters);
  res.json(notes);
});

app.post('/api/notas', authMiddleware, upload.single('xml'), async (req, res) => {
  try {
    const { currentUser, companies } = await resolveAuthUser(req);
    if (!currentUser) {
      return res.status(404).json({ message: 'Usuario da sessao nao encontrado.' });
    }

    const allowedCompanyIds = companies.map((company) => company.id);
    if (!allowedCompanyIds.length) {
      return res.status(400).json({ message: 'Cadastre uma empresa antes de importar XML.' });
    }

    const requestedCompanyId = String((req.body && req.body.companyId) || '').trim();
    if (requestedCompanyId && !allowedCompanyIds.includes(requestedCompanyId)) {
      return res.status(403).json({ message: 'Empresa selecionada nao pertence ao usuario logado.' });
    }

    const targetCompanyId = requestedCompanyId || allowedCompanyIds[0];

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
      companyId: targetCompanyId,
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
  const { currentUser, companies } = await resolveAuthUser(req);
  if (!currentUser) {
    return res.status(404).json({ message: 'Usuario da sessao nao encontrado.' });
  }

  const allowedCompanyIds = companies.map((company) => company.id);
  let note = null;

  for (const companyId of allowedCompanyIds) {
    // eslint-disable-next-line no-await-in-loop
    note = await findNoteById(req.params.id, companyId);
    if (note) break;
  }

  if (!note) {
    return res.status(404).json({ message: 'Nota nao encontrada.' });
  }

  return res.download(note.xmlPath, note.fileName || `${note.id}.xml`);
});

app.delete('/api/notas/:id', authMiddleware, async (req, res) => {
  const { currentUser, companies } = await resolveAuthUser(req);
  if (!currentUser) {
    return res.status(404).json({ message: 'Usuario da sessao nao encontrado.' });
  }

  const allowedCompanyIds = companies.map((company) => company.id);
  let removed = false;

  for (const companyId of allowedCompanyIds) {
    // eslint-disable-next-line no-await-in-loop
    removed = await removeNote(req.params.id, companyId);
    if (removed) break;
  }

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
    companyLimit: 5,
    userLimit: 8,
  },
  corporativo: {
    id: 'corporativo',
    label: 'Corporativo',
    companyLimit: null,
    userLimit: 25,
  },
};

function normalizePackageId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'essencial') return 'essencial';
  if (normalized === 'profissional') return 'profissional';
  if (normalized === 'corporativo') return 'corporativo';
  return '';
}

function getUserPackageConfig(user) {
  const packageId = normalizePackageId(
    (user && user.package && user.package.id)
      || (user && user.packageId)
      || (user && user.package && user.package.label)
  );

  // Legacy users may not have package metadata persisted.
  const fallbackPackageId = packageId || 'corporativo';
  return PACKAGE_OPTIONS[fallbackPackageId] || PACKAGE_OPTIONS.corporativo;
}

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

function formatCnpj(value) {
  const digits = normalizeDigits(value);
  if (digits.length !== 14) return '';
  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

function extractCnpjFromText(value) {
  const text = String(value || '');
  const direct = normalizeDigits(text);
  if (direct.length === 14) return direct;

  const match = text.match(/(\d{2}[\.\-\/]?\d{3}[\.\-\/]?\d{3}[\.\-\/]?\d{4}[\.\-\/]?\d{2})/);
  if (!match) return '';
  const digits = normalizeDigits(match[1]);
  return digits.length === 14 ? digits : '';
}

function attrValue(attrs, shortOrName) {
  const attr = attrs.find(
    (item) => item && (item.shortName === shortOrName || item.name === shortOrName)
  );
  return attr && attr.value ? String(attr.value) : '';
}

function extractCnpjFromCn(cn) {
  // Formato ICP-Brasil: "RAZAO SOCIAL:CNPJ" ou "RAZAO SOCIAL:CNPJ CNPJ"
  if (!cn) return { cnpj: '', companyName: '' };
  const colonIdx = cn.lastIndexOf(':');
  if (colonIdx !== -1) {
    const afterColon = cn.slice(colonIdx + 1).trim().split(' ')[0];
    const digits = normalizeDigits(afterColon);
    if (digits.length === 14) {
      return { cnpj: digits, companyName: cn.slice(0, colonIdx).trim() };
    }
  }
  return { cnpj: '', companyName: '' };
}

function extractCertificatePreview(fileBuffer, certificatePassword) {
  if (!certificatePassword) {
    throw new Error('Informe a senha do certificado para extrair os dados.');
  }

  let p12;
  try {
    const p12Der = forge.util.createBuffer(fileBuffer.toString('binary'));
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, certificatePassword);
  } catch (error) {
    throw new Error('Senha do certificado invalida ou arquivo .pfx/.p12 corrompido.');
  }

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  if (!certBags.length || !certBags[0].cert) {
    throw new Error('Nao foi possivel localizar um certificado valido no arquivo enviado.');
  }

  const cert = certBags[0].cert;
  const subjectAttrs = cert.subject && Array.isArray(cert.subject.attributes) ? cert.subject.attributes : [];
  const issuerAttrs = cert.issuer && Array.isArray(cert.issuer.attributes) ? cert.issuer.attributes : [];

  const commonName = attrValue(subjectAttrs, 'CN') || attrValue(subjectAttrs, 'commonName');
  const organization = attrValue(subjectAttrs, 'O') || attrValue(subjectAttrs, 'organizationName');
  const subjectSerial = attrValue(subjectAttrs, 'serialNumber');
  const issuerName = attrValue(issuerAttrs, 'CN') || attrValue(issuerAttrs, 'commonName');
  const subjectSummary = subjectAttrs
    .map((item) => `${item.shortName || item.name || item.type || 'attr'}=${String(item.value || '')}`)
    .join(' | ');

  console.log('[Certificado] CN:', commonName);
  console.log('[Certificado] O:', organization);
  console.log('[Certificado] serialNumber:', subjectSerial);
  console.log('[Certificado] subjectSummary:', subjectSummary);

  // 1. Tenta extrair do CN no formato "RAZAO SOCIAL:CNPJ" (e-CNPJ ICP-Brasil)
  const fromCn = extractCnpjFromCn(commonName);
  let cnpj = fromCn.cnpj;
  // Nome da empresa: se O for "ICP-Brasil" (generico), usa o nome extraido do CN
  const isGenericOrg = !organization || organization.trim().toLowerCase() === 'icp-brasil';
  let companyName = isGenericOrg ? (fromCn.companyName || '') : organization;

  // 2. Tenta extrair CNPJ do campo serialNumber se ainda nao achou
  if (!cnpj) cnpj = extractCnpjFromText(subjectSerial);

  // 3. Varre todos os atributos procurando 14 digitos
  if (!cnpj) {
    for (const attr of subjectAttrs) {
      const found = extractCnpjFromText(String(attr.value || ''));
      if (found) { cnpj = found; break; }
    }
  }

  // 4. Tenta subjectAltName (extensao padrao)
  if (!cnpj) {
    const altNameExtension = cert.getExtension('subjectAltName');
    if (altNameExtension && Array.isArray(altNameExtension.altNames)) {
      for (const altName of altNameExtension.altNames) {
        const value = altName && (altName.value || altName.ip || altName.url || altName.email || '');
        cnpj = extractCnpjFromText(value);
        if (cnpj) break;
      }
    }
  }

  // 5. Tenta encontrar em extensoes brutas ICP-Brasil (OID 2.16.76.1.3.3 = CNPJ)
  if (!cnpj) {
    try {
      const cnpjExt = cert.getExtension({ id: '2.16.76.1.3.3' });
      if (cnpjExt) {
        cnpj = extractCnpjFromText(String(cnpjExt.value || cnpjExt));
      }
    } catch (_) { /* extensao nao encontrada */ }
  }

  // Nome da empresa: prefer O, senao nome extraido do CN
  if (!companyName) companyName = commonName || '';

  console.log('[Certificado] CNPJ extraido:', cnpj || '(nao encontrado)');
  console.log('[Certificado] Nome extraido:', companyName || '(nao encontrado)');

  return {
    companyName,
    representativeName: commonName || '',
    cnpj,
    cnpjFormatted: formatCnpj(cnpj),
    issuer: issuerName,
    serialNumber: String(cert.serialNumber || subjectSerial || ''),
    validFrom: cert.validity && cert.validity.notBefore ? cert.validity.notBefore.toISOString() : null,
    validTo: cert.validity && cert.validity.notAfter ? cert.validity.notAfter.toISOString() : null,
    subjectSummary,
  };
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

  const code = createEmailVerificationCode();
  const verification = saveEmailVerification(email, code);

  try {
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

    if (process.env.NODE_ENV !== 'production') {
      return res.json({
        ok: true,
        message: 'Nao foi possivel entregar o e-mail neste ambiente. Use o codigo de desenvolvimento para continuar.',
        expiresAt: new Date(verification.expiresAt).toISOString(),
        devCode: code,
      });
    }

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
      return res.status(400).json({ error: 'Envie um certificado para extrair os dados.' });
    }

    try {
      const certificatePassword = String((req.body && req.body.senhaCertificado) || '').trim();
      const certificate = extractCertificatePreview(req.file.buffer, certificatePassword);

      return res.json({
        cep: '',
        street: '',
        city: '',
        state: '',
        certificate,
      });
    } catch (error) {
      return res.status(400).json({
        error: error && error.message ? error.message : 'Nao foi possivel ler os dados do certificado.',
      });
    }
  });
});

app.post('/api/cadastro', async (req, res) => {
    try {
      const {
        packageId,
        nomeUsuario,
        cpf,
        email,
        emailCode,
        senha,
      } = req.body;

      const selectedPackage = PACKAGE_OPTIONS[normalizePackageId(packageId)];
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const normalizedCpf = normalizeDigits(cpf);

      if (!nomeUsuario || !normalizedCpf || !normalizedEmail || !senha) {
        return res.status(400).json({ error: 'Preencha todos os campos obrigatorios do usuario.' });
      }

      if (!selectedPackage) {
        return res.status(400).json({ error: 'Selecione um plano valido.' });
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

      const registry = await readCompanyRegistry();

      if (registry.users.some((user) => String(user.email || '').trim().toLowerCase() === normalizedEmail)) {
        return res.status(409).json({ error: 'E-mail ja cadastrado.' });
      }

      if (registry.users.some((user) => normalizeDigits(user.cpf) === normalizedCpf)) {
        return res.status(409).json({ error: 'CPF ja cadastrado.' });
      }

      const userId = uuidv4();
      const now = new Date().toISOString();

      const newUser = {
        id: userId,
        name: String(nomeUsuario || '').trim(),
        username: normalizedEmail,
        email: normalizedEmail,
        cpf: normalizedCpf,
        roleTitle: '',
        password: String(senha || ''),
        accessLevel: 'master',
        package: selectedPackage,
        companyIds: [],
        active: true,
        createdAt: now,
      };

      registry.users.push(newUser);
      await writeCompanyRegistry(registry);
      emailVerificationStore.delete(normalizedEmail);

      return res.status(201).json({
        ok: true,
        message: 'Cadastro realizado com sucesso!',
      });
    } catch (error) {
      console.error('Erro no cadastro:', error);
      return res.status(500).json({ error: 'Erro interno ao processar cadastro.' });
    }
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

app.get('/empresas', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'empresas.html'));
});

app.get('/empresas-secundarias', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'empresas-secundarias.html'));
});

app.get('/relatorios', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'relatorios.html'));
});

app.get('/alterar-senha', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'alterar-senha.html'));
});

app.post('/api/auth/alterar-senha', authMiddleware, async (req, res) => {
  const { senhaAtual, novaSenha } = req.body || {};

  if (!senhaAtual || !novaSenha) {
    return res.status(400).json({ error: 'Informe a senha atual e a nova senha.' });
  }

  if (String(novaSenha).length < 6) {
    return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
  }

  try {
    const registry = await readCompanyRegistry();
    const user = registry.users.find((u) => u.id === req.auth.userId);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    if (String(user.password) !== String(senhaAtual)) {
      return res.status(401).json({ error: 'Senha atual incorreta.' });
    }

    user.password = String(novaSenha);
    await writeCompanyRegistry(registry);

    return res.json({ ok: true, message: 'Senha alterada com sucesso.' });
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    return res.status(500).json({ error: 'Erro interno ao alterar senha.' });
  }
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
