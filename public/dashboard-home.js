const TOKEN_KEY = 'emil_notas_token';

function redirectToLogin() {
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = '/login';
}

async function validateSession() {
  const token = localStorage.getItem(TOKEN_KEY) || '';
  if (!token) {
    redirectToLogin();
    return;
  }

  try {
    const response = await fetch('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      redirectToLogin();
    }
  } catch {
    redirectToLogin();
  }
}

validateSession();
