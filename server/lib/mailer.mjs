// Sends email through any SMTP provider (Gmail app password, Brevo, Zoho...). Silent no-op when SMTP is not configured.
let transporter;
export const emailEnabled = () => !!(process.env.SMTP_HOST || globalThis.__t360Mailer);
export async function sendMail({ to, subject, text, html }) {
  if (globalThis.__t360Mailer) return globalThis.__t360Mailer({ to, subject, text, html });
  if (!process.env.SMTP_HOST) return false;
  const nodemailer = (await import('nodemailer')).default, port = Number(process.env.SMTP_PORT || 587);
  transporter ||= nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined });
  await transporter.sendMail({ from: process.env.MAIL_FROM || `TRACE360 <${process.env.SMTP_USER}>`, to, subject, text, html });
  return true;
}
