import type { FastifyReply } from 'fastify';
import type { Config } from '../config.ts';
import { SESSION_TTL } from '../services/sessions.ts';

export const SESSION_COOKIE = 'foodlog_session';
export const MFA_COOKIE = 'foodlog_mfa';
export const WEBAUTHN_COOKIE = 'foodlog_webauthn';

function baseOptions(config: Config) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.APP_URL.startsWith('https://'),
    path: '/',
  };
}

export function setSessionCookie(reply: FastifyReply, config: Config, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    ...baseOptions(config),
    maxAge: SESSION_TTL / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply, config: Config): void {
  reply.clearCookie(SESSION_COOKIE, baseOptions(config));
}

export function setShortLivedCookie(
  reply: FastifyReply,
  config: Config,
  name: string,
  value: string,
): void {
  reply.setCookie(name, value, { ...baseOptions(config), maxAge: 600 });
}

export function clearShortLivedCookie(reply: FastifyReply, config: Config, name: string): void {
  reply.clearCookie(name, baseOptions(config));
}
