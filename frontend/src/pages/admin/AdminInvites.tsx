import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreatedInviteDto } from '@foodlog/shared';
import { useAdminInvites, useCreateInvite, useRevokeInvite } from '../../api/hooks.ts';
import { CopyField } from '../../components/admin/CopyField.tsx';
import { Button, Card, ErrorMessage, Field, Notice } from '../../components/ui.tsx';

function CreateCard() {
  const { t } = useTranslation();
  const create = useCreateInvite();
  const [email, setEmail] = useState('');
  const [sendMail, setSendMail] = useState(false);
  const [days, setDays] = useState(14);
  const [created, setCreated] = useState<CreatedInviteDto | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      {
        email: email.trim() || undefined,
        sendMail: sendMail && email.trim() !== '',
        expiresInDays: days,
      },
      {
        onSuccess: (invite) => {
          setCreated(invite);
          setEmail('');
          setSendMail(false);
        },
      },
    );
  };

  return (
    <Card title={t('admin.invites.createTitle')}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorMessage error={create.error} />
        <Field
          label={t('admin.invites.email')}
          type="email"
          hint={t('admin.invites.emailHint')}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={sendMail}
            disabled={email.trim() === ''}
            onChange={(event) => setSendMail(event.target.checked)}
          />
          {t('admin.invites.sendMail')}
        </label>
        <Field
          label={t('admin.invites.expires')}
          type="number"
          min={1}
          max={30}
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
        />
        <Button type="submit" disabled={create.isPending}>
          {t('admin.invites.create')}
        </Button>
      </form>
      {created && (
        <div className="space-y-3">
          <CopyField label={t('admin.invites.created')} value={created.link} />
          {created.email && (
            <Notice>
              {created.emailSent ? t('admin.invites.mailSent') : t('admin.invites.mailNotSent')}
            </Notice>
          )}
        </div>
      )}
    </Card>
  );
}

function ListCard() {
  const { t, i18n } = useTranslation();
  const invites = useAdminInvites();
  const revoke = useRevokeInvite();
  const format = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });

  return (
    <Card title={t('admin.invites.listTitle')}>
      <ErrorMessage error={invites.error ?? revoke.error} />
      {invites.data?.length === 0 && <p className="text-fg/75">{t('admin.invites.empty')}</p>}
      <ul className="divide-y divide-fg/10">
        {invites.data?.map((invite) => {
          const label = invite.email ?? t('admin.invites.anyone');
          return (
            <li
              key={invite.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            >
              <div className="space-y-0.5">
                <p className="font-medium">
                  {t('admin.invites.forEmail')} {label}
                </p>
                <p className="text-fg/75">
                  {t('admin.invites.expiresAt')} {format.format(new Date(invite.expiresAt))}
                  {invite.usedByEmail &&
                    ` · ${t('admin.invites.usedBy', { email: invite.usedByEmail })}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-fg/10 px-2.5 py-0.5 text-xs font-semibold">
                  {t(`admin.invites.status.${invite.status}`)}
                </span>
                {invite.status !== 'used' && (
                  <button
                    type="button"
                    aria-label={t('admin.invites.revokeAria', { name: label })}
                    onClick={() => revoke.mutate(invite.id)}
                    className="font-medium text-accent hover:underline"
                  >
                    {t('admin.invites.revoke')}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function AdminInvitesPage() {
  return (
    <>
      <CreateCard />
      <ListCard />
    </>
  );
}
