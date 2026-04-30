const TOKEN_KEY = 'emil_notas_token';

let authToken = localStorage.getItem(TOKEN_KEY) || '';
let allCompanies = [];
let editingCompanyId = null;

// DOM refs
const planUsageHint = document.getElementById('planUsageHint');
const companiesBody = document.getElementById('companiesBody');
const companySearchInput = document.getElementById('companySearchInput');
const fabAddCompany = document.getElementById('fabAddCompany');

const companyModal = document.getElementById('companyModal');
// Ensure modal is hidden on initial load
if (companyModal) companyModal.classList.add('hidden');
const companyModalTitle = document.getElementById('companyModalTitle');
const companyForm = document.getElementById('companyForm');
const companyFormMessage = document.getElementById('companyFormMessage');
const saveCompanyBtn = document.getElementById('saveCompanyBtn');
const closeCompanyModalBtn = document.getElementById('closeCompanyModalBtn');
const cancelCompanyModalBtn = document.getElementById('cancelCompanyModalBtn');

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
const certValidadeInput = document.getElementById('certValidadeInput');
const certMessage = document.getElementById('certMessage');

// ---- Auth helpers ----
function forceLogin() {
  authToken = '';
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = '/login';
}

function getAuthHeaders(extra = {}) {
  return authToken ? { ...extra, Authorization: `Bearer ${authToken}` } : extra;
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: getAuthHeaders(options.headers || {}),
  });

  if (!response.ok) {
    if (response.status === 401) { forceLogin(); throw new Error('Sessao expirada.'); }
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.error || 'Falha na requisicao');
  }

  if (response.status === 204) return null;
  return response.json();
}

// ---- Formatters ----
function normalizeDigits(v) { return String(v || '').replace(/\D/g, ''); }

function formatCnpj(v) {
  let d = normalizeDigits(v).slice(0, 14);
  if (d.length > 12) d = d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, '$1.$2.$3/$4-$5');
  else if (d.length > 8) d = d.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, '$1.$2.$3/$4');
  else if (d.length > 5) d = d.replace(/(\d{2})(\d{3})(\d{1,3})/, '$1.$2.$3');
  else if (d.length > 2) d = d.replace(/(\d{2})(\d{1,3})/, '$1.$2');
  return d;
}

function formatCep(v) {
  let d = normalizeDigits(v).slice(0, 8);
  if (d.length > 5) d = d.replace(/(\d{5})(\d{1,3})/, '$1-$2');
  return d;
}

// ---- Render table ----
function renderTable(companies) {
  if (!companies.length) {
    companiesBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhuma empresa cadastrada.</td></tr>';
    return;
  }

  companiesBody.innerHTML = '';
  companies.forEach((company) => {
    const tr = document.createElement('tr');

    const cityState = [
      (company.address && company.address.city) || '',
      (company.address && company.address.state) || '',
    ].filter(Boolean).join('/') || '-';

    tr.innerHTML = `
      <td class="col-action-btn">
        <button class="btn-icon btn-edit" data-id="${company.id}" title="Editar">&#9998;</button>
      </td>
      <td class="col-action-btn">
        <button class="btn-icon btn-delete" data-id="${company.id}" title="Excluir">&#128465;</button>
      </td>
      <td>${company.code || '-'}</td>
      <td>${company.name || '-'}</td>
      <td>${formatCnpj(company.cnpj || '') || '-'}</td>
      <td>${cityState}</td>
    `;

    tr.querySelector('.btn-edit').addEventListener('click', () => openEditModal(company));
    tr.querySelector('.btn-delete').addEventListener('click', () => confirmDelete(company));

    companiesBody.appendChild(tr);
  });
}

// ---- Load data ----
async function loadCompanies() {
  companiesBody.innerHTML = '<tr><td colspan="6">Carregando...</td></tr>';

  try {
    const data = await request('/api/empresas/me');
    const plan = data.plan || {};
    const usage = (data.usage && data.usage.companies) || 0;

    if (Number.isFinite(plan.companyLimit)) {
      planUsageHint.textContent = `Plano ${plan.label || '-'} · ${usage} de ${plan.companyLimit} empresa(s) cadastrada(s).`;
    } else {
      planUsageHint.textContent = `Plano ${plan.label || '-'} · ${usage} empresa(s) cadastrada(s).`;
    }

    allCompanies = Array.isArray(data.companies) ? data.companies : [];
    applySearch();
  } catch (error) {
    companiesBody.innerHTML = `<tr><td colspan="6" style="color:var(--danger)">${error.message}</td></tr>`;
  }
}

function applySearch() {
  const q = (companySearchInput.value || '').toLowerCase().trim();
  const filtered = q
    ? allCompanies.filter((c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.cnpj || '').includes(q) ||
        (c.code || '').toLowerCase().includes(q)
      )
    : allCompanies;
  renderTable(filtered);
}

companySearchInput.addEventListener('input', applySearch);

// ---- Modal helpers ----
function openModal() { companyModal.classList.remove('hidden'); }
function closeModal() {
  companyModal.classList.add('hidden');
  editingCompanyId = null;
  companyForm.reset();
  companyCepInput.classList.remove('cep-loading', 'cep-ok', 'cep-error');
  companyFormMessage.textContent = '';
  companyNameInput.readOnly = false;
  companyCnpjInput.readOnly = false;
  companyNameInput.classList.remove('cert-locked');
  companyCnpjInput.classList.remove('cert-locked');
  certFileInput.value = '';
  certFileName.textContent = '';
  certPasswordInput.value = '';
  certValidadeInput.value = '';
  certMessage.textContent = '';
}

function openCreateModal() {
  editingCompanyId = null;
  companyModalTitle.textContent = 'Nova empresa';
  openModal();
}

function openEditModal(company) {
  editingCompanyId = company.id;
  companyModalTitle.textContent = 'Editar empresa';

  companyNameInput.value = company.name || '';
  companyCnpjInput.value = formatCnpj(company.cnpj || '');
  companyCepInput.value = formatCep((company.address && company.address.cep) || '');
  companyStreetInput.value = (company.address && company.address.street) || '';
  companyCityInput.value = (company.address && company.address.city) || '';
  companyStateInput.value = (company.address && company.address.state) || '';

  openModal();
}

fabAddCompany.addEventListener('click', openCreateModal);
closeCompanyModalBtn.addEventListener('click', closeModal);
cancelCompanyModalBtn.addEventListener('click', closeModal);
companyModal.addEventListener('click', (e) => { if (e.target === companyModal) closeModal(); });

// ---- CEP auto-fill ----
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

companyCnpjInput.addEventListener('input', () => { companyCnpjInput.value = formatCnpj(companyCnpjInput.value); });
companyCepInput.addEventListener('input', () => {
  companyCepInput.value = formatCep(companyCepInput.value);
  const digits = normalizeDigits(companyCepInput.value);
  if (digits.length === 8) fetchAddressFromCep(digits);
  if (digits.length < 8) companyCepInput.classList.remove('cep-loading', 'cep-ok', 'cep-error');
});

// ---- Certificate extraction ----
certUploadArea.addEventListener('click', () => certFileInput.click());
certUploadArea.addEventListener('dragover', (e) => { e.preventDefault(); certUploadArea.classList.add('drag-over'); });
certUploadArea.addEventListener('dragleave', () => certUploadArea.classList.remove('drag-over'));
certUploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  certUploadArea.classList.remove('drag-over');
  if (e.dataTransfer.files.length) {
    certFileInput.files = e.dataTransfer.files;
    certFileName.textContent = e.dataTransfer.files[0].name;
  }
});
certFileInput.addEventListener('change', () => {
  if (certFileInput.files[0]) certFileName.textContent = certFileInput.files[0].name;
});

certExtractBtn.addEventListener('click', async () => {
  const certFile = certFileInput.files[0];
  const certPassword = certPasswordInput.value.trim();

  if (!certFile) {
    certMessage.style.color = 'var(--danger)';
    certMessage.textContent = 'Selecione um certificado .pfx/.p12.';
    return;
  }
  if (!certPassword) {
    certMessage.style.color = 'var(--danger)';
    certMessage.textContent = 'Informe a senha do certificado.';
    return;
  }

  certMessage.style.color = 'var(--muted)';
  certMessage.textContent = 'Extraindo dados...';

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
    if (!response.ok) throw new Error(data.error || 'Falha ao extrair dados.');

    const cert = data.certificate || {};

    if (cert.validTo) {
      const validDate = new Date(cert.validTo);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (validDate < today) {
        certMessage.style.color = 'var(--danger)';
        certMessage.textContent = `Certificado vencido em ${validDate.toLocaleDateString('pt-BR')}. Atualize o certificado antes de prosseguir.`;
        certValidadeInput.value = '';
        return;
      }

      certValidadeInput.value = String(cert.validTo).slice(0, 10);

      const daysLeft = Math.ceil((validDate - today) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 30) {
        certMessage.style.color = '#b87500';
        certMessage.textContent = `Atenção: certificado vence em ${daysLeft} dia${daysLeft === 1 ? '' : 's'} (${validDate.toLocaleDateString('pt-BR')}). Renove em breve.`;
      } else {
        certMessage.style.color = '#2e9e6a';
        certMessage.textContent = 'Dados extraidos com sucesso. Confira abaixo.';
      }
    } else {
      certMessage.style.color = '#2e9e6a';
      certMessage.textContent = 'Dados extraidos com sucesso. Confira abaixo.';
    }

    if (cert.companyName && !companyNameInput.value.trim()) {
      companyNameInput.value = cert.companyName;
      companyNameInput.readOnly = true;
      companyNameInput.classList.add('cert-locked');
    }
    if (cert.cnpjFormatted && !companyCnpjInput.value.trim()) {
      companyCnpjInput.value = cert.cnpjFormatted;
      companyCnpjInput.readOnly = true;
      companyCnpjInput.classList.add('cert-locked');
    }

  } catch (error) {
    certMessage.style.color = 'var(--danger)';
    certMessage.textContent = error.message;
  }
});

// ---- Save (create or update) ----
saveCompanyBtn.addEventListener('click', async () => {
  if (!companyForm.reportValidity()) return;

  companyFormMessage.style.color = 'var(--muted)';
  companyFormMessage.textContent = 'Salvando...';
  saveCompanyBtn.disabled = true;

  const payload = {
    name: companyNameInput.value.trim(),
    cnpj: companyCnpjInput.value.trim(),
    cep: companyCepInput.value.trim(),
    street: companyStreetInput.value.trim(),
    city: companyCityInput.value.trim(),
    state: companyStateInput.value.trim().toUpperCase(),
  };

  try {
    if (editingCompanyId) {
      await request(`/api/empresas/${editingCompanyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await request('/api/empresas/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    closeModal();
    await loadCompanies();
  } catch (error) {
    companyFormMessage.style.color = 'var(--danger)';
    companyFormMessage.textContent = error.message;
  } finally {
    saveCompanyBtn.disabled = false;
  }
});

// ---- Delete ----
async function confirmDelete(company) {
  if (!window.confirm(`Excluir a empresa "${company.name}"? Esta acao nao pode ser desfeita.`)) return;

  try {
    await request(`/api/empresas/${company.id}`, { method: 'DELETE' });
    await loadCompanies();
  } catch (error) {
    alert(error.message);
  }
}

// ---- Init ----
loadCompanies();

// ---- Ensure modal is hidden on page load ----
window.addEventListener('load', () => {
  companyModal.classList.add('hidden');
});
