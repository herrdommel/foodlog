import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.ts';
import { invites, oauthAccounts, users } from '../db/schema.ts';
import { clearShortLivedCookie, setSessionCookie, setShortLivedCookie } from '../lib/cookies.ts';
import { hashToken, newId } from '../lib/crypto.ts';
import { createGoogleClient, randomUrlToken, type GoogleProfile } from '../lib/google.ts';
import { isFeatureEnabledGlobally } from '../services/features.ts';
import { createSession } from '../services/sessions.ts';
import { PUBLIC_REGISTRATION, getBooleanSetting } from '../services/settings.ts';
import { findUserByEmail, randomPresetAvatar } from '../services/users.ts';

const STATE_COOKIE = 'foodlog_oauth_state';
const VERIFIER_COOKIE = 'foodlog_oauth_verifier';
const INVITE_COOKIE = 'foodlog_oauth_invite';

export async function googleRoutes(app: FastifyInstance, { config, db, fetch }: AppDeps) {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) return;

  const google = createGoogleClient({
    clientId: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    redirectUri: `${config.APP_URL}/api/auth/google/callback`,
    fetch,
  });
  const fail = (code: string) => `${config.APP_URL}/login?error=${code}`;
  const limit = { rateLimit: { max: 20, timeWindow: '1 minute' } };

  app.get('/api/auth/google', { config: limit }, async (request, reply) => {
    if (!(await isFeatureEnabledGlobally(db, 'google_login'))) {
      return reply.redirect(fail('google_disabled'));
    }
    const state = randomUrlToken();
    const verifier = randomUrlToken();
    const url = google.createAuthorizationUrl(state, verifier);
    setShortLivedCookie(reply, config, STATE_COOKIE, state);
    setShortLivedCookie(reply, config, VERIFIER_COOKIE, verifier);
    const { invite } = request.query as { invite?: string };
    if (invite) setShortLivedCookie(reply, config, INVITE_COOKIE, invite);
    return reply.redirect(url.toString());
  });

  app.get('/api/auth/google/callback', { config: limit }, async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };
    const storedState = request.cookies[STATE_COOKIE];
    const verifier = request.cookies[VERIFIER_COOKIE];
    const inviteToken = request.cookies[INVITE_COOKIE];
    for (const name of [STATE_COOKIE, VERIFIER_COOKIE, INVITE_COOKIE]) {
      clearShortLivedCookie(reply, config, name);
    }
    if (!code || !state || !storedState || !verifier || state !== storedState) {
      return reply.redirect(fail('google_failed'));
    }

    let claims: GoogleProfile;
    try {
      claims = await google.fetchProfile(code, verifier);
    } catch (error) {
      request.log.warn(error, 'google oauth failed');
      return reply.redirect(fail('google_failed'));
    }
    if (!claims.email_verified) return reply.redirect(fail('google_unverified'));
    const email = claims.email.trim().toLowerCase();

    const [linked] = await db
      .select({ user: users })
      .from(oauthAccounts)
      .innerJoin(users, eq(users.id, oauthAccounts.userId))
      .where(
        and(eq(oauthAccounts.provider, 'google'), eq(oauthAccounts.providerUserId, claims.sub)),
      );

    let userId: string;
    let active: boolean;
    if (linked) {
      userId = linked.user.id;
      active = linked.user.active;
    } else {
      const existing = await findUserByEmail(db, email);
      if (existing) {
        if (!existing.emailVerifiedAt) {
          await db
            .update(users)
            .set({ emailVerifiedAt: new Date(), passwordHash: null })
            .where(eq(users.id, existing.id));
        }
        await db
          .insert(oauthAccounts)
          .values({ provider: 'google', providerUserId: claims.sub, userId: existing.id });
        userId = existing.id;
        active = existing.active;
      } else {
        let inviteId: string | null = null;
        if (inviteToken) {
          const [invite] = await db
            .select()
            .from(invites)
            .where(eq(invites.tokenHash, hashToken(inviteToken)));
          if (
            !invite ||
            invite.usedAt ||
            invite.expiresAt.getTime() < Date.now() ||
            (invite.email && invite.email !== email)
          ) {
            return reply.redirect(fail('invalid_invite'));
          }
          inviteId = invite.id;
        } else if (!(await getBooleanSetting(db, PUBLIC_REGISTRATION, false))) {
          return reply.redirect(fail('registration_closed'));
        }
        userId = newId();
        active = true;
        try {
          await db.transaction(async (tx) => {
            await tx.insert(users).values({
              id: userId,
              email,
              name: (claims.name ?? email.split('@')[0] ?? 'User').slice(0, 100),
              emailVerifiedAt: new Date(),
              avatar: randomPresetAvatar(),
            });
            await tx
              .insert(oauthAccounts)
              .values({ provider: 'google', providerUserId: claims.sub, userId });
            if (inviteId) {
              const [result] = await tx
                .update(invites)
                .set({ usedAt: new Date(), usedBy: userId })
                .where(and(eq(invites.id, inviteId), isNull(invites.usedAt)));
              if (result.affectedRows !== 1) throw new Error('invite already used');
            }
          });
        } catch {
          return reply.redirect(fail('invalid_invite'));
        }
      }
    }

    if (!active) return reply.redirect(fail('account_disabled'));
    setSessionCookie(reply, config, await createSession(db, userId));
    return reply.redirect(`${config.APP_URL}/`);
  });
}
