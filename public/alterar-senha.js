const TOKEN_KEY = 'emil_notas_token';
const form = document.getElementById('alterarSenhaForm');
const msg = document.getElementById('alterarSenhaMsg');

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const senhaAtual = document.getElementById('senhaAtual').value;
  const novaSenha = document.getElementById('novaSenha').value;
  const confirmar = document.getElementById('confirmarNovaSenha').value;

  if (novaSenha !== confirmar) {
    msg.style.color = 'var(--danger)';
    msg.textContent = 'A nova senha e a confirmação não coincidem.';
    return;
  }

  msg.style.color = 'var(--muted)';
  msg.textContent = 'Salvando...';

  try {
    const response = await fetch('/api/auth/alterar-senha', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ senhaAtual, novaSenha }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao alterar senha.');

    msg.style.color = '#2e9e6a';
    msg.textContent = 'Senha alterada com sucesso!';
    form.reset();
  } catch (error) {
    msg.style.color = 'var(--danger)';
    msg.textContent = error.message;
  }
});
