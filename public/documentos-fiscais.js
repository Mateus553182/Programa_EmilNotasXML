const TOKEN_KEY = 'emil_notas_token';

const empresaSelect = document.getElementById('dfxEmpresa');
const dataDeInput = document.getElementById('dfxDataDe');
const dataAteInput = document.getElementById('dfxDataAte');
const cnpjDeInput = document.getElementById('dfxCnpjDe');
const cnpjAteInput = document.getElementById('dfxCnpjAte');

const buscarBtn = document.getElementById('dfxBuscar');
const excelBtn = document.getElementById('dfxExcel');
const zipBtn = document.getElementById('dfxDownloadZip');

const tableBody = document.getElementById('dfxTableBody');
const message = document.getElementById('dfxMessage');

let authToken = localStorage.getItem(TOKEN_KEY) || '';
let lastRows = [];

function forceLogin() {
  authToken = '';
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = '/login';
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

function formatDate(value) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString('pt-BR');
}

function toCurrency(value) {
  const amount = Number(value) || 0;
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getAuthHeaders(extra = {}) {
  return authToken ? { ...extra, Authorization: `Bearer ${authToken}` } : extra;
}

async function requestJson(url) {
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    if (response.status === 401) {
      forceLogin();
      throw new Error('Sessao expirada.');
    }

    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.error || 'Erro na requisicao.');
  }

  return response.json();
}

function getFileNameFromDisposition(disposition, fallback) {
  const value = String(disposition || '');
  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const plainMatch = value.match(/filename="?([^";]+)"?/i);
  if (plainMatch && plainMatch[1]) {
    return plainMatch[1];
  }

  return fallback;
}

async function requestBlob(url) {
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    if (response.status === 401) {
      forceLogin();
      throw new Error('Sessao expirada.');
    }

    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.error || 'Falha ao baixar arquivo.');
  }

  const blob = await response.blob();
  const fileName = getFileNameFromDisposition(response.headers.get('content-disposition'), 'arquivo');
  return { blob, fileName };
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function getTodayIso() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildQueryString() {
  const companyId = String(empresaSelect.value || '').trim();
  if (!companyId) {
    throw new Error('Selecione uma empresa.');
  }

  const dataDe = String(dataDeInput.value || '').trim();
  const dataAte = String(dataAteInput.value || '').trim();
  if (!dataDe || !dataAte) {
    throw new Error('Informe a data inicial e final.');
  }

  if (new Date(dataDe) > new Date(dataAte)) {
    throw new Error('Periodo invalido: a data inicial deve ser menor ou igual a data final.');
  }

  const cnpjDe = normalizeDigits(cnpjDeInput.value || '').slice(0, 14) || '00000000000000';
  const cnpjAte = normalizeDigits(cnpjAteInput.value || '').slice(0, 14) || '99999999999999';

  const params = new URLSearchParams({
    companyId,
    dataDe,
    dataAte,
    cnpjDe,
    cnpjAte,
  });

  return params.toString();
}

function setMessage(text, isError) {
  message.style.color = isError ? 'var(--danger)' : 'var(--muted)';
  message.textContent = text || '';
}

function setActionButtonsState(enabled) {
  excelBtn.disabled = !enabled;
  zipBtn.disabled = !enabled;
}

function renderRows(rows) {
  tableBody.innerHTML = '';

  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'dfx-empty';
    td.textContent = 'Nenhum documento encontrado para os filtros informados.';
    tr.appendChild(td);
    tableBody.appendChild(tr);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement('tr');

    const tdNumero = document.createElement('td');
    const numeroBtn = document.createElement('button');
    numeroBtn.type = 'button';
    numeroBtn.className = 'dfx-link-button';
    numeroBtn.textContent = row.numero || '-';
    numeroBtn.title = 'Clique para baixar o XML desta nota';
    numeroBtn.addEventListener('click', async () => {
      try {
        const { blob, fileName } = await requestBlob(`/api/notas/${encodeURIComponent(row.id)}/download`);
        triggerDownload(blob, fileName || `${row.chave || row.id}.xml`);
      } catch (error) {
        setMessage(error.message, true);
      }
    });
    tdNumero.appendChild(numeroBtn);

    const tdCnpj = document.createElement('td');
    tdCnpj.textContent = formatCnpj(row.cnpj);

    const tdNome = document.createElement('td');
    tdNome.textContent = row.nome || '-';

    const tdChave = document.createElement('td');
    tdChave.textContent = row.chave || '-';

    const tdData = document.createElement('td');
    tdData.textContent = formatDate(row.dataEmissao);

    const tdValor = document.createElement('td');
    tdValor.className = 'dfx-cell-value';
    tdValor.textContent = toCurrency(row.valor);

    tr.appendChild(tdNumero);
    tr.appendChild(tdCnpj);
    tr.appendChild(tdNome);
    tr.appendChild(tdChave);
    tr.appendChild(tdData);
    tr.appendChild(tdValor);

    tableBody.appendChild(tr);
  });
}

async function loadCompanies() {
  const data = await requestJson('/api/empresas/me');
  const list = Array.isArray(data.companies) ? data.companies : [];

  empresaSelect.innerHTML = '';
  if (!list.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Nenhuma empresa cadastrada';
    empresaSelect.appendChild(option);
    buscarBtn.disabled = true;
    return;
  }

  list.forEach((company) => {
    const option = document.createElement('option');
    option.value = company.id;
    option.textContent = company.name;
    empresaSelect.appendChild(option);
  });

  buscarBtn.disabled = false;
}

async function buscarNotas() {
  try {
    setMessage('Buscando documentos fiscais...', false);
    const query = buildQueryString();
    const data = await requestJson(`/api/documentos-fiscais?${query}`);

    lastRows = Array.isArray(data.notes) ? data.notes : [];
    renderRows(lastRows);
    setActionButtonsState(lastRows.length > 0);

    if (!lastRows.length) {
      setMessage('Nenhuma nota encontrada para o filtro informado.', false);
      return;
    }

    setMessage(`${lastRows.length} nota(s) encontrada(s). Clique no numero para baixar o XML individual.`, false);
  } catch (error) {
    setActionButtonsState(false);
    renderRows([]);
    setMessage(error.message, true);
  }
}

async function baixarRelacaoExcel() {
  try {
    const query = buildQueryString();
    const { blob, fileName } = await requestBlob(`/api/documentos-fiscais/exportar-excel?${query}`);
    triggerDownload(blob, fileName || 'relacao-documentos-fiscais.xls');
    setMessage('Relacao em Excel gerada com sucesso.', false);
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function baixarXmlZip() {
  try {
    const query = buildQueryString();
    const { blob, fileName } = await requestBlob(`/api/documentos-fiscais/download-xml-zip?${query}`);
    triggerDownload(blob, fileName || 'documentos-fiscais.zip');
    setMessage('Download de XML em ZIP iniciado.', false);
  } catch (error) {
    setMessage(error.message, true);
  }
}

function installInputMasks() {
  [cnpjDeInput, cnpjAteInput].forEach((input) => {
    input.addEventListener('input', () => {
      input.value = formatCnpj(input.value);
    });
  });
}

function installEvents() {
  buscarBtn.addEventListener('click', buscarNotas);
  excelBtn.addEventListener('click', baixarRelacaoExcel);
  zipBtn.addEventListener('click', baixarXmlZip);
}

async function init() {
  if (!authToken) {
    forceLogin();
    return;
  }

  const today = getTodayIso();
  dataDeInput.value = today;
  dataAteInput.value = today;
  cnpjDeInput.value = '00000000000000';
  cnpjAteInput.value = '99999999999999';

  setActionButtonsState(false);
  installInputMasks();
  installEvents();

  try {
    await loadCompanies();
    setMessage('Selecione os filtros e clique em Buscar.', false);
  } catch (error) {
    setMessage(error.message, true);
  }
}

init();
