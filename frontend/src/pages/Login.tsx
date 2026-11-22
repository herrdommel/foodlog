import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuthConfig, useLogin, useResendVerification } from '../api/hooks.ts';
import { ApiError } from '../api/client.ts';
import { Button, ErrorMessage, Field, Notice } from '../components/ui.tsx';
import { PublicLayout } from '../components/Layout.tsx';

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

export function LoginForm({ heading }: { heading: 'h1' | 'h2' }) {
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

  const Heading = heading;

  return (
    <>
      <Heading className="mb-6 text-2xl font-bold">{t('auth.loginTitle')}</Heading>
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
