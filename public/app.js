const loginSection = document.getElementById('loginSection');
const landingSection = document.getElementById('landingSection');
const appSection = document.getElementById('appSection');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const companyCodeInput = document.getElementById('companyCode');
const companyPasswordInput = document.getElementById('companyPassword');
const openLoginBtn = document.getElementById('openLoginBtn');
const bannerEnterBtn = document.getElementById('bannerEnterBtn');
const closeLoginBtn = document.getElementById('closeLoginBtn');
const sessionInfo = document.getElementById('sessionInfo');
const companyName = document.getElementById('companyName');
const logoutBtn = document.getElementById('logoutBtn');

const uploadForm = document.getElementById('uploadForm');
const xmlInput = document.getElementById('xmlInput');
const uploadMessage = document.getElementById('uploadMessage');
const notasBody = document.getElementById('notasBody');
const filterForm = document.getElementById('filterForm');
const filtroChave = document.getElementById('filtroChave');
const filtroNumero = document.getElementById('filtroNumero');
const filtroCnpj = document.getElementById('filtroCnpj');
const limparFiltros = document.getElementById('limparFiltros');
const atualizarBtn = document.getElementById('atualizar');

const TOKEN_KEY = 'emil_notas_token';
let authToken = localStorage.getItem(TOKEN_KEY) || '';
let activeFilters = {};

function setAuthenticated(company) {
  landingSection.classList.add('hidden');
  loginSection.classList.add('hidden');
  appSection.classList.remove('hidden');
  sessionInfo.classList.remove('hidden');
  openLoginBtn.classList.add('hidden');
  companyName.textContent = company.name;
}

function setLoggedOut() {
  authToken = '';
  localStorage.removeItem(TOKEN_KEY);
  landingSection.classList.remove('hidden');
  loginSection.classList.add('hidden');
  appSection.classList.add('hidden');
  sessionInfo.classList.add('hidden');
  openLoginBtn.classList.remove('hidden');
  companyName.textContent = '';
  notasBody.innerHTML = '';
}

function openLogin() {
  loginMessage.textContent = '';
  loginSection.classList.remove('hidden');
  companyCodeInput.focus();
}

function closeLogin() {
  loginSection.classList.add('hidden');
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return Number.isNaN(date.getTime()) ? dateStr : date.toLocaleString('pt-BR');
}

function getAuthHeaders(extraHeaders = {}) {
  if (!authToken) return extraHeaders;
  return {
    ...extraHeaders,
    Authorization: `Bearer ${authToken}`,
  };
}

async function request(url, options = {}) {
  const headers = getAuthHeaders(options.headers || {});
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      setLoggedOut();
      throw new Error('Sessao expirada. Faca login novamente.');
    }

    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || 'Falha na requisicao');
  }

  if (response.status === 204) return null;
  return response.json();
}

function makeQuery(filters) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const queryText = query.toString();
  return queryText ? `?${queryText}` : '';
}

async function downloadNote(note) {
  const response = await fetch(`/api/notas/${note.id}/download`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || 'Falha no download');
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = note.fileName || `${note.id}.xml`;
  anchor.click();
  URL.revokeObjectURL(blobUrl);
}

function buildRow(note) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${note.numero || '-'}</td>
    <td>${note.serie || '-'}</td>
    <td>${note.cnpjEmitente || '-'}</td>
    <td>${note.razaoEmitente || '-'}</td>
    <td>${note.valorTotal || '-'}</td>
    <td>${formatDate(note.uploadedAt)}</td>
    <td class="actions"></td>
  `;

  const actionsCell = tr.querySelector('.actions');
  const downloadBtn = document.createElement('button');
  downloadBtn.textContent = 'Download';
  downloadBtn.addEventListener('click', async () => {
    try {
      await downloadNote(note);
    } catch (error) {
      alert(error.message);
    }
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = 'Excluir';
  deleteBtn.className = 'delete';
  deleteBtn.addEventListener('click', async () => {
    const confirmDelete = window.confirm('Deseja remover esta nota?');
    if (!confirmDelete) return;

    try {
      await request(`/api/notas/${note.id}`, { method: 'DELETE' });
      await loadNotes();
    } catch (error) {
      alert(error.message);
    }
  });

  actionsCell.append(downloadBtn, deleteBtn);
  return tr;
}

async function loadNotes() {
  notasBody.innerHTML = '<tr><td colspan="7">Carregando...</td></tr>';

  try {
    const notes = await request(`/api/notas${makeQuery(activeFilters)}`);
    if (!notes.length) {
      notasBody.innerHTML = '<tr><td colspan="7">Nenhuma nota encontrada.</td></tr>';
      return;
    }

    notasBody.innerHTML = '';
    notes.forEach((note) => notasBody.appendChild(buildRow(note)));
  } catch (error) {
    notasBody.innerHTML = `<tr><td colspan="7">${error.message}</td></tr>`;
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginMessage.textContent = 'Entrando...';

  try {
    const payload = {
      companyCode: companyCodeInput.value.trim(),
      password: companyPasswordInput.value,
    };

    const data = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    authToken = data.token;
    localStorage.setItem(TOKEN_KEY, authToken);
    setAuthenticated(data.company);
    loginMessage.textContent = '';
    companyPasswordInput.value = '';
    await loadNotes();
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } catch {
    // Logout should always clear local session.
  }
  setLoggedOut();
});

openLoginBtn.addEventListener('click', openLogin);
bannerEnterBtn.addEventListener('click', openLogin);
closeLoginBtn.addEventListener('click', closeLogin);

uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!xmlInput.files.length) {
    uploadMessage.textContent = 'Selecione um arquivo XML.';
    return;
  }

  uploadMessage.textContent = 'Enviando...';
  const formData = new FormData();
  formData.append('xml', xmlInput.files[0]);

  try {
    await request('/api/notas', { method: 'POST', body: formData });
    uploadMessage.textContent = 'XML enviado com sucesso.';
    xmlInput.value = '';
    await loadNotes();
  } catch (error) {
    uploadMessage.textContent = error.message;
  }
});

filterForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  activeFilters = {
    chave: filtroChave.value.trim(),
    numero: filtroNumero.value.trim(),
    cnpjEmitente: filtroCnpj.value.trim(),
  };
  await loadNotes();
});

limparFiltros.addEventListener('click', async () => {
  filtroChave.value = '';
  filtroNumero.value = '';
  filtroCnpj.value = '';
  activeFilters = {};
  await loadNotes();
});

atualizarBtn.addEventListener('click', loadNotes);

async function bootstrapSession() {
  if (!authToken) {
    setLoggedOut();
    return;
  }

  try {
    const data = await request('/api/auth/me');
    setAuthenticated(data.company);
    await loadNotes();
  } catch {
    setLoggedOut();
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-blocking: app should continue even without service worker.
    });
  });
}

bootstrapSession();
