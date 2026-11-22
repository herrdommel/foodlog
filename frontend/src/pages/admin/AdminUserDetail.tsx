import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { AdminUserDetailDto } from '@foodlog/shared';
import {
  useAdminResetLink,
  useAdminUser,
  useMe,
  useSetUserFeature,
  useUpdateAdminUser,
} from '../../api/hooks.ts';
import { CopyField } from '../../components/admin/CopyField.tsx';
import {
  ActionRow,
  Button,
  Card,
  ErrorMessage,
  Field,
  Notice,
  SelectField,
} from '../../components/ui.tsx';
import { UserStatus } from './AdminUsers.tsx';

function ProfileCard({ user, isSelf }: { user: AdminUserDetailDto; isSelf: boolean }) {
  const { t } = useTranslation();
  const update = useUpdateAdminUser(user.id);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState(user.role);
  const [confirming, setConfirming] = useState(false);

  const changes = {
    ...(name.trim() !== user.name && { name: name.trim() }),
    ...(email.trim().toLowerCase() !== user.email && { email: email.trim() }),
    ...(role !== user.role && { role }),
  };
  const dirty = Object.keys(changes).length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (dirty) update.mutate(changes);
  };

  return (
    <Card title={t('admin.detail.profile')}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorMessage error={update.error} />
        <Field
          label={t('admin.users.name')}
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Field
          label={t('admin.users.email')}
          type="email"
          required
          hint={t('admin.detail.emailHint')}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <SelectField
          label={t('admin.users.role')}
          value={role}
          disabled={isSelf}
          onChange={(event) => setRole(event.target.value as 'user' | 'admin')}
        >
          <option value="user">{t('admin.roles.user')}</option>
          <option value="admin">{t('admin.roles.admin')}</option>
        </SelectField>
        {isSelf && <p className="text-sm text-fg/75">{t('admin.detail.selfHint')}</p>}
        <div className="grid items-center gap-2 sm:flex sm:gap-3 [&>button]:w-full sm:[&>button]:w-auto">
          <Button type="submit" disabled={!dirty || update.isPending} className="w-full sm:w-auto">
            {t('admin.detail.save')}
          </Button>
          {update.isSuccess && !dirty && (
            <span className="text-sm text-accent">{t('admin.detail.saved')}</span>
          )}
        </div>
      </form>

      <div className="space-y-2 border-t border-fg/10 pt-4">
        {confirming ? (
          <>
            <p className="text-sm">{t('admin.detail.confirmDeactivate', { name: user.name })}</p>
            <ActionRow columns={2}>
              <Button
                type="button"
                onClick={() =>
                  update.mutate({ active: false }, { onSuccess: () => setConfirming(false) })
                }
                disabled={update.isPending}
              >
                {t('admin.detail.confirm')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
                {t('admin.detail.cancel')}
              </Button>
            </ActionRow>
          </>
        ) : user.active ? (
          <Button
            type="button"
            variant="secondary"
            disabled={isSelf}
            onClick={() => setConfirming(true)}
            className="w-full sm:w-auto"
          >
            {t('admin.detail.deactivate')}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => update.mutate({ active: true })}
            disabled={update.isPending}
            className="w-full sm:w-auto"
          >
            {t('admin.detail.activate')}
          </Button>
        )}
      </div>
    </Card>
  );
}

function ResetCard({ user }: { user: AdminUserDetailDto }) {
  const { t } = useTranslation();
  const reset = useAdminResetLink(user.id);
  return (
    <Card title={t('admin.detail.resetTitle')}>
      <p className="text-sm text-fg/75">{t('admin.detail.resetText')}</p>
      <ErrorMessage error={reset.error} />
      <ActionRow>
        <Button
          type="button"
          onClick={() => reset.mutate('email')}
          disabled={!user.active || reset.isPending}
        >
          {t('admin.detail.sendEmail')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => reset.mutate('link')}
          disabled={!user.active || reset.isPending}
        >
          {t('admin.detail.createLink')}
        </Button>
      </ActionRow>
      {reset.data?.delivery === 'email' && <Notice>{t('admin.detail.emailSent')}</Notice>}
      {reset.data?.link && (
        <CopyField label={t('admin.detail.linkCreated')} value={reset.data.link} />
      )}
    </Card>
  );
}

function FeaturesCard({ user }: { user: AdminUserDetailDto }) {
  const { t } = useTranslation();
  const setFeature = useSetUserFeature(user.id);
  return (
    <Card title={t('admin.detail.featuresTitle')}>
      <p className="text-sm text-fg/75">{t('admin.detail.featuresText')}</p>
      <ErrorMessage error={setFeature.error} />
      <ul className="space-y-4">
        {user.features.map((feature) => {
          const value = feature.override === null ? 'default' : feature.override ? 'on' : 'off';
          return (
            <li key={feature.key} className="grid items-end gap-2 sm:grid-cols-[1fr_auto]">
              <SelectField
                label={t(`admin.features.${feature.key}`)}
                value={value}
                onChange={(event) =>
                  setFeature.mutate({
                    key: feature.key,
                    enabled: event.target.value === 'default' ? null : event.target.value === 'on',
                  })
                }
              >
                <option value="default">{t('admin.detail.featureDefault')}</option>
                <option value="on">{t('admin.detail.featureOn')}</option>
                <option value="off">{t('admin.detail.featureOff')}</option>
              </SelectField>
              <p className="pb-2 text-sm text-fg/75">
                {feature.globalEnabled
                  ? t('admin.detail.effective', {
                      value: feature.effective
                        ? t('admin.detail.featureOn')
                        : t('admin.detail.featureOff'),
                    })
                  : t('admin.detail.globallyOff')}
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function FactsCard({ user }: { user: AdminUserDetailDto }) {
  const { t, i18n } = useTranslation();
  const yesNo = (value: boolean) => (value ? t('admin.detail.yes') : t('admin.detail.no'));
  return (
    <Card title={t('admin.detail.facts')}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-fg/75">{t('admin.users.status')}</dt>
        <dd>
          <UserStatus user={user} />
        </dd>
        <dt className="text-fg/75">{t('admin.users.created')}</dt>
        <dd>
          {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
            new Date(user.createdAt),
          )}
        </dd>
        <dt className="text-fg/75">{t('admin.users.entries')}</dt>
        <dd>{user.entryCount}</dd>
        <dt className="text-fg/75">{t('admin.detail.verified')}</dt>
        <dd>{yesNo(user.emailVerified)}</dd>
        <dt className="text-fg/75">{t('admin.detail.password')}</dt>
        <dd>{yesNo(user.hasPassword)}</dd>
        <dt className="text-fg/75">{t('admin.detail.google')}</dt>
        <dd>{yesNo(user.googleLinked)}</dd>
        <dt className="text-fg/75">{t('admin.detail.language')}</dt>
        <dd>{user.locale.toUpperCase()}</dd>
        <dt className="text-fg/75">{t('admin.detail.timezone')}</dt>
        <dd>{user.timezone}</dd>
      </dl>
    </Card>
  );
}

export function AdminUserDetailPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { data: me } = useMe();
  const user = useAdminUser(id);

  return (
    <>
      <Link to="/admin/users" className="text-sm font-medium text-accent hover:underline">
        {t('admin.detail.back')}
      </Link>
      <ErrorMessage error={user.error} />
      {user.data && (
        <>
          <h2 className="text-xl font-semibold">{user.data.name}</h2>
          <FactsCard user={user.data} />
          <ProfileCard user={user.data} isSelf={me?.user.id === user.data.id} />
          <ResetCard user={user.data} />
          <FeaturesCard user={user.data} />
        </>
      )}
    </>
  );
}
