import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
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

  const submit = (event: FormEvent) => {
    event.preventDefault();
    register.mutate({
      name,
      email,
      password,
      locale: i18n.language as Locale,
      inviteToken: invite ?? undefined,
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
          <Button type="submit" disabled={register.isPending} className="w-full">
            {t('auth.register')}
          </Button>
          {config.data?.googleLogin && (
            <>
              <p className="text-center text-sm text-fg/60">{t('common.or')}</p>
              <GoogleButton invite={invite} />
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
