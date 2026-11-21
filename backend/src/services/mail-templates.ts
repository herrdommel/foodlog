import type { Locale } from '@foodlog/shared';
import type { MailMessage } from './mail.ts';

type TemplateKey = 'verifyEmail' | 'resetPassword' | 'changeEmail' | 'accountExists' | 'invite';

interface Params {
  name?: string;
  url: string;
}

const templates: Record<
  Locale,
  Record<TemplateKey, (params: Params) => { subject: string; text: string }>
> = {
  de: {
    verifyEmail: ({ name, url }) => ({
      subject: 'Foodlog I/O: E-Mail-Adresse bestätigen',
      text: `Hallo ${name},\n\nbitte bestätige deine E-Mail-Adresse:\n${url}\n\nDer Link ist 24 Stunden gültig. Wenn du dich nicht registriert hast, kannst du diese Nachricht ignorieren.`,
    }),
    resetPassword: ({ name, url }) => ({
      subject: 'Foodlog I/O: Passwort zurücksetzen',
      text: `Hallo ${name},\n\nüber diesen Link kannst du ein neues Passwort setzen:\n${url}\n\nDer Link ist 1 Stunde gültig. Wenn du das nicht angefordert hast, kannst du diese Nachricht ignorieren.`,
    }),
    changeEmail: ({ name, url }) => ({
      subject: 'Foodlog I/O: Neue E-Mail-Adresse bestätigen',
      text: `Hallo ${name},\n\nbitte bestätige deine neue E-Mail-Adresse:\n${url}\n\nDer Link ist 24 Stunden gültig. Wenn du das nicht angefordert hast, kannst du diese Nachricht ignorieren.`,
    }),
    accountExists: ({ name, url }) => ({
      subject: 'Foodlog I/O: Du hast bereits ein Konto',
      text: `Hallo ${name},\n\nfür diese E-Mail-Adresse existiert bereits ein Konto. Falls du dein Passwort vergessen hast, kannst du es hier zurücksetzen:\n${url}`,
    }),
    invite: ({ url }) => ({
      subject: 'Foodlog I/O: Einladung',
      text: `Du wurdest zu Foodlog I/O eingeladen. Hier kannst du dich registrieren:\n${url}`,
    }),
  },
  en: {
    verifyEmail: ({ name, url }) => ({
      subject: 'Foodlog I/O: confirm your email address',
      text: `Hi ${name},\n\nplease confirm your email address:\n${url}\n\nThe link is valid for 24 hours. If you did not sign up, you can ignore this message.`,
    }),
    resetPassword: ({ name, url }) => ({
      subject: 'Foodlog I/O: reset your password',
      text: `Hi ${name},\n\nuse this link to set a new password:\n${url}\n\nThe link is valid for 1 hour. If you did not request this, you can ignore this message.`,
    }),
    changeEmail: ({ name, url }) => ({
      subject: 'Foodlog I/O: confirm your new email address',
      text: `Hi ${name},\n\nplease confirm your new email address:\n${url}\n\nThe link is valid for 24 hours. If you did not request this, you can ignore this message.`,
    }),
    accountExists: ({ name, url }) => ({
      subject: 'Foodlog I/O: you already have an account',
      text: `Hi ${name},\n\nan account already exists for this email address. If you forgot your password, you can reset it here:\n${url}`,
    }),
    invite: ({ url }) => ({
      subject: 'Foodlog I/O: invitation',
      text: `You have been invited to Foodlog I/O. Register here:\n${url}`,
    }),
  },
};

export function renderMail(
  key: TemplateKey,
  locale: Locale,
  to: string,
  params: Params,
): MailMessage {
  return { to, ...templates[locale][key](params) };
}
