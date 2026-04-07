const TOKEN_KEY = 'emil_notas_token';

const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const companyCodeInput = document.getElementById('companyCode');
const usernameInput = document.getElementById('username');
const companyPasswordInput = document.getElementById('companyPassword');

let authToken = localStorage.getItem(TOKEN_KEY) || '';
const pageUrl = new URL(window.location.href);
const forceLogin = pageUrl.searchParams.get('forceLogin') === '1';
const isAccessPage = window.location.pathname.includes('/acesso');

if (forceLogin) {
  authToken = '';
  localStorage.removeItem(TOKEN_KEY);
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
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || 'Falha na requisicao');
  }

  if (response.status === 204) return null;
  return response.json();
}

async function bootstrapSession() {
  if (isAccessPage) return;
  if (forceLogin) return;
  if (!authToken) return;

  try {
    await request('/api/auth/me');
    window.location.href = '/dashboard';
  } catch {
    authToken = '';
    localStorage.removeItem(TOKEN_KEY);
  }
}

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!companyCodeInput || !usernameInput || !companyPasswordInput) {
      loginMessage.textContent = 'Tela de login desatualizada no navegador. Pressione Ctrl+F5.';
      return;
    }

    loginMessage.textContent = 'Entrando...';

    try {
      const data = await request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyCode: companyCodeInput.value.trim(),
          username: usernameInput.value.trim(),
          password: companyPasswordInput.value,
        }),
      });

      authToken = data.token;
      localStorage.setItem(TOKEN_KEY, authToken);
      window.location.href = '/dashboard';
    } catch (error) {
      loginMessage.textContent = error.message;
    }
  });
}

bootstrapSession();
