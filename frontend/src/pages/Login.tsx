import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuthConfig, useLogin, useResendVerification } from '../api/hooks.ts';
import { ApiError } from '../api/client.ts';
import { Button, ErrorMessage, Field, Notice } from '../components/ui.tsx';
import { PublicLayout } from '../components/Layout.tsx';

export function GoogleButton({ invite }: { invite?: string | null }) {
  const { t } = useTranslation();
  const href = invite
    ? `/api/auth/google?invite=${encodeURIComponent(invite)}`
    : '/api/auth/google';
  return (
    <a
      href={href}
      className="block rounded-lg border border-fg/20 bg-raised px-4 py-2 text-center font-medium hover:border-accent"
    >
      {t('auth.google')}
    </a>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const config = useAuthConfig();
  const login = useLogin();
  const resend = useResendVerification();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const queryError = params.get('error');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate('/') });
  };

  const needsVerification =
    login.error instanceof ApiError && login.error.code === 'email_not_verified';

  return (
    <PublicLayout>
      <h1 className="mb-6 text-2xl font-bold">{t('auth.loginTitle')}</h1>
      <form onSubmit={submit} className="space-y-4">
        {queryError && <ErrorMessage error={queryError} />}
        <ErrorMessage error={login.error} />
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
          <p className="text-center text-sm text-fg/60">{t('common.or')}</p>
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
    </PublicLayout>
  );
}
