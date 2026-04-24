const { Resend } = require('resend');

async function sendVerificationEmail({ to, code, expiresInMinutes }) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY nao configurado. Defina a variavel de ambiente RESEND_API_KEY para enviar emails.'
    );
  }

  const resend = new Resend(apiKey);

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'noreply@emilnotasxml.com',
    to,
    subject: 'Código de verificação - Emil NotasXML',
    text: [
      'Seu código de verificação para cadastro no Emil NotasXML:',
      '',
      code,
      '',
      `Este código expira em ${expiresInMinutes} minutos.`,
    ].join('\n'),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2836;">
        <h2 style="margin: 0 0 12px;">Verificação de e-mail</h2>
        <p>Seu código de verificação para cadastro no Emil NotasXML:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 2px; margin: 8px 0 12px; background: #f0f0f0; padding: 12px; border-radius: 4px; display: inline-block;">${code}</p>
        <p>Este código expira em <strong>${expiresInMinutes} minutos</strong>.</p>
      </div>
    `,
  });

  if (result.error) {
    throw new Error(`Erro ao enviar email: ${result.error.message}`);
  }

  return {
    messageId: result.data?.id,
    mode: 'resend',
  };
}

module.exports = {
  sendVerificationEmail,
};
