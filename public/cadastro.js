const PACKAGE_OPTIONS = {
  basico: {
    label: 'Basico',
    monthlyPrice: 1500,
    nfeLimitMonthly: 500,
    overagePricePerNote: 3,
    salesPitch: 'Ideal para empresas que estao estruturando a rotina fiscal com seguranca e previsibilidade.',
  },
  profissional: {
    label: 'Profissional',
    monthlyPrice: 2500,
    nfeLimitMonthly: 1000,
    overagePricePerNote: 2.5,
    salesPitch: 'Perfeito para operacoes em crescimento que precisam de escala com melhor custo por nota.',
  },
  standard: {
    label: 'Standard',
    monthlyPrice: 4000,
    nfeLimitMonthly: 2000,
    overagePricePerNote: 2,
    salesPitch: 'Pensado para alto volume, com performance comercial forte e melhor custo unitario.',
  },
  premium5000: {
    label: 'Premium 5000',
    monthlyPrice: 7500,
    nfeLimitMonthly: 5000,
    overagePricePerNote: 1.5,
    salesPitch: 'Plano para operacoes intensivas, com limite alto e custo por nota ainda mais competitivo.',
  },
  particular: {
    label: 'Particular',
    monthlyPrice: null,
    nfeLimitMonthly: null,
    overagePricePerNote: null,
    requiresContact: true,
    salesPitch: 'Necessidades especificas? Montamos um plano sob medida para seu volume e sua operacao.',
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
const btnPackagePrev = document.getElementById('btnPackagePrev');
const btnPackageNext = document.getElementById('btnPackageNext');

const selectedPackageLabel = document.getElementById('selectedPackageLabel');
const selectedPackageHint = document.getElementById('selectedPackageHint');
const packageGrid = document.getElementById('packageGrid');

const paymentSelectedPlan = document.getElementById('paymentSelectedPlan');
const paymentSelectedPlanHint = document.getElementById('paymentSelectedPlanHint');
const paymentOutlineHint = document.getElementById('paymentOutlineHint');
const paymentStatusLine = document.getElementById('paymentStatusLine');
const paymentConfirmMock = document.getElementById('paymentConfirmMock');
const paymentConfirmLine = document.querySelector('.payment-confirm-line');
const paymentPreapprovalDocLink = document.getElementById('paymentPreapprovalDocLink');
const paymentBricksDocLink = document.getElementById('paymentBricksDocLink');
const btnStartPayment = document.getElementById('btnStartPayment');

const emailCodeHint = document.getElementById('emailCodeHint');
const message = document.getElementById('cadastroMessage');

const SIGNUP_DRAFT_KEY = 'emil_signup_draft';
const SIGNUP_PAYMENT_KEY = 'emil_signup_payment';

let currentStep = 0;
let emailVerificationCodeSent = false;
let emailVerified = false;
let cachedPaymentOutlinePackageId = '';
let cachedPaymentOutlineData = null;
let paymentState = {
  status: '',
  paymentId: '',
  externalReference: '',
  preferenceId: '',
};

function getPackageConfig() {
  const packageId = form.elements.packageId.value || 'basico';
  return {
    id: packageId,
    ...PACKAGE_OPTIONS[packageId],
  };
}

function resetPackageGridPosition() {
  if (!packageGrid) return;
  packageGrid.scrollLeft = 0;
  requestAnimationFrame(() => {
    packageGrid.scrollLeft = 0;
    updatePackageCarouselNavState();
  });
}

function updatePackageCarouselNavState() {
  if (!packageGrid) return;

  const maxScrollLeft = Math.max(0, packageGrid.scrollWidth - packageGrid.clientWidth);
  const atStart = packageGrid.scrollLeft <= 2;
  const atEnd = packageGrid.scrollLeft >= maxScrollLeft - 2;

  if (btnPackagePrev) {
    btnPackagePrev.classList.toggle('is-hidden', atStart);
  }

  if (btnPackageNext) {
    btnPackageNext.classList.toggle('is-hidden', atEnd);
  }
}

function scrollPackageGrid(direction) {
  if (!packageGrid) return;

  const card = packageGrid.querySelector('.package-card');
  const cardWidth = card ? card.getBoundingClientRect().width : packageGrid.clientWidth / 3;
  packageGrid.scrollBy({ left: (cardWidth + 16) * direction, behavior: 'smooth' });
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

  if (index === 1 && packageGrid) {
    resetPackageGridPosition();
  }

  if (index === 2) {
    loadPaymentOutline();
  }
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Sob consulta';
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function isAutomaticCheckoutPackage(selectedPackage = getPackageConfig()) {
  return !selectedPackage.requiresContact && Number.isFinite(selectedPackage.monthlyPrice);
}

function isPaymentApproved() {
  return String(paymentState.status || '').toLowerCase() === 'approved';
}

function persistPaymentState() {
  localStorage.setItem(SIGNUP_PAYMENT_KEY, JSON.stringify(paymentState));
}

function saveSignupDraft() {
  const draft = {
    nomeUsuario: document.getElementById('nomeUsuario').value.trim(),
    cpf: document.getElementById('cpf').value.trim(),
    email: document.getElementById('email').value.trim(),
    emailCode: document.getElementById('emailCode').value.trim(),
    senha: document.getElementById('senha').value,
    confirmarSenha: document.getElementById('confirmarSenha').value,
    packageId: getPackageConfig().id,
    emailVerificationCodeSent,
    emailVerified,
  };
  localStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(draft));
}

function restoreSignupDraft() {
  const raw = localStorage.getItem(SIGNUP_DRAFT_KEY);
  if (!raw) return;

  try {
    const draft = JSON.parse(raw);
    if (draft.nomeUsuario) document.getElementById('nomeUsuario').value = draft.nomeUsuario;
    if (draft.cpf) document.getElementById('cpf').value = draft.cpf;
    if (draft.email) document.getElementById('email').value = draft.email;
    if (draft.emailCode) document.getElementById('emailCode').value = draft.emailCode;
    if (draft.senha) document.getElementById('senha').value = draft.senha;
    if (draft.confirmarSenha) document.getElementById('confirmarSenha').value = draft.confirmarSenha;
    if (draft.packageId && form.elements.packageId) {
      const packageInput = form.querySelector(`input[name="packageId"][value="${draft.packageId}"]`);
      if (packageInput) packageInput.checked = true;
    }
    emailVerificationCodeSent = Boolean(draft.emailVerificationCodeSent);
    emailVerified = Boolean(draft.emailVerified);
  } catch (error) {
    localStorage.removeItem(SIGNUP_DRAFT_KEY);
  }
}

function restorePaymentState() {
  const raw = localStorage.getItem(SIGNUP_PAYMENT_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    paymentState = {
      status: String(parsed.status || ''),
      paymentId: String(parsed.paymentId || ''),
      externalReference: String(parsed.externalReference || ''),
      preferenceId: String(parsed.preferenceId || ''),
    };
  } catch (error) {
    localStorage.removeItem(SIGNUP_PAYMENT_KEY);
  }
}

function resetPaymentState() {
  paymentState = {
    status: '',
    paymentId: '',
    externalReference: '',
    preferenceId: '',
  };
  localStorage.removeItem(SIGNUP_PAYMENT_KEY);
  updatePaymentStatusUI();
}

function updatePaymentStatusUI() {
  const selectedPackage = getPackageConfig();

  if (paymentConfirmLine) {
    paymentConfirmLine.classList.toggle('hidden', isAutomaticCheckoutPackage(selectedPackage));
  }

  if (btnStartPayment) {
    btnStartPayment.classList.toggle('hidden', !isAutomaticCheckoutPackage(selectedPackage));
  }

  if (!paymentStatusLine) return;

  if (!isAutomaticCheckoutPackage(selectedPackage)) {
    paymentStatusLine.textContent = 'Plano sob consulta: siga com o cadastro e o pagamento sera tratado comercialmente.';
    paymentStatusLine.classList.remove('success');
    return;
  }

  const status = String(paymentState.status || '').toLowerCase();
  if (status === 'approved') {
    paymentStatusLine.textContent = 'Pagamento aprovado no Mercado Pago. Agora voce ja pode concluir o cadastro.';
    paymentStatusLine.classList.add('success');
    return;
  }

  if (status === 'pending' || status === 'in_process') {
    paymentStatusLine.textContent = 'Pagamento ainda pendente. Aguarde a confirmacao ou tente novamente.';
    paymentStatusLine.classList.remove('success');
    return;
  }

  if (status) {
    paymentStatusLine.textContent = `Pagamento com status ${status}. Se necessario, gere um novo checkout.`;
    paymentStatusLine.classList.remove('success');
    return;
  }

  paymentStatusLine.textContent = 'Pagamento ainda nao iniciado.';
  paymentStatusLine.classList.remove('success');
}

function parsePaymentReturnParams() {
  const url = new URL(window.location.href);
  const paymentId = String(url.searchParams.get('payment_id') || url.searchParams.get('collection_id') || '').trim();
  const externalReference = String(url.searchParams.get('external_reference') || '').trim();
  const rawStatus = String(
    url.searchParams.get('collection_status')
    || url.searchParams.get('status')
    || url.searchParams.get('payment')
    || ''
  ).trim().toLowerCase();

  if (!rawStatus && !paymentId && !externalReference) return;

  const normalizedStatus = rawStatus === 'success' ? 'approved' : rawStatus;
  paymentState = {
    ...paymentState,
    status: normalizedStatus,
    paymentId,
    externalReference,
  };
  persistPaymentState();
  updatePaymentStatusUI();

  url.searchParams.delete('collection_id');
  url.searchParams.delete('collection_status');
  url.searchParams.delete('payment_id');
  url.searchParams.delete('status');
  url.searchParams.delete('external_reference');
  url.searchParams.delete('merchant_order_id');
  url.searchParams.delete('preference_id');
  url.searchParams.delete('site_id');
  url.searchParams.delete('processing_mode');
  url.searchParams.delete('merchant_account_id');
  url.searchParams.delete('payment');
  window.history.replaceState({}, document.title, url.pathname + url.search);
}

function updatePaymentSummary() {
  const selectedPackage = getPackageConfig();
  if (!paymentSelectedPlan || !paymentSelectedPlanHint) return;

  paymentSelectedPlan.textContent = selectedPackage.label;

  const priceText = Number.isFinite(selectedPackage.monthlyPrice)
    ? `${formatMoney(selectedPackage.monthlyPrice)}/mes`
    : 'valor sob medida';

  const limitText = Number.isFinite(selectedPackage.nfeLimitMonthly)
    ? `ate ${selectedPackage.nfeLimitMonthly} NFe/mes`
    : 'limite sob medida';

  paymentSelectedPlanHint.textContent = `Plano ${selectedPackage.label}: ${priceText}, ${limitText}.`;

  if (paymentConfirmLine) {
    paymentConfirmLine.classList.toggle('hidden', isAutomaticCheckoutPackage(selectedPackage));
  }

  if (paymentConfirmMock) {
    paymentConfirmMock.checked = false;
  }

  updatePaymentStatusUI();
}

function applyPaymentOutline(data) {
  if (!paymentOutlineHint) return;

  const preapprovalDocUrl = String(data && data.preapprovalDocUrl ? data.preapprovalDocUrl : '').trim();
  const bricksDocUrl = String(data && data.bricksDocUrl ? data.bricksDocUrl : '').trim();
  const preapprovalRedirectUrl = String(data && data.preapprovalRedirectUrl ? data.preapprovalRedirectUrl : '').trim();
  const bricksRedirectUrl = String(data && data.bricksRedirectUrl ? data.bricksRedirectUrl : '').trim();

  if (paymentPreapprovalDocLink && preapprovalDocUrl) {
    paymentPreapprovalDocLink.href = preapprovalDocUrl;
  }

  if (paymentBricksDocLink && bricksDocUrl) {
    paymentBricksDocLink.href = bricksDocUrl;
  }

  if (data && data.checkoutReady) {
    paymentOutlineHint.textContent = 'Checkout do Mercado Pago pronto para teste no sandbox.';
    paymentOutlineHint.classList.add('success');
    return;
  }

  if (preapprovalRedirectUrl || bricksRedirectUrl) {
    paymentOutlineHint.textContent = 'Ha links auxiliares de redirecionamento configurados, mas o checkout do cadastro sera criado via API.';
    paymentOutlineHint.classList.add('success');
    return;
  }

  paymentOutlineHint.textContent = 'Credenciais do Mercado Pago ainda nao foram configuradas no ambiente.';
  paymentOutlineHint.classList.remove('success');
}

async function loadPaymentOutline() {
  const selectedPackage = getPackageConfig();
  updatePaymentSummary();

  if (
    cachedPaymentOutlineData
    && cachedPaymentOutlinePackageId === selectedPackage.id
  ) {
    applyPaymentOutline(cachedPaymentOutlineData);
    return;
  }

  if (paymentOutlineHint) {
    paymentOutlineHint.textContent = 'Carregando configuracao de pagamento...';
    paymentOutlineHint.classList.remove('success');
  }

  try {
    const response = await fetch(`/api/cadastro/payment-outline?packageId=${encodeURIComponent(selectedPackage.id)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Falha ao carregar configuracao de pagamento.');
    }

    cachedPaymentOutlinePackageId = selectedPackage.id;
    cachedPaymentOutlineData = data;
    applyPaymentOutline(data);
  } catch (error) {
    if (paymentOutlineHint) {
      paymentOutlineHint.textContent = error.message;
      paymentOutlineHint.classList.remove('success');
    }
  }
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
  if (currentStep === 2) {
    const selectedPackage = getPackageConfig();

    if (isAutomaticCheckoutPackage(selectedPackage)) {
      if (!isPaymentApproved()) {
        if (paymentOutlineHint) {
          paymentOutlineHint.textContent = 'Antes de concluir, abra o checkout do Mercado Pago e finalize um pagamento aprovado.';
          paymentOutlineHint.classList.remove('success');
        }
        return false;
      }
      return true;
    }

    if (paymentConfirmMock && !paymentConfirmMock.checked) {
      paymentConfirmMock.setCustomValidity('Confirme que este plano sera tratado comercialmente para concluir o cadastro.');
      paymentConfirmMock.reportValidity();
      paymentConfirmMock.setCustomValidity('');
      return false;
    }
  }
  return true;
}

function updatePackageSummary() {
  const selectedPackage = getPackageConfig();
  selectedPackageLabel.textContent = selectedPackage.label;

  const limitText = Number.isFinite(selectedPackage.nfeLimitMonthly)
    ? `ate ${selectedPackage.nfeLimitMonthly} NFe/mes`
    : 'limite sob medida';

  const priceText = Number.isFinite(selectedPackage.monthlyPrice)
    ? `R$ ${selectedPackage.monthlyPrice.toFixed(2).replace('.', ',')} por mes`
    : 'valor sob consulta';

  selectedPackageHint.textContent = `Empresas ilimitadas + ${limitText} · ${priceText}. ${selectedPackage.salesPitch}`;
  updatePaymentSummary();

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
      paymentSketchAccepted: Boolean(paymentConfirmMock && paymentConfirmMock.checked),
      paymentId: paymentState.paymentId,
      paymentExternalReference: paymentState.externalReference,
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
    localStorage.removeItem(SIGNUP_DRAFT_KEY);
    localStorage.removeItem(SIGNUP_PAYMENT_KEY);
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
  input.addEventListener('change', () => {
    resetPaymentState();
    updatePackageSummary();
    saveSignupDraft();
  });
});

if (btnPackagePrev) {
  btnPackagePrev.addEventListener('click', () => scrollPackageGrid(-1));
}

if (btnPackageNext) {
  btnPackageNext.addEventListener('click', () => scrollPackageGrid(1));
}

if (packageGrid) {
  packageGrid.addEventListener('scroll', updatePackageCarouselNavState, { passive: true });
  window.addEventListener('resize', updatePackageCarouselNavState);
}

if (btnStartPayment) {
  btnStartPayment.addEventListener('click', async () => {
    message.textContent = '';

    if (!validateStep0()) return;

    const selectedPackage = getPackageConfig();
    if (!isAutomaticCheckoutPackage(selectedPackage)) {
      updatePaymentStatusUI();
      return;
    }

    btnStartPayment.disabled = true;
    btnStartPayment.textContent = 'Gerando checkout...';

    try {
      saveSignupDraft();

      const payload = {
        packageId: selectedPackage.id,
        nomeUsuario: document.getElementById('nomeUsuario').value.trim(),
        cpf: document.getElementById('cpf').value.trim(),
        email: document.getElementById('email').value.trim(),
      };

      const response = await fetch('/api/cadastro/mercado-pago/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Falha ao iniciar checkout do Mercado Pago.');
      }

      paymentState = {
        status: 'created',
        paymentId: '',
        externalReference: String(data.externalReference || ''),
        preferenceId: String(data.preferenceId || ''),
      };
      persistPaymentState();

      const checkoutUrl = data.sandboxInitPoint || data.initPoint;
      if (!checkoutUrl) {
        throw new Error('Checkout do Mercado Pago nao retornou uma URL valida.');
      }

      window.location.href = checkoutUrl;
    } catch (error) {
      if (paymentOutlineHint) {
        paymentOutlineHint.textContent = error.message;
        paymentOutlineHint.classList.remove('success');
      }
      btnStartPayment.disabled = false;
      btnStartPayment.textContent = 'Pagar com Mercado Pago';
    }
  });
}

document.getElementById('email').addEventListener('input', () => {
  emailVerificationCodeSent = false;
  emailVerified = false;
  resetPaymentState();
  emailCodeHint.textContent = 'Solicite o codigo para validar o e-mail antes de prosseguir.';
  emailCodeHint.classList.remove('success');
  saveSignupDraft();
});

document.getElementById('cpf').addEventListener('input', (event) => {
  event.target.value = formatCpf(event.target.value);
  resetPaymentState();
  saveSignupDraft();
});

document.getElementById('nomeUsuario').addEventListener('input', saveSignupDraft);
document.getElementById('emailCode').addEventListener('input', saveSignupDraft);
document.getElementById('senha').addEventListener('input', saveSignupDraft);
document.getElementById('confirmarSenha').addEventListener('input', saveSignupDraft);

restoreSignupDraft();
restorePaymentState();
parsePaymentReturnParams();
showStep(0);
updatePackageSummary();
updatePaymentSummary();
updatePaymentStatusUI();
window.addEventListener('load', resetPackageGridPosition);
window.addEventListener('pageshow', resetPackageGridPosition);
