const nodemailer = require('nodemailer');
const { Resend } = require('resend');

let smtpContextPromise = null;

function parseBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).trim().toLowerCase() === 'true';
}

function getEmailProvider() {
  return String(process.env.EMAIL_PROVIDER || 'smtp').trim().toLowerCase();
}

async function buildSmtpContext() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = parseBool(process.env.SMTP_SECURE, port === 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const allowEtherealFallback = parseBool(process.env.EMAIL_ALLOW_ETHEREAL, false);

  if (host && user && pass) {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    return {
      transporter,
      fromAddress: process.env.SMTP_FROM || user,
      mode: 'smtp',
    };
  }

  if (!allowEtherealFallback) {
    throw new Error(
      'SMTP nao configurado. Defina SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS para envio real de e-mail.'
    );
  }

  const testAccount = await nodemailer.createTestAccount();
  const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  return {
    transporter,
    fromAddress: process.env.SMTP_FROM || 'Emil NotasXML <no-reply@emilnotasxml.local>',
    mode: 'ethereal',
  };
}

async function getSmtpContext() {
  if (!smtpContextPromise) {
    smtpContextPromise = buildSmtpContext();
  }

  return smtpContextPromise;
}

function buildEmailContent(code, expiresInMinutes) {
  return {
    subject: 'Codigo de verificacao - Emil NotasXML',
    text: [
      'Seu codigo de verificacao para cadastro no Emil NotasXML:',
      '',
      code,
      '',
      `Este codigo expira em ${expiresInMinutes} minutos.`,
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2836;">
        <h2 style="margin: 0 0 12px;">Verificacao de e-mail</h2>
        <p>Seu codigo de verificacao para cadastro no Emil NotasXML:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 2px; margin: 8px 0 12px; background: #f0f0f0; padding: 12px; border-radius: 4px; display: inline-block;">${code}</p>
        <p>Este codigo expira em <strong>${expiresInMinutes} minutos</strong>.</p>
      </div>
    `,
  };
}

async function sendWithSmtp({ to, code, expiresInMinutes }) {
  const ctx = await getSmtpContext();
  const content = buildEmailContent(code, expiresInMinutes);

  const info = await ctx.transporter.sendMail({
    from: ctx.fromAddress,
    to,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info) || null;

  return {
    messageId: info.messageId,
    previewUrl,
    mode: ctx.mode,
  };
}

async function sendWithResend({ to, code, expiresInMinutes }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY nao configurado. Defina RESEND_API_KEY ou use EMAIL_PROVIDER=smtp.'
    );
  }

  const resend = new Resend(apiKey);
  const content = buildEmailContent(code, expiresInMinutes);
  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
    to,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });

  if (result.error) {
    throw new Error(`Erro ao enviar email: ${result.error.message}`);
  }

  return {
    messageId: result.data?.id,
    mode: 'resend',
  };
}

async function sendVerificationEmail({ to, code, expiresInMinutes }) {
  const provider = getEmailProvider();
  if (provider === 'resend') {
    return sendWithResend({ to, code, expiresInMinutes });
  }

  return sendWithSmtp({ to, code, expiresInMinutes });
}

module.exports = {
  sendVerificationEmail,
};
