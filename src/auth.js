const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const COMPANIES_PATH = path.join(__dirname, '..', 'storage', 'companies.json');
const sessions = new Map();

const defaultCompanies = {
  companies: [
    {
      id: 'empresa-demo-1',
      code: 'emil-demo',
      name: 'Empresa Demo Emil',
      cnpj: '',
      userIds: ['user-demo-1'],
      masterUserId: 'user-demo-1',
      active: true,
    },
    {
      id: 'empresa-teste-1',
      code: 'xml-teste',
      name: 'Empresa Teste XML',
      cnpj: '',
      userIds: ['user-teste-1'],
      masterUserId: 'user-teste-1',
      active: true,
    },
  ],
  users: [
    {
      id: 'user-demo-1',
      name: 'Administrador Demo',
      username: 'admin',
      email: 'admin@emil.demo',
      password: '123456',
      accessLevel: 'master',
      companyIds: ['empresa-demo-1'],
      active: true,
    },
    {
      id: 'user-teste-1',
      name: 'Usuario Teste',
      username: 'teste',
      email: 'teste@xml.demo',
      password: 'teste123',
      accessLevel: 'master',
      companyIds: ['empresa-teste-1'],
      active: true,
    },
  ],
};

function createUserId(companyId, index) {
  return `${companyId}-user-${index + 1}`;
}

function normalizeRegistry(parsed) {
  const companies = Array.isArray(parsed && parsed.companies) ? parsed.companies : [];
  const explicitUsers = Array.isArray(parsed && parsed.users) ? parsed.users : null;

  if (explicitUsers) {
    return {
      companies: companies.map((company) => ({
        ...company,
        userIds: Array.isArray(company.userIds) ? company.userIds : [],
      })),
      users: explicitUsers.map((user) => ({
        active: user.active !== false,
        companyIds: Array.isArray(user.companyIds) ? user.companyIds : [],
        ...user,
      })),
    };
  }

  const migratedUsers = [];
  const migratedCompanies = companies.map((company) => {
    const legacyUsers = Array.isArray(company.users) ? company.users : [];
    const userIds = legacyUsers.map((user, index) => {
      const id = createUserId(company.id || `company-${index + 1}`, index);
      migratedUsers.push({
        id,
        name: user.name || user.username || `Usuario ${index + 1}`,
        username: user.username || '',
        email: user.email || '',
        password: user.password || '',
        accessLevel: index === 0 ? 'master' : 'common',
        companyIds: [company.id],
        active: user.active !== false,
      });
      return id;
    });

    const { users, ...rest } = company;
    return {
      ...rest,
      cnpj: company.cnpj || '',
      userIds,
      masterUserId: company.masterUserId || userIds[0] || null,
      active: company.active !== false,
    };
  });

  return {
    companies: migratedCompanies,
    users: migratedUsers,
  };
}

async function ensureCompanies() {
  try {
    await fs.access(COMPANIES_PATH);
  } catch {
    await fs.writeFile(COMPANIES_PATH, JSON.stringify(defaultCompanies, null, 2), 'utf-8');
  }
}

async function readCompanyRegistry() {
  await ensureCompanies();
  const content = await fs.readFile(COMPANIES_PATH, 'utf-8');
  const parsed = JSON.parse(content);
  const normalized = normalizeRegistry(parsed);

  if (!Array.isArray(parsed.users)) {
    await fs.writeFile(COMPANIES_PATH, JSON.stringify(normalized, null, 2), 'utf-8');
  }

  return normalized;
}

async function writeCompanyRegistry(registry) {
  await fs.writeFile(COMPANIES_PATH, JSON.stringify(registry, null, 2), 'utf-8');
}

function createToken() {
  return `${crypto.randomUUID()}-${crypto.randomBytes(16).toString('hex')}`;
}

async function loginCompany(companyCode, username, password) {
  const { companies, users } = await readCompanyRegistry();
  const normalizedCode = String(companyCode || '').trim().toLowerCase();
  const normalizedUsername = String(username || '').trim().toLowerCase();

  const company = companies.find(
    (item) => item.active && String(item.code || '').trim().toLowerCase() === normalizedCode
  );

  if (!company) {
    return null;
  }

  const companyUserIds = Array.isArray(company.userIds) ? company.userIds : [];
  const companyUsers = companyUserIds.length
    ? users.filter((item) => companyUserIds.includes(item.id))
    : Array.isArray(company.users)
      ? company.users
      : [];

  const user = companyUsers.find(
    (item) =>
      item.active !== false &&
      [item.username, item.email, item.login]
        .filter(Boolean)
        .map((value) => String(value).trim().toLowerCase())
        .includes(normalizedUsername)
  );

  if (!user || String(user.password) !== String(password || '')) {
    return null;
  }

  const token = createToken();
  const session = {
    token,
    companyId: company.id,
    companyCode: company.code,
    companyName: company.name,
    userId: user.id || null,
    username: user.username || user.email || user.name,
    email: user.email || '',
    accessLevel: user.accessLevel || 'common',
    createdAt: new Date().toISOString(),
  };

  sessions.set(token, session);
  return session;
}

function getSessionFromToken(token) {
  if (!token) return null;
  return sessions.get(token) || null;
}

function logoutSession(token) {
  if (!token) return;
  sessions.delete(token);
}

module.exports = {
  ensureCompanies,
  readCompanyRegistry,
  writeCompanyRegistry,
  loginCompany,
  getSessionFromToken,
  logoutSession,
};
