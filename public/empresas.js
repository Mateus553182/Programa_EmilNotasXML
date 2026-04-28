const TOKEN_KEY = 'emil_notas_token';

const companyName = document.getElementById('companyName');
const logoutBtn = document.getElementById('logoutBtn');
const planLabel = document.getElementById('planLabel');
const planUsageHint = document.getElementById('planUsageHint');
const companyForm = document.getElementById('companyForm');
const companyFormMessage = document.getElementById('companyFormMessage');
const createCompanyBtn = document.getElementById('createCompanyBtn');
const refreshCompanies = document.getElementById('refreshCompanies');
const companiesBody = document.getElementById('companiesBody');

const companyNameInput = document.getElementById('companyNameInput');
const companyCnpjInput = document.getElementById('companyCnpjInput');
const companyCepInput = document.getElementById('companyCepInput');
const companyStreetInput = document.getElementById('companyStreetInput');
const companyCityInput = document.getElementById('companyCityInput');
const companyStateInput = document.getElementById('companyStateInput');

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

function updatePlanSummary(data) {
  planMeta = data.plan || { companyLimit: null };

  const limitText = Number.isFinite(planMeta.companyLimit)
    ? `${planMeta.companyLimit} empresa(s)`
    : 'Empresas ilimitadas';

  planLabel.textContent = `${planMeta.label || '-'} - ${limitText}`;

  const current = data.usage && Number.isFinite(data.usage.companies) ? data.usage.companies : 0;
  planUsageHint.textContent = Number.isFinite(planMeta.companyLimit)
    ? `${current} de ${planMeta.companyLimit} empresa(s) cadastrada(s).`
    : `${current} empresa(s) cadastrada(s) sem limite no plano.`;

  const canCreate = Boolean(data.canAddCompany);
  createCompanyBtn.disabled = !canCreate;
  if (!canCreate) {
    companyFormMessage.style.color = 'var(--danger)';
    companyFormMessage.textContent = 'Limite de empresas do plano atingido.';
  } else if (companyFormMessage.textContent === 'Limite de empresas do plano atingido.') {
    companyFormMessage.textContent = '';
  }
}

function renderCompanies(companies) {
  if (!companies.length) {
    companiesBody.innerHTML = '<tr><td colspan="5">Nenhuma empresa cadastrada.</td></tr>';
    return;
  }

  companiesBody.innerHTML = '';
  companies.forEach((company) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${company.name || '-'}</td>
      <td>${formatCnpj(company.cnpj || '') || '-'}</td>
      <td>${company.code || '-'}</td>
      <td>${[(company.address && company.address.city) || '', (company.address && company.address.state) || ''].filter(Boolean).join('/') || '-'}</td>
      <td>${formatDate(company.createdAt)}</td>
    `;
    companiesBody.appendChild(tr);
  });
}

async function loadCompanies() {
  companiesBody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';
  const data = await request('/api/empresas/me');
  updatePlanSummary(data);
  renderCompanies(Array.isArray(data.companies) ? data.companies : []);
}

async function fetchAddressFromCep(digits) {
  companyCepInput.classList.add('cep-loading');

  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    const data = await response.json();

    if (data.erro) {
      companyCepInput.classList.remove('cep-loading', 'cep-ok');
      companyCepInput.classList.add('cep-error');
      return;
    }

    companyStreetInput.value = [data.logradouro, data.bairro].filter(Boolean).join(', ');
    companyCityInput.value = data.localidade || '';
    companyStateInput.value = data.uf || '';

    companyCepInput.classList.remove('cep-loading', 'cep-error');
    companyCepInput.classList.add('cep-ok');
  } catch {
    companyCepInput.classList.remove('cep-loading', 'cep-ok');
    companyCepInput.classList.add('cep-error');
  }
}

companyCnpjInput.addEventListener('input', () => {
  companyCnpjInput.value = formatCnpj(companyCnpjInput.value);
});

companyCepInput.addEventListener('input', () => {
  companyCepInput.value = formatCep(companyCepInput.value);
  const digits = normalizeDigits(companyCepInput.value);
  if (digits.length === 8) {
    fetchAddressFromCep(digits);
  }
});

companyForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (Number.isFinite(planMeta.companyLimit) && createCompanyBtn.disabled) {
    companyFormMessage.style.color = 'var(--danger)';
    companyFormMessage.textContent = 'Limite de empresas do plano atingido.';
    return;
  }

  companyFormMessage.style.color = 'var(--muted)';
  companyFormMessage.textContent = 'Salvando empresa...';

  try {
    const payload = {
      name: companyNameInput.value.trim(),
      cnpj: companyCnpjInput.value.trim(),
      cep: companyCepInput.value.trim(),
      street: companyStreetInput.value.trim(),
      city: companyCityInput.value.trim(),
      state: companyStateInput.value.trim().toUpperCase(),
    };

    const data = await request('/api/empresas/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    companyForm.reset();
    companyCepInput.classList.remove('cep-loading', 'cep-ok', 'cep-error');
    companyFormMessage.style.color = '#2e9e6a';
    companyFormMessage.textContent = `${data.message} Codigo de acesso: ${data.company.code}`;

    await loadCompanies();
  } catch (error) {
    companyFormMessage.style.color = 'var(--danger)';
    companyFormMessage.textContent = error.message;
  }
});

refreshCompanies.addEventListener('click', async () => {
  companyFormMessage.textContent = '';
  await loadCompanies();
});

logoutBtn.addEventListener('click', async () => {
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignore errors and clear local session.
  }
  forceLogin();
});

// ── Certificado digital ──────────────────────────────────────────────────────

const certUploadArea = document.getElementById('certUploadArea');
const certFileInput = document.getElementById('certFileInput');
const certFileName = document.getElementById('certFileName');
const certPasswordInput = document.getElementById('certPasswordInput');
const certExtractedInfo = document.getElementById('certExtractedInfo');
const certValidadeInput = document.getElementById('certValidadeInput');
const certMessage = document.getElementById('certMessage');

function lockCertField(input) {
  if (!input) return;
  input.readOnly = true;
  input.classList.add('cert-locked');
  input.title = 'Preenchido automaticamente pelo certificado digital';
}

async function extractCertificateData() {
  const certFile = certFileInput.files[0];
  if (!certFile) return;

  certMessage.style.color = 'var(--muted)';
  certMessage.textContent = 'Extraindo dados do certificado...';

  const formData = new FormData();
  formData.append('certificado', certFile);
  formData.append('senhaCertificado', certPasswordInput.value.trim());

  try {
    const response = await fetch('/api/cadastro/certificado/address-preview', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Nao foi possivel extrair dados do certificado.');

    const cert = data.certificate || {};
    const summary = [
      cert.cnpjFormatted ? `CNPJ: ${cert.cnpjFormatted}` : null,
      cert.companyName ? `Empresa: ${cert.companyName}` : null,
    ].filter(Boolean).join(' | ');

    certExtractedInfo.value = summary || 'Nao identificado';

    if (cert.validTo) {
      certValidadeInput.value = String(cert.validTo).slice(0, 10);
    }

    if (cert.companyName && !companyNameInput.value.trim()) {
      companyNameInput.value = cert.companyName;
      lockCertField(companyNameInput);
    }
    if (cert.cnpjFormatted && !companyCnpjInput.value.trim()) {
      companyCnpjInput.value = cert.cnpjFormatted;
      lockCertField(companyCnpjInput);
    }

    certMessage.style.color = '#2e9e6a';
    certMessage.textContent = 'Dados extraídos com sucesso. Confira o formulário abaixo.';
  } catch (error) {
    certExtractedInfo.value = 'Nao identificado';
    certMessage.style.color = 'var(--danger)';
    certMessage.textContent = error.message;
  }
}

certUploadArea.addEventListener('click', () => certFileInput.click());
certUploadArea.addEventListener('dragover', (event) => {
  event.preventDefault();
  certUploadArea.classList.add('drag-over');
});
certUploadArea.addEventListener('dragleave', () => {
  certUploadArea.classList.remove('drag-over');
});
certUploadArea.addEventListener('drop', (event) => {
  event.preventDefault();
  certUploadArea.classList.remove('drag-over');
  if (event.dataTransfer.files.length) {
    certFileInput.files = event.dataTransfer.files;
    certFileName.textContent = `Arquivo selecionado: ${event.dataTransfer.files[0].name}`;
    extractCertificateData();
  }
});
certFileInput.addEventListener('change', () => {
  if (certFileInput.files[0]) {
    certFileName.textContent = `Arquivo selecionado: ${certFileInput.files[0].name}`;
    extractCertificateData();
  }
});
certPasswordInput.addEventListener('blur', () => {
  if (certFileInput.files.length) extractCertificateData();
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────


  if (!authToken) {
    forceLogin();
    return;
  }

  try {
    const auth = await request('/api/auth/me');
    companyName.textContent = auth.company.name;
    await loadCompanies();
  } catch {
    forceLogin();
  }
}

bootstrap();
