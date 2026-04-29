const PACKAGE_OPTIONS = {
  essencial: {
    label: 'Essencial',
    companyLimit: 1,
  },
  profissional: {
    label: 'Profissional',
    companyLimit: 5,
  },
  corporativo: {
    label: 'Corporativo',
    companyLimit: null,
  },
};

const form = document.getElementById('cadastroForm');
const steps = document.querySelectorAll('.wizard-step');
const stepIndicators = document.querySelectorAll('.step');
const stepLines = document.querySelectorAll('.step-line');

const btnVoltar = document.getElementById('btnVoltar');
const btnProximo = document.getElementById('btnProximo');
const btnConcluir = document.getElementById('btnConcluir');
const btnEnviarCodigo = document.getElementById('btnEnviarCodigo');

const selectedPackageLabel = document.getElementById('selectedPackageLabel');
const selectedPackageHint = document.getElementById('selectedPackageHint');

const emailCodeHint = document.getElementById('emailCodeHint');
const message = document.getElementById('cadastroMessage');

let currentStep = 0;
let emailVerificationCodeSent = false;
let emailVerified = false;

function getPackageConfig() {
  const packageId = form.elements.packageId.value || 'essencial';
  return {
    id: packageId,
    ...PACKAGE_OPTIONS[packageId],
  };
}

function showStep(index) {
  steps.forEach((step, stepIndex) => {
    step.classList.toggle('hidden', stepIndex !== index);
  });

  stepIndicators.forEach((indicator, indicatorIndex) => {
    indicator.classList.toggle('active', indicatorIndex <= index);
    indicator.classList.toggle('done', indicatorIndex < index);
  });

  stepLines.forEach((line, lineIndex) => {
    line.classList.toggle('active', lineIndex < index);
  });

  btnVoltar.disabled = index === 0;
  btnProximo.classList.toggle('hidden', index === steps.length - 1);
  btnConcluir.classList.toggle('hidden', index !== steps.length - 1);
}

function formatCpf(value) {
  let digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length > 9) digits = digits.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
  else if (digits.length > 6) digits = digits.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
  else if (digits.length > 3) digits = digits.replace(/(\d{3})(\d{1,3})/, '$1.$2');
  return digits;
}

function validatePasswords() {
  const senha = document.getElementById('senha');
  const confirmar = document.getElementById('confirmarSenha');

  if (senha.value !== confirmar.value) {
    confirmar.setCustomValidity('As senhas nao coincidem.');
    confirmar.reportValidity();
    confirmar.setCustomValidity('');
    return false;
  }

  return true;
}

function validateEmailVerification() {
  const codeInput = document.getElementById('emailCode');

  if (!emailVerificationCodeSent) {
    codeInput.setCustomValidity('Solicite o codigo de verificacao antes de continuar.');
    codeInput.reportValidity();
    codeInput.setCustomValidity('');
    return false;
  }

  if (!emailVerified) {
    codeInput.setCustomValidity('Valide o codigo de e-mail antes de continuar.');
    codeInput.reportValidity();
    codeInput.setCustomValidity('');
    return false;
  }

  return true;
}

async function verifyEmailCodeWithServer() {
  const email = document.getElementById('email').value.trim();
  const code = document.getElementById('emailCode').value.trim();

  if (!code) {
    emailCodeHint.textContent = 'Informe o codigo recebido por e-mail.';
    emailCodeHint.classList.remove('success');
    return false;
  }

  try {
    const response = await fetch('/api/cadastro/email/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Codigo invalido.');
    }

    emailVerified = true;
    emailCodeHint.textContent = data.message || 'E-mail verificado com sucesso.';
    emailCodeHint.classList.add('success');
    return true;
  } catch (error) {
    emailVerified = false;
    emailCodeHint.textContent = error.message;
    emailCodeHint.classList.remove('success');
    return false;
  }
}

function validateStep0() {
  const requiredFields = [
    document.getElementById('nomeUsuario'),
    document.getElementById('cpf'),
    document.getElementById('email'),
    document.getElementById('emailCode'),
    document.getElementById('senha'),
    document.getElementById('confirmarSenha'),
  ];

  for (const field of requiredFields) {
    if (!field.reportValidity()) return false;
  }

  return validatePasswords() && validateEmailVerification();
}

function validateCurrentStep() {
  if (currentStep === 0) return validateStep0();
  if (currentStep === 1) return Boolean(form.elements.packageId.value);
  return true;
}

function updatePackageSummary() {
  const selectedPackage = getPackageConfig();
  selectedPackageLabel.textContent = selectedPackage.label;
  selectedPackageHint.textContent = Number.isFinite(selectedPackage.companyLimit)
    ? `Gerencie ate ${selectedPackage.companyLimit} empresa(s) apos o cadastro.`
    : 'Gerencie empresas ilimitadas apos o cadastro.';

  document.querySelectorAll('.package-card').forEach((card) => {
    const input = card.querySelector('input[name="packageId"]');
    card.classList.toggle('active', Boolean(input && input.checked));
  });
}

btnProximo.addEventListener('click', async () => {
  message.textContent = '';

  if (currentStep === 0 && !emailVerified) {
    const checked = await verifyEmailCodeWithServer();
    if (!checked) return;
  }

  if (!validateCurrentStep()) return;

  if (currentStep < steps.length - 1) {
    currentStep += 1;
    showStep(currentStep);
  }
});

btnVoltar.addEventListener('click', () => {
  message.textContent = '';
  if (currentStep > 0) {
    currentStep -= 1;
    showStep(currentStep);
  }
});

btnEnviarCodigo.addEventListener('click', async () => {
  const emailInput = document.getElementById('email');
  if (!emailInput.reportValidity()) return;

  btnEnviarCodigo.disabled = true;
  btnEnviarCodigo.textContent = 'Enviando...';
  emailCodeHint.classList.remove('success');

  try {
    const response = await fetch('/api/cadastro/email/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailInput.value.trim() }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Falha ao enviar codigo de verificacao.');
    }

    emailVerificationCodeSent = true;
    emailVerified = false;
    emailCodeHint.textContent = data.message || 'Codigo enviado. Verifique sua caixa de entrada.';
    if (data.previewUrl) {
      emailCodeHint.textContent += ` Preview: ${data.previewUrl}`;
    }
    if (data.devCode) {
      emailCodeHint.textContent += ` Codigo: ${data.devCode}`;
    }
  } catch (error) {
    emailVerificationCodeSent = false;
    emailVerified = false;
    emailCodeHint.textContent = error.message;
  } finally {
    btnEnviarCodigo.disabled = false;
    btnEnviarCodigo.textContent = 'Enviar código';
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';

  if (!validateCurrentStep()) return;

  btnConcluir.disabled = true;
  btnConcluir.textContent = 'Concluindo...';

  try {
    const payload = {
      packageId: getPackageConfig().id,
      nomeUsuario: document.getElementById('nomeUsuario').value.trim(),
      cpf: document.getElementById('cpf').value.trim(),
      email: document.getElementById('email').value.trim(),
      emailCode: document.getElementById('emailCode').value.trim(),
      senha: document.getElementById('senha').value,
    };

    const response = await fetch('/api/cadastro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Erro ao concluir cadastro.');
    }

    message.style.color = '#2e9e6a';
    message.textContent = `${data.message || 'Cadastro realizado com sucesso!'} Redirecionando...`;
    setTimeout(() => {
      window.location.href = '/acesso?forceLogin=1';
    }, 2500);
  } catch (error) {
    message.style.color = 'var(--danger)';
    message.textContent = error.message;
    btnConcluir.disabled = false;
    btnConcluir.textContent = 'Concluir cadastro';
  }
});

Array.from(form.elements.packageId).forEach((input) => {
  input.addEventListener('change', updatePackageSummary);
});

document.getElementById('email').addEventListener('input', () => {
  emailVerificationCodeSent = false;
  emailVerified = false;
  emailCodeHint.textContent = 'Solicite o codigo para validar o e-mail antes de prosseguir.';
  emailCodeHint.classList.remove('success');
});

document.getElementById('cpf').addEventListener('input', (event) => {
  event.target.value = formatCpf(event.target.value);
});

showStep(0);
updatePackageSummary();
