import nodemailer from "nodemailer";

const APP_NAME = "Control Finance";
const FLIP_NEG_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

// Returns true if SMTP is configured via environment variables
const isSmtpConfigured = () =>
  Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS,
  );

const createTransport = () =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

const fromAddress = () =>
  process.env.SMTP_FROM || `${APP_NAME} <noreply@control.finance>`;

// Formats BRL currency
const brl = (value) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value) || 0,
  );

const buildFlipNegSubject = () =>
  `[${APP_NAME}] Atencao: projecao de saldo foi para negativo`;

const buildFlipNegHtml = ({ email, projectedBalance, month, daysRemaining }) => `
<p>Ola,</p>
<p>Identificamos uma mudanca na sua projecao de saldo para o mes <strong>${month}</strong>.</p>
<p>
  Projecao atual: <strong style="color:#dc2626">${brl(projectedBalance)}</strong><br>
  Dias restantes no mes: <strong>${daysRemaining}</strong>
</p>
<p>Se quiser revisar seus gastos ou ajustar seu orcamento, acesse o Control Finance.</p>
<p style="color:#6b7280;font-size:12px">
  Este email foi enviado para ${email}.<br>
  Para deixar de receber notificacoes, ajuste suas preferencias no app.
</p>
`;

const buildPaydayReminderSubject = (daysUntilPayday) =>
  `[${APP_NAME}] Seu salario chega em ${daysUntilPayday} dias — veja sua projecao`;

const buildPaydayReminderHtml = ({
  email,
  projectedBalance,
  month,
  incomeExpected,
  daysUntilPayday,
}) => `
<p>Ola,</p>
<p>Seu dia de pagamento esta chegando em <strong>${daysUntilPayday} dias</strong>!</p>
<p>
  Projecao de saldo para ${month}: <strong>${brl(projectedBalance)}</strong><br>
  ${incomeExpected !== null ? `Salario esperado: <strong>${brl(incomeExpected)}</strong>` : ""}
</p>
<p>Acesse o Control Finance para ver o detalhamento completo.</p>
<p style="color:#6b7280;font-size:12px">
  Este email foi enviado para ${email}.<br>
  Para deixar de receber notificacoes, ajuste suas preferencias no app.
</p>
`;

export const sendFlipNegEmail = async ({ email, projectedBalance, month, daysRemaining }) => {
  if (!isSmtpConfigured()) {
    console.log(
      `[email] flip_neg → ${email} | month=${month} balance=${projectedBalance} (SMTP not configured — skipped)`,
    );
    return;
  }

  const transport = createTransport();
  await transport.sendMail({
    from: fromAddress(),
    to: email,
    subject: buildFlipNegSubject(),
    html: buildFlipNegHtml({ email, projectedBalance, month, daysRemaining }),
  });
};

export const sendPaydayReminderEmail = async ({
  email,
  projectedBalance,
  month,
  incomeExpected,
  daysUntilPayday,
}) => {
  if (!isSmtpConfigured()) {
    console.log(
      `[email] payday_reminder → ${email} | month=${month} balance=${projectedBalance} days=${daysUntilPayday} (SMTP not configured — skipped)`,
    );
    return;
  }

  const transport = createTransport();
  await transport.sendMail({
    from: fromAddress(),
    to: email,
    subject: buildPaydayReminderSubject(daysUntilPayday),
    html: buildPaydayReminderHtml({ email, projectedBalance, month, incomeExpected, daysUntilPayday }),
  });
};

export const FLIP_NEG_COOLDOWN = FLIP_NEG_COOLDOWN_MS;
