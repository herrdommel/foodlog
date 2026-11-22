import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { LOCALES, PRESET_AVATAR_COUNT, type Locale, type PublicUser } from '@foodlog/shared';
import {
  useMe,
  useDeleteAccount,
  useRequestEmailChange,
  useRequestPasswordReset,
  useUpdateProfile,
  useUploadAvatar,
} from '../api/hooks.ts';
import { Avatar } from '../components/Avatar.tsx';
import { PresetAvatar } from '../components/presetAvatars.tsx';
import {
  ActionRow,
  Button,
  Card,
  ErrorMessage,
  Field,
  Notice,
  SelectField,
} from '../components/ui.tsx';
import { setLocale } from '../i18n/index.ts';

const timezones = Intl.supportedValuesOf('timeZone');

function AccountCard({ user }: { user: PublicUser }) {
  const { t } = useTranslation();
  return (
    <Card title={t('profile.account')}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-fg/75">{t('common.email')}</dt>
        <dd>{user.email}</dd>
        <dt className="text-fg/75">{t('profile.role')}</dt>
        <dd>{t(`profile.roles.${user.role}`)}</dd>
        {user.googleLinked && (
          <>
            <dt className="text-fg/75">Google</dt>
            <dd>{t('profile.googleLinked')}</dd>
          </>
        )}
      </dl>
    </Card>
  );
}

function PreferencesCard({ user }: { user: PublicUser }) {
  const { t } = useTranslation();
  const update = useUpdateProfile();
  const [name, setName] = useState(user.name);
  const [locale, setLocaleState] = useState<Locale>(user.locale);
  const [timezone, setTimezone] = useState(user.timezone);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    update.mutate({ name, locale, timezone }, { onSuccess: (data) => setLocale(data.user.locale) });
  };

  return (
    <Card title={t('profile.preferences')}>
      <form onSubmit={submit} className="space-y-4">
        <ErrorMessage error={update.error} />
        <Field
          label={t('common.name')}
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <SelectField
          label={t('common.language')}
          value={locale}
          onChange={(event) => setLocaleState(event.target.value as Locale)}
          className="w-full rounded-lg border border-fg/20 bg-raised px-3 py-2"
        >
          {LOCALES.map((value) => (
            <option key={value} value={value}>
              {value === 'de' ? 'Deutsch' : 'English'}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('profile.timezone')}
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
          className="w-full rounded-lg border border-fg/20 bg-raised px-3 py-2"
        >
          {timezones.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </SelectField>
        <div className="grid items-center gap-2 sm:flex sm:gap-3 [&>button]:w-full sm:[&>button]:w-auto">
          <Button type="submit" disabled={update.isPending}>
            {t('common.save')}
          </Button>
          {update.isSuccess && <span className="text-sm text-accent">{t('common.saved')}</span>}
        </div>
      </form>
    </Card>
  );
}

function AvatarCard({ user }: { user: PublicUser }) {
  const { t } = useTranslation();
  const update = useUpdateProfile();
  const upload = useUploadAvatar();
  const input = useRef<HTMLInputElement>(null);
  const error = update.error ?? upload.error;

  return (
    <Card title={t('profile.avatar')}>
      <ErrorMessage error={error} />
      <div className="flex items-center gap-4">
        <Avatar user={user} className="h-20 w-20" />
        <div className="space-y-1">
          <Button type="button" variant="secondary" onClick={() => input.current?.click()}>
            {t('profile.uploadAvatar')}
          </Button>
          <p className="text-xs text-fg/75">{t('profile.uploadHint')}</p>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            data-testid="avatar-file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload.mutate(file);
              event.target.value = '';
            }}
          />
        </div>
      </div>
      <div className="grid grid-cols-6 gap-3">
        {Array.from({ length: PRESET_AVATAR_COUNT }, (_, i) => i + 1).map((index) => (
          <button
            key={index}
            type="button"
            aria-label={t('profile.avatarChoose', { index })}
            aria-pressed={user.avatar === `preset:${index}`}
            onClick={() => update.mutate({ avatar: `preset:${index}` })}
            className="overflow-hidden rounded-full ring-offset-2 ring-offset-raised aria-pressed:ring-2 aria-pressed:ring-accent hover:ring-2 hover:ring-accent/50"
          >
            <PresetAvatar index={index} className="aspect-square w-full" />
          </button>
        ))}
      </div>
    </Card>
  );
}

function EmailCard({ user }: { user: PublicUser }) {
  const { t } = useTranslation();
  const request = useRequestEmailChange();
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    request.mutate({ newEmail, password: user.hasPassword ? password : undefined });
  };

  return (
    <Card title={t('profile.emailTitle')}>
      {request.isSuccess ? (
        <Notice>{t(user.hasPassword ? 'profile.emailSent' : 'profile.emailApprovalSent')}</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <ErrorMessage error={request.error} />
          <Field
            label={t('profile.newEmail')}
            type="email"
            autoComplete="email"
            required
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
          />
          {user.hasPassword && (
            <Field
              label={t('profile.currentPassword')}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
          <Button type="submit" disabled={request.isPending} className="w-full sm:w-auto">
            {t('profile.requestChange')}
          </Button>
        </form>
      )}
    </Card>
  );
}

function PasswordCard() {
  const { t } = useTranslation();
  const reset = useRequestPasswordReset();
  return (
    <Card title={t('profile.passwordTitle')}>
      <p className="text-sm text-fg/75">{t('profile.passwordText')}</p>
      <ErrorMessage error={reset.error} />
      {reset.isSuccess ? (
        <Notice>{t('profile.passwordSent')}</Notice>
      ) : (
        <Button
          type="button"
          onClick={() => reset.mutate()}
          disabled={reset.isPending}
          className="w-full sm:w-auto"
        >
          {t('profile.sendResetLink')}
        </Button>
      )}
    </Card>
  );
}

function DataCard() {
  const { t } = useTranslation();
  return (
    <Card title={t('profile.data.title')}>
      <p className="text-sm text-fg/75">{t('profile.data.text')}</p>
      <a
        href="/api/me/export"
        download
        className="block rounded-lg border border-fg/20 bg-raised px-4 py-2 text-center font-medium hover:border-accent sm:inline-block"
      >
        {t('profile.data.export')}
      </a>
    </Card>
  );
}

function DeleteCard({ user }: { user: PublicUser }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const remove = useDeleteAccount();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    remove.mutate(
      { confirmEmail: email, password: user.hasPassword ? password : undefined },
      { onSuccess: () => navigate('/login', { replace: true }) },
    );
  };

  return (
    <Card title={t('profile.delete.title')}>
      <p className="text-sm text-fg/75">{t('profile.delete.text')}</p>
      {!open ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen(true)}
          className="w-full sm:w-auto"
        >
          {t('profile.delete.start')}
        </Button>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <ErrorMessage error={remove.error} />
          <Field
            label={t('profile.delete.confirmEmail')}
            type="email"
            autoComplete="off"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {user.hasPassword && (
            <Field
              label={t('profile.delete.password')}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
          <ActionRow columns={2}>
            <Button type="submit" disabled={remove.isPending}>
              {t('profile.delete.submit')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t('profile.delete.cancel')}
            </Button>
          </ActionRow>
        </form>
      )}
    </Card>
  );
}

export function ProfilePage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  if (!me) return null;
  return (
    <>
      <h1 className="text-2xl font-bold">{t('profile.title')}</h1>
      <AccountCard user={me.user} />
      <PreferencesCard user={me.user} />
      <AvatarCard user={me.user} />
      <EmailCard user={me.user} />
      <PasswordCard />
      <DataCard />
      <DeleteCard user={me.user} />
    </>
  );
}
