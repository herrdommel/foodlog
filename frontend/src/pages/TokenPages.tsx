import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { UseMutationResult } from '@tanstack/react-query';
import {
  useConfirmEmailChange,
  useForgotPassword,
  useResetPassword,
  useVerifyEmail,
} from '../api/hooks.ts';
import { Button, ErrorMessage, Field, Notice } from '../components/ui.tsx';
import { PublicLayout } from '../components/Layout.tsx';

function BackLink() {
  const { t } = useTranslation();
  return (
    <p className="mt-6 text-sm">
      <Link to="/login" className="text-accent hover:underline">
        {t('common.back')}
      </Link>
    </p>
  );
}

function ConsumeTokenPage({
  title,
  pendingText,
  doneText,
  mutation,
}: {
  title: string;
  pendingText: string;
  doneText: string;
  mutation: UseMutationResult<unknown, Error, string>;
}) {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token');
  const started = useRef(false);
  const { mutate } = mutation;

  useEffect(() => {
    if (token && !started.current) {
      started.current = true;
      mutate(token);
    }
  }, [token, mutate]);

  return (
    <PublicLayout>
      <h1 className="mb-6 text-2xl font-bold">{title}</h1>
      {!token ? (
        <ErrorMessage error="invalid_token" />
      ) : mutation.isError ? (
        <ErrorMessage error={mutation.error} />
      ) : mutation.isSuccess ? (
        <Notice>{doneText}</Notice>
      ) : (
        <Notice>{pendingText || t('common.loading')}</Notice>
      )}
      <BackLink />
    </PublicLayout>
  );
}

export function VerifyEmailPage() {
  const { t } = useTranslation();
  return (
    <ConsumeTokenPage
      title={t('profile.emailConfirmTitle')}
      pendingText={t('auth.verifying')}
      doneText={t('auth.verified')}
      mutation={useVerifyEmail()}
    />
  );
}

export function ConfirmEmailChangePage() {
  const { t } = useTranslation();
  const mutation = useConfirmEmailChange();
  return (
    <ConsumeTokenPage
      title={t('profile.emailConfirmTitle')}
      pendingText={t('auth.verifying')}
      doneText={t(
        mutation.data?.status === 'verification_sent'
          ? 'profile.emailApproved'
          : 'profile.emailConfirmed',
      )}
      mutation={mutation}
    />
  );
}

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const forgot = useForgotPassword();
  const [email, setEmail] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    forgot.mutate(email);
  };

  return (
    <PublicLayout>
      <h1 className="mb-2 text-2xl font-bold">{t('auth.forgotTitle')}</h1>
      <p className="mb-6 text-sm text-fg/75">{t('auth.forgotText')}</p>
      {forgot.isSuccess ? (
        <Notice>{t('auth.forgotSent')}</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <ErrorMessage error={forgot.error} />
          <Field
            label={t('common.email')}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button type="submit" disabled={forgot.isPending} className="w-full">
            {t('auth.sendLink')}
          </Button>
        </form>
      )}
      <BackLink />
    </PublicLayout>
  );
}

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token');
  const reset = useResetPassword();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = confirm !== '' && password !== confirm;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (token && !mismatch) reset.mutate({ token, password });
  };

  return (
    <PublicLayout>
      <h1 className="mb-6 text-2xl font-bold">{t('auth.resetTitle')}</h1>
      {!token ? (
        <ErrorMessage error="invalid_token" />
      ) : reset.isSuccess ? (
        <Notice>{t('auth.resetDone')}</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <ErrorMessage error={reset.error} />
          <Field
            label={t('auth.newPassword')}
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
            hint={t('auth.passwordHint')}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Field
            label={t('auth.confirmPassword')}
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
          {mismatch && (
            <p role="alert" className="text-sm">
              {t('auth.passwordMismatch')}
            </p>
          )}
          <Button type="submit" disabled={reset.isPending || mismatch} className="w-full">
            {t('common.save')}
          </Button>
        </form>
      )}
      <BackLink />
    </PublicLayout>
  );
}
