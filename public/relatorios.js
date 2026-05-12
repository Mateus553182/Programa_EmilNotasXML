const TOKEN_KEY = 'emil_notas_token';

const xrlSidebar = document.getElementById('xrlSidebar');
const xrlSidebarToggle = document.getElementById('xrlSidebarToggle');
const xrlMenuItems = Array.from(document.querySelectorAll('.xrl-menu-item'));
const xrlViews = Array.from(document.querySelectorAll('[data-xrl-panel]'));

const xrlCompanySelect = document.getElementById('xrlCompanySelect');
const xrlPeriodPreset = document.getElementById('xrlPeriodPreset');
const xrlGlobalSearch = document.getElementById('xrlGlobalSearch');
const xrlFromDate = document.getElementById('xrlFromDate');
const xrlToDate = document.getElementById('xrlToDate');
const xrlCustomRange = document.getElementById('xrlCustomRange');

const xrlKpiMonthCount = document.getElementById('xrlKpiMonthCount');
const xrlKpiTotalValue = document.getElementById('xrlKpiTotalValue');
const xrlKpiPending = document.getElementById('xrlKpiPending');
const xrlKpiRejected = document.getElementById('xrlKpiRejected');

const xrlDailyChart = document.getElementById('xrlDailyChart');
const xrlTopSuppliersBody = document.getElementById('xrlTopSuppliersBody');
const xrlRecentNotesBody = document.getElementById('xrlRecentNotesBody');

const xrlNotesTableBody = document.getElementById('xrlNotesTableBody');

const xrlFilterSupplier = document.getElementById('xrlFilterSupplier');
const xrlFilterCnpj = document.getElementById('xrlFilterCnpj');
const xrlFilterStatus = document.getElementById('xrlFilterStatus');
const xrlFilterType = document.getElementById('xrlFilterType');
const xrlFilterOperation = document.getElementById('xrlFilterOperation');
const xrlFilterValueMin = document.getElementById('xrlFilterValueMin');
const xrlFilterValueMax = document.getElementById('xrlFilterValueMax');
const xrlFilterKey = document.getElementById('xrlFilterKey');

const xrlApplyAdvancedFilters = document.getElementById('xrlApplyAdvancedFilters');
const xrlClearAdvancedFilters = document.getElementById('xrlClearAdvancedFilters');
const xrlImportXmlBtn = document.getElementById('xrlImportXmlBtn');
const xrlDownloadNotesBtn = document.getElementById('xrlDownloadNotesBtn');
const xrlExportBtn = document.getElementById('xrlExportBtn');
const xrlManifestBtn = document.getElementById('xrlManifestBtn');

const xrlNoteModal = document.getElementById('xrlNoteModal');
const xrlModalTitle = document.getElementById('xrlModalTitle');
const xrlCloseModalTop = document.getElementById('xrlCloseModalTop');
const xrlCloseModalBottom = document.getElementById('xrlCloseModalBottom');
const xrlNoteTabs = Array.from(document.querySelectorAll('[data-note-tab]'));
const xrlTabGeneral = document.getElementById('xrlTabGeneral');
const xrlTabProducts = document.getElementById('xrlTabProducts');
const xrlTabXml = document.getElementById('xrlTabXml');
const xrlTabEvents = document.getElementById('xrlTabEvents');
const xrlGeneralData = document.getElementById('xrlGeneralData');
const xrlProductsBody = document.getElementById('xrlProductsBody');
const xrlXmlViewer = document.getElementById('xrlXmlViewer');
const xrlEventsTimeline = document.getElementById('xrlEventsTimeline');

let authToken = localStorage.getItem(TOKEN_KEY) || '';
let companies = [];
let notesByCompany = new Map();
let selectedCompanyId = '';
let activeViewId = 'dashboardView';
let lastFilteredNotes = [];
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
    if (response.status === 401) {
      forceLogin();
      throw new Error('Sessao expirada.');
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
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR');
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR');
}

function noteStatus(note) {
  const raw = parseCurrency(note.valorTotal);
  if (raw < 0) return 'cancelada';
  const memo = [note.notaName, note.fileName].map((item) => String(item || '').toLowerCase()).join(' ');
  if (memo.includes('rej')) return 'rejeitada';
  if (memo.includes('pend')) return 'pendente';
  if (memo.includes('manifest')) return 'manifestacao';
  return 'autorizada';
}

function statusLabel(status) {
  const map = {
    autorizada: 'Autorizada',
    pendente: 'Pendente',
    rejeitada: 'Rejeitada',
    manifestacao: 'Manifestacao',
    cancelada: 'Cancelada',
  };

  return map[status] || 'Autorizada';
}

function noteType(note) {
  const text = String(note.notaName || note.fileName || '').toLowerCase();
  if (text.includes('cte')) return 'cte';
  if (text.includes('nfse') || text.includes('nfs')) return 'nfse';
  return 'nfe';
}

function noteOperation(note) {
  const text = [note.notaName, note.fileName, note.razaoEmitente, note.razaoDestinatario]
    .map((item) => String(item || '').toLowerCase())
    .join(' ');

  if (text.includes('devol')) return 'devolucao';
  if (text.includes('retorno')) return 'retorno';
  if (text.includes('entrada')) return 'entrada';
  return 'outros';
}

function getCompanyNotes() {
  return notesByCompany.get(selectedCompanyId) || [];
}

function setSidebarExpanded(expanded) {
  xrlSidebar.classList.toggle('is-collapsed', !expanded);
  xrlSidebarToggle.setAttribute('aria-expanded', String(expanded));
}

function setActiveView(viewId) {
  activeViewId = viewId;

  xrlViews.forEach((panel) => {
    const isActive = panel.id === viewId;
    panel.hidden = !isActive;
    panel.classList.toggle('is-active', isActive);
  });

  xrlMenuItems.forEach((item) => {
    item.classList.toggle('is-active', item.dataset.xrlView === viewId);
  });

  setSidebarExpanded(false);
}

function buildCompanySelect(list) {
  xrlCompanySelect.innerHTML = '';

  if (!list.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Nenhuma empresa cadastrada';
    xrlCompanySelect.appendChild(option);
    selectedCompanyId = '';
    return;
  }

  list.forEach((company) => {
    const option = document.createElement('option');
    option.value = company.id;
    option.textContent = company.name;
    xrlCompanySelect.appendChild(option);
  });

  selectedCompanyId = list[0].id;
  xrlCompanySelect.value = selectedCompanyId;
}

function resolveRangeDates() {
  const now = new Date();
  const from = new Date(now);
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  if (xrlPeriodPreset.value === '7d') {
    from.setDate(now.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }

  if (xrlPeriodPreset.value === '30d') {
    from.setDate(now.getDate() - 29);
    from.setHours(0, 0, 0, 0);
    return { from, to };
  }

  if (xrlPeriodPreset.value === 'custom') {
    const customFrom = xrlFromDate.value ? new Date(xrlFromDate.value) : null;
    const customTo = xrlToDate.value ? new Date(xrlToDate.value) : null;
    if (customTo) customTo.setHours(23, 59, 59, 999);
    return { from: customFrom, to: customTo };
  }

  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

function applyAllFilters() {
  const notes = getCompanyNotes();
  const search = String(xrlGlobalSearch.value || '').trim().toLowerCase();
  const supplier = String(xrlFilterSupplier.value || '').trim().toLowerCase();
  const cnpj = normalizeDigits(xrlFilterCnpj.value || '');
  const key = normalizeDigits(xrlFilterKey.value || '');
  const status = xrlFilterStatus.value;
  const type = xrlFilterType.value;
  const operation = xrlFilterOperation.value;
  const valueMin = xrlFilterValueMin.value ? Number(xrlFilterValueMin.value) : null;
  const valueMax = xrlFilterValueMax.value ? Number(xrlFilterValueMax.value) : null;
  const range = resolveRangeDates();

  return notes.filter((note) => {
    const haystack = [
      note.numero,
      note.chave,
      note.razaoEmitente,
      note.cnpjEmitente,
      note.notaName,
      note.fileName,
      note.valorTotal,
    ].map((item) => String(item || '').toLowerCase());

    const noteDate = new Date(note.emissao || note.uploadedAt || '');
    const withinFrom = !range.from || (!Number.isNaN(noteDate.getTime()) && noteDate >= range.from);
    const withinTo = !range.to || (!Number.isNaN(noteDate.getTime()) && noteDate <= range.to);

    const provider = String(note.razaoEmitente || '').toLowerCase();
    const providerCnpj = normalizeDigits(note.cnpjEmitente || '');
    const noteKey = normalizeDigits(note.chave || '');
    const noteValue = parseCurrency(note.valorTotal);
    const noteStatusValue = noteStatus(note);
    const noteTypeValue = noteType(note);
    const noteOperationValue = noteOperation(note);

    const bySearch = !search || haystack.some((value) => value.includes(search));
    const bySupplier = !supplier || provider.includes(supplier);
    const byCnpj = !cnpj || providerCnpj.includes(cnpj);
    const byKey = !key || noteKey.includes(key);
    const byStatus = !status || noteStatusValue === status;
    const byType = !type || noteTypeValue === type;
    const byOperation = !operation || noteOperationValue === operation;
    const byMin = valueMin === null || noteValue >= valueMin;
    const byMax = valueMax === null || noteValue <= valueMax;

    return bySearch && bySupplier && byCnpj && byKey && byStatus && byType && byOperation && byMin && byMax && withinFrom && withinTo;
  }).sort((a, b) => {
    const left = new Date(a.emissao || a.uploadedAt || 0).getTime();
    const right = new Date(b.emissao || b.uploadedAt || 0).getTime();
    return right - left;
  });
}

function renderKpis(notes) {
  const monthCount = notes.length;
  const totalValue = notes.reduce((acc, note) => acc + parseCurrency(note.valorTotal), 0);
  const pending = notes.filter((note) => noteStatus(note) === 'pendente').length;
  const rejected = notes.filter((note) => noteStatus(note) === 'rejeitada').length;

  xrlKpiMonthCount.textContent = String(monthCount);
  xrlKpiTotalValue.textContent = toCurrency(totalValue);
  xrlKpiPending.textContent = String(pending);
  xrlKpiRejected.textContent = String(rejected);
}

function renderDailyChart(notes) {
  const grouped = new Map();

  notes.forEach((note) => {
    const key = formatDate(note.emissao || note.uploadedAt);
    if (key === '-') return;
    grouped.set(key, (grouped.get(key) || 0) + 1);
  });

  const rows = Array.from(grouped.entries())
    .slice(0, 14)
    .reverse();

  if (!rows.length) {
    xrlDailyChart.innerHTML = '<p class="subtitle-auth">Sem notas no periodo para montar o grafico.</p>';
    return;
  }

  const max = Math.max(...rows.map(([, count]) => count), 1);

  xrlDailyChart.innerHTML = '';
  rows.forEach(([day, count]) => {
    const bar = document.createElement('div');
    bar.className = 'xrl-chart-row';
    bar.innerHTML = `
      <span>${day}</span>
      <div class="xrl-chart-track"><i style="width:${Math.max(8, (count / max) * 100)}%"></i></div>
      <strong>${count}</strong>
    `;
    xrlDailyChart.appendChild(bar);
  });
}

function renderTopSuppliers(notes) {
  const map = new Map();

  notes.forEach((note) => {
    const supplier = note.razaoEmitente || 'Fornecedor nao identificado';
    const value = parseCurrency(note.valorTotal);
    map.set(supplier, (map.get(supplier) || 0) + value);
  });

  const rows = Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (!rows.length) {
    xrlTopSuppliersBody.innerHTML = '<tr><td colspan="2">Sem fornecedores no periodo.</td></tr>';
    return;
  }

  xrlTopSuppliersBody.innerHTML = rows.map(([supplier, value]) => `
    <tr>
      <td>${supplier}</td>
      <td>${toCurrency(value)}</td>
    </tr>
  `).join('');
}

function badgeForStatus(status) {
  return `<span class="xrl-status xrl-status-${status}">${statusLabel(status)}</span>`;
}

function renderRecentNotes(notes) {
  const rows = notes.slice(0, 5);

  if (!rows.length) {
    xrlRecentNotesBody.innerHTML = '<tr><td colspan="5">Sem notas recentes.</td></tr>';
    return;
  }

  xrlRecentNotesBody.innerHTML = rows.map((note) => {
    const status = noteStatus(note);
    return `
      <tr>
        <td>${note.numero || '-'}</td>
        <td>${note.razaoEmitente || '-'}</td>
        <td>${toCurrency(parseCurrency(note.valorTotal))}</td>
        <td>${badgeForStatus(status)}</td>
        <td>${formatDate(note.emissao || note.uploadedAt)}</td>
      </tr>
    `;
  }).join('');
}

function renderNotesTable(notes) {
  if (!notes.length) {
    xrlNotesTableBody.innerHTML = '<tr><td colspan="8">Nenhuma nota encontrada com os filtros aplicados.</td></tr>';
    return;
  }

  xrlNotesTableBody.innerHTML = '';

  notes.forEach((note) => {
    const tr = document.createElement('tr');
    const status = noteStatus(note);
    tr.innerHTML = `
      <td>${badgeForStatus(status)}</td>
      <td>${note.numero || '-'}</td>
      <td>${note.serie || '-'}</td>
      <td>${note.razaoEmitente || '-'}</td>
      <td>${formatCnpj(note.cnpjEmitente || '') || '-'}</td>
      <td>${toCurrency(parseCurrency(note.valorTotal))}</td>
      <td>${formatDate(note.emissao || note.uploadedAt)}</td>
      <td class="actions"></td>
    `;

    const actions = tr.querySelector('.actions');

    const detailsBtn = document.createElement('button');
    detailsBtn.type = 'button';
    detailsBtn.className = 'secondary';
    detailsBtn.textContent = 'Detalhes';
    detailsBtn.addEventListener('click', () => openNoteDetails(note));

    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'secondary';
    downloadBtn.textContent = 'XML';
    downloadBtn.addEventListener('click', async () => {
      try {
        await downloadNote(note.id);
      } catch (error) {
        alert(error.message);
      }
    });

    actions.appendChild(detailsBtn);
    actions.appendChild(downloadBtn);
    xrlNotesTableBody.appendChild(tr);
  });
}

function refreshAll() {
  const filtered = applyAllFilters();
  lastFilteredNotes = filtered;

  renderKpis(filtered);
  renderDailyChart(filtered);
  renderTopSuppliers(filtered);
  renderRecentNotes(filtered);
  renderNotesTable(filtered);
}

async function fetchCompanyNotes(companyId) {
  // Ponto unico para futura troca da origem dos dados (API do Governo para NFe/CTe).
  return request(`/api/notas?companyId=${encodeURIComponent(companyId)}`);
}

async function loadNotesForCompany(companyId) {
  if (!companyId) {
    notesByCompany.set('', []);
    refreshAll();
    return;
  }

  if (!notesByCompany.has(companyId)) {
    const notes = await fetchCompanyNotes(companyId);
    notesByCompany.set(companyId, Array.isArray(notes) ? notes : []);
  }

  refreshAll();
}

async function downloadFilteredNotes() {
  if (!lastFilteredNotes.length) {
    alert('Nao ha notas para download com os filtros atuais.');
    return;
  }

  const maxDownloads = 20;
  const notesToDownload = lastFilteredNotes.filter((note) => note.id).slice(0, maxDownloads);
  if (!notesToDownload.length) {
    alert('Nao ha identificador valido para download de XML.');
    return;
  }

  if (lastFilteredNotes.length > maxDownloads) {
    alert(`Baixando as primeiras ${maxDownloads} notas filtradas para evitar excesso de downloads de uma vez.`);
  }

  for (const note of notesToDownload) {
    // Sequencial para reduzir bloqueios do navegador em multiplos downloads.
    // eslint-disable-next-line no-await-in-loop
    await downloadNote(note.id);
  }
}

async function downloadNote(noteId) {
  const response = await fetch(`/api/notas/${noteId}/download`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || 'Falha ao baixar XML.');
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = `${noteId}.xml`;
  anchor.click();
  URL.revokeObjectURL(blobUrl);
}

function openModal() {
  xrlNoteModal.classList.remove('hidden');
}

function closeModal() {
  xrlNoteModal.classList.add('hidden');
}

function setModalTab(tabName) {
  const tabs = {
    general: xrlTabGeneral,
    products: xrlTabProducts,
    xml: xrlTabXml,
    events: xrlTabEvents,
  };

  Object.entries(tabs).forEach(([name, panel]) => {
    const active = name === tabName;
    panel.hidden = !active;
    panel.classList.toggle('is-active', active);
  });

  xrlNoteTabs.forEach((tabBtn) => {
    tabBtn.classList.toggle('is-active', tabBtn.dataset.noteTab === tabName);
  });
}

function fillGeneralData(note) {
  const entries = [
    ['Emitente', note.razaoEmitente || '-'],
    ['Destinatario', note.razaoDestinatario || '-'],
    ['CFOP', note.cfop || '-'],
    ['Natureza', note.naturezaOperacao || '-'],
    ['Valor', toCurrency(parseCurrency(note.valorTotal))],
    ['Impostos', note.impostosEstimados || 'Em calculo'],
  ];

  xrlGeneralData.innerHTML = entries.map(([label, value]) => `
    <div>
      <dt>${label}</dt>
      <dd>${value}</dd>
    </div>
  `).join('');
}

function fillProducts(note) {
  const products = Array.isArray(note.produtos) && note.produtos.length
    ? note.produtos
    : [{ nome: note.notaName || 'Item principal', quantidade: 1, valor: parseCurrency(note.valorTotal) }];

  xrlProductsBody.innerHTML = products.map((item) => `
    <tr>
      <td>${item.nome || 'Produto'}</td>
      <td>${item.quantidade || 1}</td>
      <td>${toCurrency(parseCurrency(item.valor || item.valorTotal || 0))}</td>
    </tr>
  `).join('');
}

function fillXml(note) {
  const pretty = {
    id: note.id || '-',
    numero: note.numero || '-',
    chave: note.chave || '-',
    emitente: note.razaoEmitente || '-',
    cnpjEmitente: note.cnpjEmitente || '-',
    valorTotal: toCurrency(parseCurrency(note.valorTotal)),
    emissao: formatDateTime(note.emissao || note.uploadedAt),
  };

  xrlXmlViewer.textContent = JSON.stringify(pretty, null, 2);
}

function fillEvents(note) {
  const emission = formatDateTime(note.emissao || note.uploadedAt);
  xrlEventsTimeline.innerHTML = `
    <li>Nota emitida - ${emission}</li>
    <li>Capturada SEFAZ - ${emission}</li>
    <li>XML salvo - ${emission}</li>
    <li>Manifestacao realizada - ${noteStatus(note) === 'manifestacao' ? 'Sim' : 'Pendente'}</li>
    <li>Exportado contador - disponivel para download</li>
  `;
}

function openNoteDetails(note) {
  xrlModalTitle.textContent = `Detalhes da nota ${note.numero || '-'}`;

  fillGeneralData(note);
  fillProducts(note);
  fillXml(note);
  fillEvents(note);

  setModalTab('general');
  openModal();
}

function clearAdvancedFilters() {
  xrlFilterSupplier.value = '';
  xrlFilterCnpj.value = '';
  xrlFilterStatus.value = '';
  xrlFilterType.value = '';
  xrlFilterOperation.value = '';
  xrlFilterValueMin.value = '';
  xrlFilterValueMax.value = '';
  xrlFilterKey.value = '';
  refreshAll();
}

async function bootstrap() {
  if (!authToken) {
    forceLogin();
    return;
  }

  try {
    await request('/api/auth/me');
    const me = await request('/api/empresas/me');
    companies = Array.isArray(me.companies) ? me.companies : [];

    buildCompanySelect(companies);
    await loadNotesForCompany(selectedCompanyId);
  } catch {
    forceLogin();
  }
}

xrlSidebarToggle.addEventListener('click', () => {
  const expanded = xrlSidebarToggle.getAttribute('aria-expanded') === 'true';
  setSidebarExpanded(!expanded);
});

xrlMenuItems.forEach((item) => {
  item.addEventListener('click', () => {
    setActiveView(item.dataset.xrlView || 'dashboardView');
  });
});

xrlCompanySelect.addEventListener('change', async () => {
  selectedCompanyId = xrlCompanySelect.value;
  await loadNotesForCompany(selectedCompanyId);
});

xrlPeriodPreset.addEventListener('change', () => {
  const custom = xrlPeriodPreset.value === 'custom';
  xrlCustomRange.classList.toggle('hidden', !custom);
  refreshAll();
});

xrlGlobalSearch.addEventListener('input', refreshAll);
xrlFromDate.addEventListener('change', refreshAll);
xrlToDate.addEventListener('change', refreshAll);

xrlApplyAdvancedFilters.addEventListener('click', () => {
  refreshAll();
  setActiveView('notesView');
});

xrlClearAdvancedFilters.addEventListener('click', clearAdvancedFilters);

xrlImportXmlBtn.addEventListener('click', () => {
  alert('Fluxo de importacao XML em evolucao.');
});

xrlDownloadNotesBtn.addEventListener('click', async () => {
  try {
    await downloadFilteredNotes();
  } catch (error) {
    alert(error.message || 'Falha ao baixar XML.');
  }
});

xrlExportBtn.addEventListener('click', () => {
  alert('Exportacao em evolucao.');
});

xrlManifestBtn.addEventListener('click', () => {
  alert('Manifestacao em evolucao.');
});

xrlNoteTabs.forEach((tabBtn) => {
  tabBtn.addEventListener('click', () => {
    setModalTab(tabBtn.dataset.noteTab || 'general');
  });
});

xrlCloseModalTop.addEventListener('click', closeModal);
xrlCloseModalBottom.addEventListener('click', closeModal);
xrlNoteModal.addEventListener('click', (event) => {
  if (event.target === xrlNoteModal) closeModal();
});

window.addEventListener('resize', () => {
  setSidebarExpanded(false);
});

setSidebarExpanded(false);
setActiveView(activeViewId);
bootstrap();
