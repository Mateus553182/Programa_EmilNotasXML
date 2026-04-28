const TOKEN_KEY = 'emil_notas_token';

const companyFilterSelect = document.getElementById('companyFilterSelect');
const searchNotesInput = document.getElementById('searchNotesInput');
const btnAtualizarRelatorio = document.getElementById('btnAtualizarRelatorio');
const btnGerarFechamento = document.getElementById('btnGerarFechamento');
const reportNotesBody = document.getElementById('reportNotesBody');
const monthlyReportBody = document.getElementById('monthlyReportBody');

const kpiQuantidade = document.getElementById('kpiQuantidade');
const kpiValor = document.getElementById('kpiValor');
const kpiUltimo = document.getElementById('kpiUltimo');

let authToken = localStorage.getItem(TOKEN_KEY) || '';
let companyMap = new Map();
let selectedCompanyId = '';
let allNotes = [];

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

function toCurrency(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function parseCurrency(value) {
  if (typeof value === 'number') return value;
  const txt = String(value || '').trim();
  if (!txt) return 0;
  const cleaned = txt.replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('pt-BR');
}

function buildCompanyOptions(companies) {
  companyFilterSelect.innerHTML = '';
  companies.forEach((company) => {
    companyMap.set(company.id, company);
    const option = document.createElement('option');
    option.value = company.id;
    option.textContent = company.name;
    companyFilterSelect.appendChild(option);
  });

  if (companies.length) {
    selectedCompanyId = companies[0].id;
    companyFilterSelect.value = selectedCompanyId;
  }
}

function noteStatus(note) {
  if ((note.valorTotal || '').toString().includes('-')) return 'Cancelada';
  return 'Autorizada';
}

function filteredNotes() {
  const term = String(searchNotesInput.value || '').trim().toLowerCase();
  if (!term) return allNotes;

  return allNotes.filter((note) => {
    return [
      note.numero,
      note.chave,
      note.razaoEmitente,
      note.cnpjEmitente,
      note.notaName,
    ]
      .map((item) => String(item || '').toLowerCase())
      .some((value) => value.includes(term));
  });
}

function renderKpis(notes) {
  kpiQuantidade.textContent = String(notes.length);

  const total = notes.reduce((acc, note) => acc + parseCurrency(note.valorTotal), 0);
  kpiValor.textContent = toCurrency(total);

  const last = notes
    .map((note) => note.uploadedAt || note.emissao)
    .filter(Boolean)
    .sort()
    .pop();

  kpiUltimo.textContent = last ? formatDate(last) : '-';
}

function renderNotesTable(notes) {
  if (!notes.length) {
    reportNotesBody.innerHTML = '<tr><td colspan="7">Nenhuma nota encontrada para esta empresa.</td></tr>';
    return;
  }

  reportNotesBody.innerHTML = '';
  notes.forEach((note) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${note.numero || '-'}</td>
      <td>${note.chave || '-'}</td>
      <td>${formatDate(note.emissao || note.uploadedAt)}</td>
      <td>${noteStatus(note)}</td>
      <td>${note.razaoEmitente || '-'}</td>
      <td>${note.valorTotal || toCurrency(0)}</td>
      <td>Completa</td>
    `;
    reportNotesBody.appendChild(tr);
  });
}

function monthKey(dateValue) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function renderMonthly(notes) {
  const company = companyMap.get(selectedCompanyId);
  const grouped = new Map();

  notes.forEach((note) => {
    const key = monthKey(note.emissao || note.uploadedAt);
    if (!key) return;

    if (!grouped.has(key)) {
      grouped.set(key, { count: 0, total: 0 });
    }

    const bucket = grouped.get(key);
    bucket.count += 1;
    bucket.total += parseCurrency(note.valorTotal);
  });

  const rows = Array.from(grouped.entries()).sort((a, b) => b[0].localeCompare(a[0]));

  if (!rows.length) {
    monthlyReportBody.innerHTML = '<tr><td colspan="4">Sem dados para fechamento mensal.</td></tr>';
    return;
  }

  monthlyReportBody.innerHTML = '';
  rows.forEach(([period, info]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${period}</td>
      <td>${company ? company.name : '-'}</td>
      <td>${info.count}</td>
      <td>${toCurrency(info.total)}</td>
    `;
    monthlyReportBody.appendChild(tr);
  });
}

function refreshVisuals() {
  const notes = filteredNotes();
  renderKpis(notes);
  renderNotesTable(notes);
  renderMonthly(notes);
}

async function loadNotesByCompany(companyId) {
  if (!companyId) {
    allNotes = [];
    refreshVisuals();
    return;
  }

  reportNotesBody.innerHTML = '<tr><td colspan="7">Carregando...</td></tr>';
  const notes = await request(`/api/notas?companyId=${encodeURIComponent(companyId)}`);
  allNotes = Array.isArray(notes) ? notes : [];
  refreshVisuals();
}

async function bootstrap() {
  if (!authToken) {
    forceLogin();
    return;
  }

  try {
    await request('/api/auth/me');
    const data = await request('/api/empresas/me');
    const companies = Array.isArray(data.companies) ? data.companies : [];

    buildCompanyOptions(companies);
    await loadNotesByCompany(selectedCompanyId);
  } catch {
    forceLogin();
  }
}

companyFilterSelect.addEventListener('change', async () => {
  selectedCompanyId = companyFilterSelect.value;
  await loadNotesByCompany(selectedCompanyId);
});

searchNotesInput.addEventListener('input', refreshVisuals);
btnAtualizarRelatorio.addEventListener('click', async () => {
  await loadNotesByCompany(selectedCompanyId);
});
btnGerarFechamento.addEventListener('click', refreshVisuals);

bootstrap();
