const TOKEN_KEY = 'emil_notas_token';

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

const certUploadArea = document.getElementById('certUploadArea');
const certFileInput = document.getElementById('certFileInput');
const certFileName = document.getElementById('certFileName');
const certPasswordInput = document.getElementById('certPasswordInput');
const certExtractBtn = document.getElementById('certExtractBtn');
const certExtractedInfo = document.getElementById('certExtractedInfo');
const certValidadeInput = document.getElementById('certValidadeInput');
const certMessage = document.getElementById('certMessage');

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

function renderPrincipalCompany(company) {
  if (!company) {
    companiesBody.innerHTML = '<tr><td colspan="5">Nenhuma empresa principal cadastrada.</td></tr>';
    return;
  }

  companiesBody.innerHTML = '';
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${company.name || '-'}</td>
    <td>${formatCnpj(company.cnpj || '') || '-'}</td>
    <td>${company.code || '-'}</td>
    <td>${[(company.address && company.address.city) || '', (company.address && company.address.state) || ''].filter(Boolean).join('/') || '-'}</td>
    <td>${formatDate(company.createdAt)}</td>
  `;
  companiesBody.appendChild(tr);
}

async function loadCompanies() {
  companiesBody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';
  const data = await request('/api/empresas/me');
  updatePlanSummary(data);

  const principal = data.principal || data.principalCompany || null;
  renderPrincipalCompany(principal);

  if (principal) {
    createCompanyBtn.disabled = true;
    companyFormMessage.style.color = 'var(--muted)';
    companyFormMessage.textContent = 'Empresa principal ja cadastrada. Use Empresas secundarias para novos cadastros.';
  }
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

function lockCertField(input) {
  if (!input) return;
  input.readOnly = true;
  input.classList.add('cert-locked');
  input.title = 'Preenchido automaticamente pelo certificado digital';
}

function clearCertificateState() {
  certExtractedInfo.value = '';
  certValidadeInput.value = '';
  certMessage.textContent = '';
}

async function extractCertificateData() {
  const certFile = certFileInput.files[0];
  const certPassword = certPasswordInput.value.trim();

  if (!certFile) {
    certMessage.style.color = 'var(--danger)';
    certMessage.textContent = 'Selecione um certificado .pfx/.p12.';
    return;
  }

  if (!certPassword) {
    certMessage.style.color = 'var(--danger)';
    certMessage.textContent = 'Informe a senha do certificado para extrair os dados.';
    return;
  }

  certMessage.style.color = 'var(--muted)';
  certMessage.textContent = 'Extraindo dados do certificado...';

  const formData = new FormData();
  formData.append('certificado', certFile);
  formData.append('senhaCertificado', certPassword);

  try {
    const response = await fetch('/api/cadastro/certificado/address-preview', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: formData,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Nao foi possivel extrair dados do certificado.');
    }

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
    certMessage.textContent = 'Dados extraidos com sucesso. Confira o formulario abaixo.';
  } catch (error) {
    certExtractedInfo.value = 'Nao identificado';
    certValidadeInput.value = '';
    certMessage.style.color = 'var(--danger)';
    certMessage.textContent = error.message;
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
      kind: 'principal',
      name: companyNameInput.value.trim(),
      cnpj: companyCnpjInput.value.trim(),
      cep: companyCepInput.value.trim(),
      street: companyStreetInput.value.trim(),
      city: companyCityInput.value.trim(),
      state: companyStateInput.value.trim().toUpperCase(),
    };

    const data = await request('/api/empresas/principal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    companyForm.reset();
    companyCepInput.classList.remove('cep-loading', 'cep-ok', 'cep-error');
    companyNameInput.readOnly = false;
    companyCnpjInput.readOnly = false;
    companyNameInput.classList.remove('cert-locked');
    companyCnpjInput.classList.remove('cert-locked');
    companyNameInput.title = '';
    companyCnpjInput.title = '';
    clearCertificateState();
    certFileInput.value = '';
    certPasswordInput.value = '';
    certFileName.textContent = '';

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
    certMessage.style.color = 'var(--muted)';
    certMessage.textContent = 'Arquivo selecionado. Informe a senha e clique em Extrair dados do certificado.';
  }
});

certFileInput.addEventListener('change', () => {
  if (certFileInput.files[0]) {
    certFileName.textContent = `Arquivo selecionado: ${certFileInput.files[0].name}`;
    certMessage.style.color = 'var(--muted)';
    certMessage.textContent = 'Arquivo selecionado. Informe a senha e clique em Extrair dados do certificado.';
  } else {
    certFileName.textContent = '';
    clearCertificateState();
  }
});

certPasswordInput.addEventListener('input', () => {
  if (certMessage.style.color !== 'rgb(46, 158, 106)') {
    certMessage.textContent = '';
  }
});

certExtractBtn.addEventListener('click', extractCertificateData);

async function bootstrap() {
  if (!authToken) {
    forceLogin();
    return;
  }

  try {
    await request('/api/auth/me');
    await loadCompanies();
  } catch {
    forceLogin();
  }
}

bootstrap();
