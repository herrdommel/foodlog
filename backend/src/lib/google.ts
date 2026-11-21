import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

const tokenSchema = z.object({ access_token: z.string() });

const userInfoSchema = z.object({
  sub: z.string(),
  email: z.string(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
});

export type GoogleProfile = z.infer<typeof userInfoSchema>;

export function createGoogleClient(options: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetch?: typeof fetch;
}) {
  const request = options.fetch ?? fetch;

  return {
    createAuthorizationUrl(state: string, verifier: string): URL {
      const url = new URL(AUTH_URL);
      url.search = new URLSearchParams({
        response_type: 'code',
        client_id: options.clientId,
        redirect_uri: options.redirectUri,
        scope: 'openid email profile',
        state,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
      }).toString();
      return url;
    },

    async fetchProfile(code: string, verifier: string): Promise<GoogleProfile> {
      const tokenResponse = await request(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          code_verifier: verifier,
          client_id: options.clientId,
          client_secret: options.clientSecret,
          redirect_uri: options.redirectUri,
        }),
      });
      if (!tokenResponse.ok) throw new Error(`token exchange failed: ${tokenResponse.status}`);
      const { access_token } = tokenSchema.parse(await tokenResponse.json());

      const profileResponse = await request(USERINFO_URL, {
        headers: { authorization: `Bearer ${access_token}` },
      });
      if (!profileResponse.ok) throw new Error(`userinfo failed: ${profileResponse.status}`);
      return userInfoSchema.parse(await profileResponse.json());
    },
  };
}

export function randomUrlToken(): string {
  return randomBytes(32).toString('base64url');
}
