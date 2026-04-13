/* cadastro.js — Wizard de cadastro em 3 etapas (Empresa → Usuário → Certificado) */

const steps = document.querySelectorAll('.wizard-step');
const stepIndicators = document.querySelectorAll('.step');
const stepLines = document.querySelectorAll('.step-line');
const btnVoltar = document.getElementById('btnVoltar');
const btnProximo = document.getElementById('btnProximo');
const btnConcluir = document.getElementById('btnConcluir');
const form = document.getElementById('cadastroForm');
const message = document.getElementById('cadastroMessage');
const codigoEmpresaEl = document.getElementById('codigoEmpresaGerado');

let currentStep = 0;
let codigoEmpresa = '';
const totalSteps = steps.length;

/* ---- Gerar código da empresa (numérico, 6 dígitos) ---- */
function gerarCodigoEmpresa() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/* ---- Navegação ---- */

function showStep(index) {
  steps.forEach((s, i) => s.classList.toggle('hidden', i !== index));

  stepIndicators.forEach((ind, i) => {
    ind.classList.toggle('active', i <= index);
    ind.classList.toggle('done', i < index);
  });
  stepLines.forEach((line, i) => {
    line.classList.toggle('active', i < index);
  });

  btnVoltar.disabled = index === 0;
  btnProximo.classList.toggle('hidden', index === totalSteps - 1);
  btnConcluir.classList.toggle('hidden', index !== totalSteps - 1);
}

function validateCurrentStep() {
  const currentFieldset = steps[currentStep];
  const inputs = currentFieldset.querySelectorAll('input[required]');
  for (const input of inputs) {
    if (!input.reportValidity()) return false;
  }

  // Validação extra: senhas iguais (passo 2 — Usuário)
  if (currentStep === 1) {
    const senha = document.getElementById('senha');
    const confirmar = document.getElementById('confirmarSenha');
    if (senha.value !== confirmar.value) {
      confirmar.setCustomValidity('As senhas não coincidem');
      confirmar.reportValidity();
      confirmar.setCustomValidity('');
      return false;
    }
  }

  return true;
}

btnProximo.addEventListener('click', () => {
  if (!validateCurrentStep()) return;

  // Ao sair do passo 1 (Empresa), gerar código
  if (currentStep === 0 && !codigoEmpresa) {
    codigoEmpresa = gerarCodigoEmpresa();
    codigoEmpresaEl.textContent = codigoEmpresa;
  }

  if (currentStep < totalSteps - 1) {
    currentStep++;
    showStep(currentStep);
  }
});

btnVoltar.addEventListener('click', () => {
  if (currentStep > 0) {
    currentStep--;
    showStep(currentStep);
  }
});

/* ---- Upload certificado (drag & drop + click) ---- */

const uploadArea = document.getElementById('uploadArea');
const certInput = document.getElementById('certificadoFile');
const certFileName = document.getElementById('certificadoFileName');

uploadArea.addEventListener('click', () => certInput.click());

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('drag-over');
  if (e.dataTransfer.files.length) {
    certInput.files = e.dataTransfer.files;
    showFileName(e.dataTransfer.files[0]);
  }
});

certInput.addEventListener('change', () => {
  if (certInput.files.length) showFileName(certInput.files[0]);
});

function showFileName(file) {
  certFileName.textContent = `Arquivo selecionado: ${file.name}`;
}

/* ---- Máscaras simples ---- */

function maskCPF(input) {
  input.addEventListener('input', () => {
    let v = input.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
    else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
    else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
    input.value = v;
  });
}

function maskCNPJ(input) {
  input.addEventListener('input', () => {
    let v = input.value.replace(/\D/g, '').slice(0, 14);
    if (v.length > 12) v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, '$1.$2.$3/$4-$5');
    else if (v.length > 8) v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, '$1.$2.$3/$4');
    else if (v.length > 5) v = v.replace(/(\d{2})(\d{3})(\d{1,3})/, '$1.$2.$3');
    else if (v.length > 2) v = v.replace(/(\d{2})(\d{1,3})/, '$1.$2');
    input.value = v;
  });
}

function maskCEP(input) {
  input.addEventListener('input', () => {
    let v = input.value.replace(/\D/g, '').slice(0, 8);
    if (v.length > 5) v = v.replace(/(\d{5})(\d{1,3})/, '$1-$2');
    input.value = v;
  });
}

maskCPF(document.getElementById('cpf'));
maskCNPJ(document.getElementById('cnpj'));
maskCEP(document.getElementById('cep'));

/* ---- Submit ---- */

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateCurrentStep()) return;

  btnConcluir.disabled = true;
  btnConcluir.textContent = 'Enviando...';
  message.textContent = '';

  const formData = new FormData();
  // Empresa
  formData.append('codigoEmpresa', codigoEmpresa);
  formData.append('nomeEmpresa', document.getElementById('nomeEmpresa').value.trim());
  formData.append('cnpj', document.getElementById('cnpj').value.trim());
  formData.append('endereco', document.getElementById('endereco').value.trim());
  formData.append('cidade', document.getElementById('cidade').value.trim());
  formData.append('estado', document.getElementById('estado').value.trim().toUpperCase());
  formData.append('cep', document.getElementById('cep').value.trim());
  // Usuário
  formData.append('nomeUsuario', document.getElementById('nomeUsuario').value.trim());
  formData.append('cpf', document.getElementById('cpf').value.trim());
  formData.append('email', document.getElementById('email').value.trim());
  formData.append('usuario', document.getElementById('usuario').value.trim());
  formData.append('senha', document.getElementById('senha').value);
  // Certificado
  const certFile = document.getElementById('certificadoFile').files[0];
  if (certFile) {
    formData.append('certificado', certFile);
    formData.append('senhaCertificado', document.getElementById('senhaCertificado').value);
  }

  try {
    const res = await fetch('/api/cadastro', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar');
    message.style.color = 'green';
    message.textContent = `Cadastro realizado! Código da empresa: ${codigoEmpresa}. Redirecionando...`;
    setTimeout(() => (window.location.href = '/acesso?forceLogin=1'), 3000);
  } catch (err) {
    message.style.color = 'var(--danger)';
    message.textContent = err.message;
    btnConcluir.disabled = false;
    btnConcluir.textContent = 'Concluir cadastro';
  }
});

/* Init */
showStep(0);
