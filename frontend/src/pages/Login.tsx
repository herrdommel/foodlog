import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { MfaMethod } from '@foodlog/shared';
import {
  useAuthConfig,
  useLogin,
  useMfaCodeLogin,
  useMfaPasskeyLogin,
  usePasskeyLogin,
  useResendVerification,
} from '../api/hooks.ts';
import { ApiError } from '../api/client.ts';
import { Button, ErrorMessage, Field, Notice } from '../components/ui.tsx';
import { PublicLayout } from '../components/Layout.tsx';
import { passkeysSupported } from '../lib/passkeys.ts';

export function GoogleButton({
  invite,
  consent = false,
  disabled = false,
}: {
  invite?: string | null;
  consent?: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const parameters = new URLSearchParams();
  if (invite) parameters.set('invite', invite);
  if (consent) parameters.set('consent', '1');
  const query = parameters.size > 0 ? `?${parameters}` : '';
  const classes =
    'block rounded-lg border border-fg/20 bg-raised px-4 py-2 text-center font-medium';
  if (disabled) {
    return (
      <span aria-disabled="true" role="link" className={`${classes} cursor-not-allowed opacity-50`}>
        {t('auth.google')}
      </span>
    );
  }
  return (
    <a href={`/api/auth/google${query}`} className={`${classes} hover:border-accent`}>
      {t('auth.google')}
    </a>
  );
}

function MfaStep({
  heading: Heading,
  methods,
  onBack,
}: {
  heading: 'h1' | 'h2';
  methods: MfaMethod[];
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [method, setMethod] = useState<'totp' | 'recovery' | null>(
    methods.includes('totp') ? 'totp' : null,
  );
  const totp = useMfaCodeLogin('totp');
  const recovery = useMfaCodeLogin('recovery');
  const passkey = useMfaPasskeyLogin();
  const active = method === 'recovery' ? recovery : totp;
  const hasCodes = methods.includes('totp');
  const hasRecovery = methods.includes('recovery');
  const error = passkey.error ?? active.error;
  const toggle: 'totp' | 'recovery' | null =
    method === 'recovery' ? (hasCodes ? 'totp' : null) : hasRecovery ? 'recovery' : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    active.mutate(code, { onSuccess: () => navigate('/') });
  };

  return (
    <>
      <Heading className="mb-2 text-2xl font-bold">{t('auth.mfa.title')}</Heading>
      <p className="mb-6 text-sm text-fg/75">{t('auth.mfa.text')}</p>
      <div className="space-y-4">
        <ErrorMessage error={error} />
        {methods.includes('passkey') && passkeysSupported() && (
          <Button
            type="button"
            className="w-full"
            disabled={passkey.isPending}
            onClick={() => passkey.mutate(undefined, { onSuccess: () => navigate('/') })}
          >
            {t('auth.mfa.usePasskey')}
          </Button>
        )}
        {method && (
          <form onSubmit={submit} className="space-y-4">
            <Field
              key={method}
              label={method === 'totp' ? t('auth.mfa.codeLabel') : t('auth.mfa.recoveryLabel')}
              hint={method === 'totp' ? t('auth.mfa.codeHint') : t('auth.mfa.recoveryHint')}
              inputMode={method === 'totp' ? 'numeric' : 'text'}
              autoComplete="one-time-code"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <Button type="submit" disabled={active.isPending} className="w-full">
              {t('auth.mfa.confirm')}
            </Button>
          </form>
        )}
        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:justify-between">
          {toggle && (
            <button
              type="button"
              className="text-left text-accent hover:underline"
              onClick={() => {
                setCode('');
                setMethod(toggle);
              }}
            >
              {toggle === 'recovery' ? t('auth.mfa.useRecovery') : t('auth.mfa.useApp')}
            </button>
          )}
          <button type="button" className="text-left text-accent hover:underline" onClick={onBack}>
            {t('auth.mfa.back')}
          </button>
        </div>
      </div>
    </>
  );
}

export function LoginForm({ heading }: { heading: 'h1' | 'h2' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const config = useAuthConfig();
  const login = useLogin();
  const resend = useResendVerification();
  const passkeyLogin = usePasskeyLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const queryError = params.get('error');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate(
      { email, password },
      { onSuccess: (result) => ('user' in result ? navigate('/') : undefined) },
    );
  };

  const needsVerification =
    login.error instanceof ApiError && login.error.code === 'email_not_verified';

  const Heading = heading;

  if (login.data && 'mfaRequired' in login.data) {
    return <MfaStep heading={heading} methods={login.data.methods} onBack={() => login.reset()} />;
  }

  return (
    <>
      <Heading className="mb-6 text-2xl font-bold">{t('auth.loginTitle')}</Heading>
      <form onSubmit={submit} className="space-y-4">
        {queryError && <ErrorMessage error={queryError} />}
        <ErrorMessage error={login.error ?? passkeyLogin.error} />
        <Field
          label={t('common.email')}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Field
          label={t('common.password')}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Button type="submit" disabled={login.isPending} className="w-full">
          {t('auth.login')}
        </Button>
        {passkeysSupported() && (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={passkeyLogin.isPending}
            onClick={() => passkeyLogin.mutate(undefined, { onSuccess: () => navigate('/') })}
          >
            {t('auth.passkeyLogin')}
          </Button>
        )}
        {needsVerification && (
          <div className="space-y-2">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => resend.mutate(email)}
            >
              {t('auth.resend')}
            </Button>
            {resend.isSuccess && <Notice>{t('auth.resent')}</Notice>}
          </div>
        )}
      </form>
      {config.data?.googleLogin && (
        <div className="mt-4 space-y-4">
          <p className="text-center text-sm text-fg/75">{t('common.or')}</p>
          <GoogleButton />
        </div>
      )}
      <div className="mt-6 flex justify-between text-sm">
        <Link to="/forgot-password" className="text-accent hover:underline">
          {t('auth.forgot')}
        </Link>
        {config.data?.publicRegistration && (
          <span>
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="text-accent hover:underline">
              {t('auth.registerLink')}
            </Link>
          </span>
        )}
      </div>
    </>
  );
}

export function LoginPage() {
  return (
    <PublicLayout>
      <LoginForm heading="h1" />
    </PublicLayout>
  );
}
