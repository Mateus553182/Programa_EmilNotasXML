const PACKAGE_OPTIONS = {
  essencial: {
    label: 'Essencial',
    companyLimit: 1,
    modeHint: 'Usuario master pode criar 1 empresa ou vincular 1 codigo existente.',
  },
  profissional: {
    label: 'Profissional',
    companyLimit: 3,
    modeHint: 'Permite vincular ate 3 empresas no cadastro inicial.',
  },
  corporativo: {
    label: 'Corporativo',
    companyLimit: 10,
    modeHint: 'Estrutura pronta para multiplas empresas e expansao operacional.',
  },
};

const steps = document.querySelectorAll('.wizard-step');
const stepIndicators = document.querySelectorAll('.step');
const stepLines = document.querySelectorAll('.step-line');
const btnVoltar = document.getElementById('btnVoltar');
const btnProximo = document.getElementById('btnProximo');
const btnConcluir = document.getElementById('btnConcluir');
const btnAdicionarEmpresa = document.getElementById('btnAdicionarEmpresa');
const form = document.getElementById('cadastroForm');
const message = document.getElementById('cadastroMessage');
const uploadArea = document.getElementById('uploadArea');
const certInput = document.getElementById('certificadoFile');
const certFileName = document.getElementById('certificadoFileName');
const cepExtraidoCertificado = document.getElementById('cepExtraidoCertificado');
const btnEnviarCodigo = document.getElementById('btnEnviarCodigo');
const emailCodeHint = document.getElementById('emailCodeHint');
const companyTemplate = document.getElementById('empresaTemplate');
const empresaList = document.getElementById('empresaList');
const empresaEmpty = document.getElementById('empresaEmpty');
const selectedPackageLabel = document.getElementById('selectedPackageLabel');
const selectedPackageHint = document.getElementById('selectedPackageHint');
const companiesPlanHint = document.getElementById('companiesPlanHint');
const companiesModeHint = document.getElementById('companiesModeHint');

let currentStep = 0;
let companyCounter = 0;
let emailVerificationCodeSent = false;
let emailVerified = false;
let extractedAddressFromCertificate = null;

function getAccessLevel() {
  return 'master';
}

function getPackageConfig() {
  const packageId = form.elements.packageId.value || 'essencial';
  return {
    id: packageId,
    ...PACKAGE_OPTIONS[packageId],
  };
}

function showStep(index) {
  steps.forEach((step, stepIndex) => step.classList.toggle('hidden', stepIndex !== index));

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

function validatePasswords() {
  const senha = document.getElementById('senha');
  const confirmar = document.getElementById('confirmarSenha');

  if (senha.value !== confirmar.value) {
    confirmar.setCustomValidity('As senhas nao coincidem');
    confirmar.reportValidity();
    confirmar.setCustomValidity('');
    return false;
  }

  return true;
}

function validateEmailVerification() {
  const email = document.getElementById('email').value.trim();
  const codeInput = document.getElementById('emailCode');

  if (!emailVerificationCodeSent) {
    codeInput.setCustomValidity('Solicite o codigo de verificacao do e-mail antes de continuar.');
    codeInput.reportValidity();
    codeInput.setCustomValidity('');
    return false;
  }

  if (!emailVerified) {
    codeInput.setCustomValidity('Valide o codigo informado antes de continuar.');
    codeInput.reportValidity();
    codeInput.setCustomValidity('');
    return false;
  }

  emailCodeHint.textContent = `E-mail ${email} verificado com sucesso.`;
  emailCodeHint.classList.add('success');
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
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Codigo invalido.');

    emailVerified = true;
    emailCodeHint.textContent = data.message || `E-mail ${email} verificado com sucesso.`;
    emailCodeHint.classList.add('success');
    return true;
  } catch (error) {
    emailVerified = false;
    emailCodeHint.textContent = error.message;
    emailCodeHint.classList.remove('success');
    return false;
  }
}

function validateCertificateStep() {
  const senhaCertificado = document.getElementById('senhaCertificado');
  if (certInput.files.length && !senhaCertificado.value.trim()) {
    senhaCertificado.setCustomValidity('Informe a senha do certificado enviado');
    senhaCertificado.reportValidity();
    senhaCertificado.setCustomValidity('');
    return false;
  }

  return true;
}

function validateCompaniesStep() {
  const cards = Array.from(empresaList.querySelectorAll('.empresa-card'));
  const { companyLimit } = getPackageConfig();

  if (!cards.length) {
    message.style.color = 'var(--danger)';
    message.textContent = 'Adicione pelo menos uma empresa para concluir o cadastro.';
    return false;
  }

  if (cards.length > companyLimit) {
    message.style.color = 'var(--danger)';
    message.textContent = `O pacote selecionado permite ate ${companyLimit} empresa(s).`;
    return false;
  }

  for (const card of cards) {
    const requiredFields = ['nomeEmpresa', 'cnpj'];
    for (const fieldName of requiredFields) {
      const input = card.querySelector(`[data-field="${fieldName}"]`);
      if (input && !input.reportValidity()) {
        return false;
      }
    }
  }

  return true;
}

function validateCurrentStep() {
  message.textContent = '';

  if (currentStep === 0) {
    const inputs = steps[currentStep].querySelectorAll('input[required]');
    for (const input of inputs) {
      if (!input.reportValidity()) return false;
    }
    return validatePasswords() && validateEmailVerification();
  }

  if (currentStep === 1) {
    return Boolean(form.elements.packageId.value);
  }

  if (currentStep === 2) {
    return validateCertificateStep();
  }

  if (currentStep === 3) {
    return validateCompaniesStep();
  }

  return true;
}

function updateSelectableCards(containerSelector, inputName) {
  document.querySelectorAll(containerSelector).forEach((card) => {
    const input = card.querySelector(`input[name="${inputName}"]`);
    card.classList.toggle('active', Boolean(input && input.checked));
  });
}

function updateCompanyCardTitles() {
  const cards = Array.from(empresaList.querySelectorAll('.empresa-card'));
  cards.forEach((card, index) => {
    const title = card.querySelector('.empresa-title');
    if (title) title.textContent = `Empresa ${index + 1}`;
  });
}

function updateCompanyListState() {
  const cards = Array.from(empresaList.querySelectorAll('.empresa-card'));
  const { companyLimit } = getPackageConfig();

  empresaEmpty.classList.toggle('hidden', cards.length > 0);
  btnAdicionarEmpresa.disabled = cards.length >= companyLimit;
  btnAdicionarEmpresa.textContent = cards.length >= companyLimit
    ? 'Limite do pacote atingido'
    : 'Adicionar empresa';

  updateCompanyCardTitles();
}

function updatePackageSummary() {
  const selectedPackage = getPackageConfig();
  selectedPackageLabel.textContent = selectedPackage.label;
  selectedPackageHint.textContent = `Limite inicial de ${selectedPackage.companyLimit} empresa(s) vinculada(s) neste cadastro.`;
  companiesPlanHint.textContent = `${selectedPackage.companyLimit} empresa${selectedPackage.companyLimit > 1 ? 's' : ''}`;
  companiesModeHint.textContent = selectedPackage.modeHint;

  updateSelectableCards('.package-card', 'packageId');
  updateCompanyListState();
}

function applyExtractedAddressToCompanies() {
  if (!extractedAddressFromCertificate) return;

  empresaList.querySelectorAll('.empresa-card').forEach((card) => {
    const cepInput = card.querySelector('[data-field="cep"]');
    const enderecoInput = card.querySelector('[data-field="endereco"]');
    const cidadeInput = card.querySelector('[data-field="cidade"]');
    const estadoInput = card.querySelector('[data-field="estado"]');

    if (cepInput && !cepInput.value.trim()) cepInput.value = extractedAddressFromCertificate.cep || '';
    if (enderecoInput && !enderecoInput.value.trim()) enderecoInput.value = extractedAddressFromCertificate.street || '';
    if (cidadeInput && !cidadeInput.value.trim()) cidadeInput.value = extractedAddressFromCertificate.city || '';
    if (estadoInput && !estadoInput.value.trim()) estadoInput.value = extractedAddressFromCertificate.state || '';
  });
}

function showFileName(file) {
  certFileName.textContent = file ? `Arquivo selecionado: ${file.name}` : '';
}

function formatCpf(value) {
  let digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length > 9) digits = digits.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
  else if (digits.length > 6) digits = digits.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
  else if (digits.length > 3) digits = digits.replace(/(\d{3})(\d{1,3})/, '$1.$2');
  return digits;
}

function formatCnpj(value) {
  let digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length > 12) digits = digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, '$1.$2.$3/$4-$5');
  else if (digits.length > 8) digits = digits.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, '$1.$2.$3/$4');
  else if (digits.length > 5) digits = digits.replace(/(\d{2})(\d{3})(\d{1,3})/, '$1.$2.$3');
  else if (digits.length > 2) digits = digits.replace(/(\d{2})(\d{1,3})/, '$1.$2');
  return digits;
}

function formatCep(value) {
  let digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length > 5) digits = digits.replace(/(\d{5})(\d{1,3})/, '$1-$2');
  return digits;
}

function bindMask(input, formatter) {
  if (!input) return;
  input.addEventListener('input', () => {
    input.value = formatter(input.value);
  });
}

function createCompanyCard() {
  const fragment = companyTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.empresa-card');
  card.dataset.companyIndex = String(companyCounter++);

  card.querySelector('.empresa-remove').addEventListener('click', () => {
    card.remove();
    updateCompanyListState();
  });

  bindMask(card.querySelector('[data-field="cnpj"]'), formatCnpj);
  bindMask(card.querySelector('[data-field="cep"]'), formatCep);

  const nomeInput = card.querySelector('[data-field="nomeEmpresa"]');
  const cnpjInput = card.querySelector('[data-field="cnpj"]');
  if (nomeInput) nomeInput.required = true;
  if (cnpjInput) cnpjInput.required = true;

  empresaList.appendChild(card);
  applyExtractedAddressToCompanies();
  updateCompanyListState();
}

function collectCompaniesData() {
  return Array.from(empresaList.querySelectorAll('.empresa-card')).map((card) => ({
    mode: 'nova',
    nomeEmpresa: card.querySelector('[data-field="nomeEmpresa"]').value.trim(),
    cnpj: card.querySelector('[data-field="cnpj"]').value.trim(),
    cep: card.querySelector('[data-field="cep"]').value.trim(),
    endereco: card.querySelector('[data-field="endereco"]').value.trim(),
    cidade: card.querySelector('[data-field="cidade"]').value.trim(),
    estado: card.querySelector('[data-field="estado"]').value.trim().toUpperCase(),
  }));
}

btnProximo.addEventListener('click', () => {
  (async () => {
    if (currentStep === 0 && !emailVerified) {
      const checked = await verifyEmailCodeWithServer();
      if (!checked) return;
    }

    if (!validateCurrentStep()) return;
    if (currentStep < steps.length - 1) {
      currentStep += 1;
      showStep(currentStep);
    }
  })();
});

btnVoltar.addEventListener('click', () => {
  if (currentStep > 0) {
    currentStep -= 1;
    showStep(currentStep);
  }
});

btnAdicionarEmpresa.addEventListener('click', () => {
  const { companyLimit } = getPackageConfig();
  if (empresaList.querySelectorAll('.empresa-card').length >= companyLimit) return;
  createCompanyCard();
});

uploadArea.addEventListener('click', () => certInput.click());
uploadArea.addEventListener('dragover', (event) => {
  event.preventDefault();
  uploadArea.classList.add('drag-over');
});
uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('drag-over');
});
uploadArea.addEventListener('drop', (event) => {
  event.preventDefault();
  uploadArea.classList.remove('drag-over');
  if (event.dataTransfer.files.length) {
    certInput.files = event.dataTransfer.files;
    showFileName(event.dataTransfer.files[0]);
  }
});
certInput.addEventListener('change', () => showFileName(certInput.files[0]));

async function fetchCertificateAddressInfo() {
  const certFile = certInput.files[0];
  if (!certFile) {
    extractedAddressFromCertificate = null;
    cepExtraidoCertificado.value = '';
    return;
  }

  const formData = new FormData();
  formData.append('certificado', certFile);
  formData.append('senhaCertificado', document.getElementById('senhaCertificado').value.trim());

  try {
    const response = await fetch('/api/cadastro/certificado/address-preview', {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Nao foi possivel extrair dados de endereco do certificado.');
    }

    extractedAddressFromCertificate = {
      cep: data.cep || '',
      street: data.street || '',
      city: data.city || '',
      state: data.state || '',
    };
    cepExtraidoCertificado.value = data.cep || 'Nao identificado';
    applyExtractedAddressToCompanies();
  } catch (error) {
    extractedAddressFromCertificate = null;
    cepExtraidoCertificado.value = 'Nao identificado';
    message.style.color = 'var(--danger)';
    message.textContent = error.message;
  }
}

certInput.addEventListener('change', () => {
  showFileName(certInput.files[0]);
  fetchCertificateAddressInfo();
});

document.getElementById('senhaCertificado').addEventListener('blur', () => {
  if (certInput.files.length) {
    fetchCertificateAddressInfo();
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
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha ao enviar codigo de verificacao.');

    emailVerificationCodeSent = true;
    emailVerified = false;
    emailCodeHint.textContent = data.message || 'Codigo enviado. Verifique sua caixa de entrada.';
    if (data.previewUrl) {
      emailCodeHint.textContent += ` Preview: ${data.previewUrl}`;
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

Array.from(form.elements.packageId).forEach((input) => {
  input.addEventListener('change', updatePackageSummary);
});

document.getElementById('email').addEventListener('input', () => {
  emailVerificationCodeSent = false;
  emailVerified = false;
  emailCodeHint.textContent = 'Solicite o codigo para validar o e-mail antes de prosseguir.';
  emailCodeHint.classList.remove('success');
});

bindMask(document.getElementById('cpf'), formatCpf);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!validateCurrentStep()) return;

  btnConcluir.disabled = true;
  btnConcluir.textContent = 'Enviando...';
  message.textContent = '';

  const formData = new FormData();
  formData.append('accessLevel', getAccessLevel());
  formData.append('packageId', getPackageConfig().id);
  formData.append('nomeUsuario', document.getElementById('nomeUsuario').value.trim());
  formData.append('cpf', document.getElementById('cpf').value.trim());
  formData.append('cargo', document.getElementById('cargo').value.trim());
  formData.append('email', document.getElementById('email').value.trim());
  formData.append('emailCode', document.getElementById('emailCode').value.trim());
  formData.append('senha', document.getElementById('senha').value);
  formData.append('senhaCertificado', document.getElementById('senhaCertificado').value.trim());
  formData.append('certificadoValidade', document.getElementById('certificadoValidade').value);
  formData.append('extractedCep', cepExtraidoCertificado.value.trim());
  formData.append('companiesData', JSON.stringify(collectCompaniesData()));

  const certFile = certInput.files[0];
  if (certFile) {
    formData.append('certificado', certFile);
  }

  try {
    const response = await fetch('/api/cadastro', { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao cadastrar');

    const generatedCodes = Array.isArray(data.companyCodes) && data.companyCodes.length
      ? ` Codigos gerados: ${data.companyCodes.map((item) => `${item.name} (${item.code})`).join(', ')}.`
      : '';

    message.style.color = 'green';
    message.textContent = `${data.message || 'Cadastro realizado com sucesso!'}${generatedCodes} Redirecionando...`;
    setTimeout(() => {
      window.location.href = '/acesso?forceLogin=1';
    }, 3200);
  } catch (error) {
    message.style.color = 'var(--danger)';
    message.textContent = error.message;
    btnConcluir.disabled = false;
    btnConcluir.textContent = 'Concluir cadastro';
  }
});

createCompanyCard();
updatePackageSummary();
showStep(0);
