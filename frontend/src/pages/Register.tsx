import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Trans, useTranslation } from 'react-i18next';
import type { Locale } from '@foodlog/shared';
import { useAuthConfig, useRegister } from '../api/hooks.ts';
import { Button, ErrorMessage, Field, Notice } from '../components/ui.tsx';
import { PublicLayout } from '../components/Layout.tsx';
import { GoogleButton } from './Login.tsx';

export function RegisterPage() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const invite = params.get('invite');
  const config = useAuthConfig();
  const register = useRegister();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!accepted) return;
    register.mutate({
      name,
      email,
      password,
      locale: i18n.language as Locale,
      inviteToken: invite ?? undefined,
      acceptPrivacy: true,
    });
  };

  const closed = config.data && !config.data.publicRegistration && !invite;

  return (
    <PublicLayout>
      <h1 className="mb-6 text-2xl font-bold">{t('auth.registerTitle')}</h1>
      {closed ? (
        <Notice>{t('auth.inviteRequired')}</Notice>
      ) : register.isSuccess ? (
        <Notice>{t('auth.checkMail')}</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <ErrorMessage error={register.error} />
          <Field
            label={t('common.name')}
            autoComplete="name"
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
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
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
            hint={t('auth.passwordHint')}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              required
              className="mt-1"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            <span>
              <Trans
                i18nKey="auth.acceptPrivacy"
                components={{
                  privacy: (
                    <Link
                      to="/privacy"
                      target="_blank"
                      rel="noopener"
                      className="text-accent underline"
                    />
                  ),
                }}
              />
            </span>
          </label>
          <Button type="submit" disabled={register.isPending || !accepted} className="w-full">
            {t('auth.register')}
          </Button>
          {config.data?.googleLogin && (
            <>
              <p className="text-center text-sm text-fg/75">{t('common.or')}</p>
              <GoogleButton invite={invite} consent={accepted} disabled={!accepted} />
            </>
          )}
        </form>
      )}
      <p className="mt-6 text-sm">
        <Link to="/login" className="text-accent hover:underline">
          {t('common.back')}
        </Link>
      </p>
    </PublicLayout>
  );
}
