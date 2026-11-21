import type { FastifyBaseLogger } from 'fastify';
import type { Locale } from '@foodlog/shared';
import type { Config } from '../config.ts';
import type { Database } from '../db/client.ts';
import { DAY, HOUR } from '../lib/time.ts';
import type { Mailer } from './mail.ts';
import { renderMail } from './mail-templates.ts';
import { createAuthToken } from './tokens.ts';

interface Recipient {
  id: string;
  email: string;
  name: string;
  locale: Locale;
}

export function createAuthMail(deps: {
  config: Config;
  db: Database;
  mailer: Mailer;
  log: FastifyBaseLogger;
}) {
  const { config, db, mailer, log } = deps;

  async function sendSafely(message: ReturnType<typeof renderMail>) {
    try {
      await mailer.send(message);
    } catch (error) {
      log.error(error, 'failed to send mail');
    }
  }

  async function sendStrictly(message: ReturnType<typeof renderMail>) {
    await mailer.send(message);
  }

  return {
    sendSafely,
    sendStrictly,

    async sendVerification(user: Recipient) {
      const token = await createAuthToken(db, {
        userId: user.id,
        type: 'verify_email',
        ttlMs: DAY,
      });
      await sendSafely(
        renderMail('verifyEmail', user.locale, user.email, {
          name: user.name,
          url: `${config.APP_URL}/verify-email?token=${token}`,
        }),
      );
    },

    async sendReset(
      user: Recipient,
      template: 'resetPassword' | 'accountExists' = 'resetPassword',
      options: { strict?: boolean } = {},
    ) {
      const token = await createAuthToken(db, {
        userId: user.id,
        type: 'reset_password',
        ttlMs: HOUR,
      });
      await (options.strict ? sendStrictly : sendSafely)(
        renderMail(template, user.locale, user.email, {
          name: user.name,
          url: `${config.APP_URL}/reset-password?token=${token}`,
        }),
      );
    },

    async sendEmailChange(user: Recipient, newEmail: string) {
      const token = await createAuthToken(db, {
        userId: user.id,
        type: 'change_email',
        ttlMs: DAY,
        newEmail,
      });
      await sendSafely(
        renderMail('changeEmail', user.locale, newEmail, {
          name: user.name,
          url: `${config.APP_URL}/confirm-email?token=${token}`,
        }),
      );
    },
  };
}
