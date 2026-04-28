// navbar.js — lógica compartilhada da navbar pós-login
// Espera que o HTML já tenha a marcação .navbar + data-nav-user, data-nav-logout

(function initNavbar() {
  const TOKEN_KEY = 'emil_notas_token';

  // ── Dropdown toggle ──────────────────────────────────────────────────────
  document.querySelectorAll('.nav-item[data-dropdown]').forEach((item) => {
    const trigger = item.querySelector('.nav-link');
    if (!trigger) return;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = item.classList.contains('open');
      // fecha todos
      document.querySelectorAll('.nav-item.open').forEach((el) => el.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });

  // fecha ao clicar fora
  document.addEventListener('click', () => {
    document.querySelectorAll('.nav-item.open').forEach((el) => el.classList.remove('open'));
  });

  // ── Menu hamburguer (mobile) ─────────────────────────────────────────────
  const toggle = document.getElementById('navbarToggle');
  const menu = document.getElementById('navbarMenu');
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      menu.classList.toggle('open');
    });
  }

  // ── Preenche nome do usuário ─────────────────────────────────────────────
  const userLabel = document.getElementById('navUserLabel');
  if (userLabel) {
    const token = localStorage.getItem(TOKEN_KEY) || '';
    if (token) {
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data && data.user) {
            const name = data.user.name || data.user.email || 'Usuário';
            userLabel.textContent = `Olá, ${name.split(' ')[0]}!`;
          }
        })
        .catch(() => {});
    }
  }

  // ── Logout ───────────────────────────────────────────────────────────────
  document.querySelectorAll('[data-nav-logout]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const token = localStorage.getItem(TOKEN_KEY) || '';
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // ignora erros de rede
      }
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = '/login';
    });
  });
})();
