const TOKEN_KEY = 'emil_notas_token';

const principalCompanyLabel = document.getElementById('principalCompanyLabel');
const planUsageHintSecondary = document.getElementById('planUsageHintSecondary');
const secondaryCompanyForm = document.getElementById('secondaryCompanyForm');
const secondaryFormMessage = document.getElementById('secondaryFormMessage');
const secondaryCodeInput = document.getElementById('secondaryCodeInput');
const createSecondaryBtn = document.getElementById('createSecondaryBtn');
const updateSecondaryBtn = document.getElementById('updateSecondaryBtn');
const deleteSecondaryBtn = document.getElementById('deleteSecondaryBtn');
const closeSecondaryPageBtn = document.getElementById('closeSecondaryPageBtn');
const openConsultModalBtn = document.getElementById('openConsultModalBtn');
const refreshSecondaryCompanies = document.getElementById('refreshSecondaryCompanies');
const secondaryCompaniesBody = document.getElementById('secondaryCompaniesBody');
const companyConsultModal = document.getElementById('companyConsultModal');
const closeConsultModalBtn = document.getElementById('closeConsultModalBtn');
const closeConsultModalFooterBtn = document.getElementById('closeConsultModalFooterBtn');
const consultCompaniesBody = document.getElementById('consultCompaniesBody');

const secondaryNameInput = document.getElementById('secondaryNameInput');
const secondaryCnpjInput = document.getElementById('secondaryCnpjInput');
const secondaryCepInput = document.getElementById('secondaryCepInput');
const secondaryStreetInput = document.getElementById('secondaryStreetInput');
const secondaryCityInput = document.getElementById('secondaryCityInput');
const secondaryStateInput = document.getElementById('secondaryStateInput');

let authToken = localStorage.getItem(TOKEN_KEY) || '';
let planMeta = { companyLimit: null };
let secondaryCompanies = [];
let selectedSecondaryCompanyId = '';

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

function resetFormForCreate() {
  selectedSecondaryCompanyId = '';
  secondaryCodeInput.value = '';
  secondaryCompanyForm.reset();
  secondaryCepInput.classList.remove('cep-loading', 'cep-ok', 'cep-error');
  secondaryFormMessage.textContent = '';
}

function fillForm(company) {
  selectedSecondaryCompanyId = company.id;
  secondaryCodeInput.value = company.code || '';
  secondaryNameInput.value = company.name || '';
  secondaryCnpjInput.value = formatCnpj(company.cnpj || '');
  secondaryCepInput.value = formatCep((company.address && company.address.cep) || '');
  secondaryStreetInput.value = (company.address && company.address.street) || '';
  secondaryCityInput.value = (company.address && company.address.city) || '';
  secondaryStateInput.value = (company.address && company.address.state) || '';
}

function openConsultModal() {
  companyConsultModal.classList.remove('hidden');
}

function closeConsultModal() {
  companyConsultModal.classList.add('hidden');
}

function renderSecondaryCompanies(companies) {
  secondaryCompanies = companies;

  if (!companies.length) {
    secondaryCompaniesBody.innerHTML = '<tr><td colspan="5">Nenhuma empresa secundaria cadastrada.</td></tr>';
    consultCompaniesBody.innerHTML = '<tr><td colspan="3">Nenhuma empresa secundaria cadastrada.</td></tr>';
    return;
  }

  secondaryCompaniesBody.innerHTML = '';
  consultCompaniesBody.innerHTML = '';
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

    const consultTr = document.createElement('tr');
    consultTr.innerHTML = `
      <td>${company.code || '-'}</td>
      <td>${company.name || '-'}</td>
      <td class="actions"></td>
    `;

    const selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.textContent = 'Selecione';
    selectBtn.addEventListener('click', () => {
      fillForm(company);
      secondaryFormMessage.style.color = 'var(--muted)';
      secondaryFormMessage.textContent = 'Empresa carregada para consulta/alteracao.';
      closeConsultModal();
    });

    consultTr.querySelector('.actions').appendChild(selectBtn);
    consultCompaniesBody.appendChild(consultTr);
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
    updateSecondaryBtn.disabled = true;
    deleteSecondaryBtn.disabled = true;
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
  updateSecondaryBtn.disabled = !selectedSecondaryCompanyId;
  deleteSecondaryBtn.disabled = !selectedSecondaryCompanyId;
  renderSecondaryCompanies(secundarias);
}

async function fetchAddressFromCep(digits) {
  secondaryCepInput.classList.add('cep-loading');
  secondaryFormMessage.style.color = 'var(--muted)';
  secondaryFormMessage.textContent = 'Consultando CEP no ViaCEP...';

  try {
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    const data = await response.json();

    if (data.erro) {
      secondaryCepInput.classList.remove('cep-loading', 'cep-ok');
      secondaryCepInput.classList.add('cep-error');
      secondaryFormMessage.style.color = 'var(--danger)';
      secondaryFormMessage.textContent = 'CEP nao encontrado no ViaCEP.';
      return;
    }

    secondaryStreetInput.value = [data.logradouro, data.bairro].filter(Boolean).join(', ');
    secondaryCityInput.value = data.localidade || '';
    secondaryStateInput.value = data.uf || '';

    secondaryCepInput.classList.remove('cep-loading', 'cep-error');
    secondaryCepInput.classList.add('cep-ok');
    secondaryFormMessage.style.color = '#2e9e6a';
    secondaryFormMessage.textContent = 'Endereco preenchido automaticamente pelo ViaCEP. Confira os dados antes de salvar.';
  } catch {
    secondaryCepInput.classList.remove('cep-loading', 'cep-ok');
    secondaryCepInput.classList.add('cep-error');
    secondaryFormMessage.style.color = 'var(--danger)';
    secondaryFormMessage.textContent = 'Nao foi possivel consultar o CEP no ViaCEP.';
  }
}

async function loadSecondaryCompanies() {
  secondaryCompaniesBody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';
  const data = await request('/api/empresas/me');
  updateSummary(data);

  if (selectedSecondaryCompanyId) {
    const selected = secondaryCompanies.find((company) => company.id === selectedSecondaryCompanyId);
    if (selected) {
      fillForm(selected);
      updateSecondaryBtn.disabled = false;
      deleteSecondaryBtn.disabled = false;
    } else {
      resetFormForCreate();
      updateSecondaryBtn.disabled = true;
      deleteSecondaryBtn.disabled = true;
    }
  }
}

secondaryCnpjInput.addEventListener('input', () => {
  secondaryCnpjInput.value = formatCnpj(secondaryCnpjInput.value);
});

secondaryCepInput.addEventListener('input', () => {
  secondaryCepInput.value = formatCep(secondaryCepInput.value);
  const digits = normalizeDigits(secondaryCepInput.value);
  if (digits.length < 8) {
    secondaryCepInput.classList.remove('cep-loading', 'cep-ok', 'cep-error');
  }
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
    updateSecondaryBtn.disabled = true;
    deleteSecondaryBtn.disabled = true;
  } catch (error) {
    secondaryFormMessage.style.color = 'var(--danger)';
    secondaryFormMessage.textContent = error.message;
  }
});

updateSecondaryBtn.addEventListener('click', async () => {
  if (!selectedSecondaryCompanyId) {
    secondaryFormMessage.style.color = 'var(--danger)';
    secondaryFormMessage.textContent = 'Selecione uma empresa secundaria para alterar.';
    return;
  }

  secondaryFormMessage.style.color = 'var(--muted)';
  secondaryFormMessage.textContent = 'Atualizando empresa secundaria...';

  try {
    const payload = {
      name: secondaryNameInput.value.trim(),
      cnpj: secondaryCnpjInput.value.trim(),
      cep: secondaryCepInput.value.trim(),
      street: secondaryStreetInput.value.trim(),
      city: secondaryCityInput.value.trim(),
      state: secondaryStateInput.value.trim().toUpperCase(),
    };

    const data = await request(`/api/empresas/secundarias/${selectedSecondaryCompanyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    secondaryFormMessage.style.color = '#2e9e6a';
    secondaryFormMessage.textContent = data.message;
    await loadSecondaryCompanies();
  } catch (error) {
    secondaryFormMessage.style.color = 'var(--danger)';
    secondaryFormMessage.textContent = error.message;
  }
});

deleteSecondaryBtn.addEventListener('click', async () => {
  if (!selectedSecondaryCompanyId) {
    secondaryFormMessage.style.color = 'var(--danger)';
    secondaryFormMessage.textContent = 'Selecione uma empresa secundaria para excluir.';
    return;
  }

  if (!window.confirm('Deseja excluir esta empresa secundaria?')) {
    return;
  }

  try {
    await request(`/api/empresas/secundarias/${selectedSecondaryCompanyId}`, {
      method: 'DELETE',
    });

    resetFormForCreate();
    updateSecondaryBtn.disabled = true;
    deleteSecondaryBtn.disabled = true;
    secondaryFormMessage.style.color = '#2e9e6a';
    secondaryFormMessage.textContent = 'Empresa secundaria excluida com sucesso.';
    await loadSecondaryCompanies();
  } catch (error) {
    secondaryFormMessage.style.color = 'var(--danger)';
    secondaryFormMessage.textContent = error.message;
  }
});

openConsultModalBtn.addEventListener('click', openConsultModal);
closeConsultModalBtn.addEventListener('click', closeConsultModal);
closeConsultModalFooterBtn.addEventListener('click', closeConsultModal);
companyConsultModal.addEventListener('click', (event) => {
  if (event.target === companyConsultModal) {
    closeConsultModal();
  }
});
closeSecondaryPageBtn.addEventListener('click', () => {
  window.location.href = '/dashboard';
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
    resetFormForCreate();
    updateSecondaryBtn.disabled = true;
    deleteSecondaryBtn.disabled = true;
    await loadSecondaryCompanies();
  } catch {
    forceLogin();
  }
}

bootstrap();
