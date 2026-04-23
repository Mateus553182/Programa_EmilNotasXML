const nodemailer = require('nodemailer');

let transporterPromise = null;

function parseBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).trim().toLowerCase() === 'true';
}

async function buildTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = parseBool(process.env.SMTP_SECURE, port === 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

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

async function getTransportContext() {
  if (!transporterPromise) {
    transporterPromise = buildTransporter();
  }

  return transporterPromise;
}

async function sendVerificationEmail({ to, code, expiresInMinutes }) {
  const ctx = await getTransportContext();
  const info = await ctx.transporter.sendMail({
    from: ctx.fromAddress,
    to,
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
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 2px; margin: 8px 0 12px;">${code}</p>
        <p>Este codigo expira em <strong>${expiresInMinutes} minutos</strong>.</p>
      </div>
    `,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info) || null;

  return {
    messageId: info.messageId,
    previewUrl,
    mode: ctx.mode,
  };
}

module.exports = {
  sendVerificationEmail,
};
