const TOKEN_KEY = 'emil_notas_token';

const principalCompanyLabel = document.getElementById('principalCompanyLabel');
const planUsageHintSecondary = document.getElementById('planUsageHintSecondary');
const secondaryCompanyForm = document.getElementById('secondaryCompanyForm');
const secondaryFormMessage = document.getElementById('secondaryFormMessage');
const createSecondaryBtn = document.getElementById('createSecondaryBtn');
const refreshSecondaryCompanies = document.getElementById('refreshSecondaryCompanies');
const secondaryCompaniesBody = document.getElementById('secondaryCompaniesBody');

const secondaryNameInput = document.getElementById('secondaryNameInput');
const secondaryCnpjInput = document.getElementById('secondaryCnpjInput');
const secondaryCepInput = document.getElementById('secondaryCepInput');
const secondaryStreetInput = document.getElementById('secondaryStreetInput');
const secondaryCityInput = document.getElementById('secondaryCityInput');
const secondaryStateInput = document.getElementById('secondaryStateInput');

let authToken = localStorage.getItem(TOKEN_KEY) || '';
let planMeta = { companyLimit: null };

function forceLogin() {
  authToken = '';
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = '/login';
}

function getAuthHeaders(extraHeaders = {}) {
  if (!authToken) return extraHeaders;
  return {
    ...extraHeaders,
    Authorization: `Bearer ${authToken}`,
  };
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: getAuthHeaders(options.headers || {}),
  });

  if (!response.ok) {
    if (response.status === 401) {
      forceLogin();
      throw new Error('Sessao expirada. Faca login novamente.');
    }

    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.error || 'Falha na requisicao');
  }

  if (response.status === 204) return null;
  return response.json();
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatCnpj(value) {
  let digits = normalizeDigits(value).slice(0, 14);
  if (digits.length > 12) digits = digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, '$1.$2.$3/$4-$5');
  else if (digits.length > 8) digits = digits.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, '$1.$2.$3/$4');
  else if (digits.length > 5) digits = digits.replace(/(\d{2})(\d{3})(\d{1,3})/, '$1.$2.$3');
  else if (digits.length > 2) digits = digits.replace(/(\d{2})(\d{1,3})/, '$1.$2');
  return digits;
}

function formatCep(value) {
  let digits = normalizeDigits(value).slice(0, 8);
  if (digits.length > 5) digits = digits.replace(/(\d{5})(\d{1,3})/, '$1-$2');
  return digits;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('pt-BR');
}

function renderSecondaryCompanies(companies) {
  if (!companies.length) {
    secondaryCompaniesBody.innerHTML = '<tr><td colspan="5">Nenhuma empresa secundaria cadastrada.</td></tr>';
    return;
  }

  secondaryCompaniesBody.innerHTML = '';
  companies.forEach((company) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${company.name || '-'}</td>
      <td>${formatCnpj(company.cnpj || '') || '-'}</td>
      <td>${company.code || '-'}</td>
      <td>${[(company.address && company.address.city) || '', (company.address && company.address.state) || ''].filter(Boolean).join('/') || '-'}</td>
      <td>${formatDate(company.createdAt)}</td>
    `;
    secondaryCompaniesBody.appendChild(tr);
  });
}

function updateSummary(data) {
  const principal = data.principal || data.principalCompany || null;
  const secundarias = Array.isArray(data.secundarias)
    ? data.secundarias
    : Array.isArray(data.secondaryCompanies)
      ? data.secondaryCompanies
      : [];

  if (!principal) {
    principalCompanyLabel.textContent = 'Nao cadastrada';
    planUsageHintSecondary.textContent = 'Cadastre primeiro a empresa principal para liberar as secundarias.';
    createSecondaryBtn.disabled = true;
    renderSecondaryCompanies([]);
    return;
  }

  principalCompanyLabel.textContent = `${principal.name} (${formatCnpj(principal.cnpj || '') || '-'})`;

  planMeta = data.plan || { companyLimit: null };
  const current = data.usage && Number.isFinite(data.usage.companies) ? data.usage.companies : (1 + secundarias.length);
  if (Number.isFinite(planMeta.companyLimit)) {
    planUsageHintSecondary.textContent = `${current} de ${planMeta.companyLimit} empresas usadas no plano ${planMeta.label || ''}.`;
  } else {
    planUsageHintSecondary.textContent = `${current} empresas usadas no plano ${planMeta.label || 'Corporativo'} (sem limite).`;
  }

  createSecondaryBtn.disabled = !Boolean(data.canAddCompany);
  renderSecondaryCompanies(secundarias);
}

async function fetchAddressFromCep(digits) {
  secondaryCepInput.classList.add('cep-loading');

  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    const data = await response.json();

    if (data.erro) {
      secondaryCepInput.classList.remove('cep-loading', 'cep-ok');
      secondaryCepInput.classList.add('cep-error');
      return;
    }

    secondaryStreetInput.value = [data.logradouro, data.bairro].filter(Boolean).join(', ');
    secondaryCityInput.value = data.localidade || '';
    secondaryStateInput.value = data.uf || '';

    secondaryCepInput.classList.remove('cep-loading', 'cep-error');
    secondaryCepInput.classList.add('cep-ok');
  } catch {
    secondaryCepInput.classList.remove('cep-loading', 'cep-ok');
    secondaryCepInput.classList.add('cep-error');
  }
}

async function loadSecondaryCompanies() {
  secondaryCompaniesBody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';
  const data = await request('/api/empresas/me');
  updateSummary(data);
}

secondaryCnpjInput.addEventListener('input', () => {
  secondaryCnpjInput.value = formatCnpj(secondaryCnpjInput.value);
});

secondaryCepInput.addEventListener('input', () => {
  secondaryCepInput.value = formatCep(secondaryCepInput.value);
  const digits = normalizeDigits(secondaryCepInput.value);
  if (digits.length === 8) fetchAddressFromCep(digits);
});

secondaryCompanyForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  secondaryFormMessage.style.color = 'var(--muted)';
  secondaryFormMessage.textContent = 'Salvando empresa secundaria...';

  try {
    const payload = {
      kind: 'secundaria',
      name: secondaryNameInput.value.trim(),
      cnpj: secondaryCnpjInput.value.trim(),
      cep: secondaryCepInput.value.trim(),
      street: secondaryStreetInput.value.trim(),
      city: secondaryCityInput.value.trim(),
      state: secondaryStateInput.value.trim().toUpperCase(),
    };

    const data = await request('/api/empresas/secundarias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    secondaryCompanyForm.reset();
    secondaryCepInput.classList.remove('cep-loading', 'cep-ok', 'cep-error');
    secondaryFormMessage.style.color = '#2e9e6a';
    secondaryFormMessage.textContent = `${data.message} Codigo de acesso: ${data.company.code}`;

    await loadSecondaryCompanies();
  } catch (error) {
    secondaryFormMessage.style.color = 'var(--danger)';
    secondaryFormMessage.textContent = error.message;
  }
});

refreshSecondaryCompanies.addEventListener('click', async () => {
  secondaryFormMessage.textContent = '';
  await loadSecondaryCompanies();
});

async function bootstrap() {
  if (!authToken) {
    forceLogin();
    return;
  }

  try {
    await request('/api/auth/me');
    await loadSecondaryCompanies();
  } catch {
    forceLogin();
  }
}

bootstrap();
