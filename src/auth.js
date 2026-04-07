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
      users: [
        {
          username: 'admin',
          password: '123456',
          active: true,
        },
      ],
      active: true,
    },
    {
      id: 'empresa-teste-1',
      code: 'xml-teste',
      name: 'Empresa Teste XML',
      users: [
        {
          username: 'teste',
          password: 'teste123',
          active: true,
        },
      ],
      active: true,
    },
  ],
};

async function ensureCompanies() {
  try {
    await fs.access(COMPANIES_PATH);
  } catch {
    await fs.writeFile(COMPANIES_PATH, JSON.stringify(defaultCompanies, null, 2), 'utf-8');
  }
}

async function readCompanies() {
  await ensureCompanies();
  const content = await fs.readFile(COMPANIES_PATH, 'utf-8');
  const parsed = JSON.parse(content);
  return parsed.companies || [];
}

function createToken() {
  return `${crypto.randomUUID()}-${crypto.randomBytes(16).toString('hex')}`;
}

async function loginCompany(companyCode, username, password) {
  const companies = await readCompanies();
  const normalizedCode = String(companyCode || '').trim().toLowerCase();
  const normalizedUsername = String(username || '').trim().toLowerCase();

  const company = companies.find(
    (item) => item.active && String(item.code || '').trim().toLowerCase() === normalizedCode
  );

  if (!company) {
    return null;
  }

  const users = Array.isArray(company.users)
    ? company.users
    : [
        {
          username: 'admin',
          password: company.password || '',
          active: true,
        },
      ];

  const user = users.find(
    (item) =>
      item.active !== false &&
      String(item.username || '').trim().toLowerCase() === normalizedUsername
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
    username: user.username,
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
  loginCompany,
  getSessionFromToken,
  logoutSession,
};
