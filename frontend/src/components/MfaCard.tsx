import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MeResponse, PasskeyDto } from '@foodlog/shared';
import {
  useAddPasskey,
  useNewRecoveryCodes,
  useRemovePasskey,
  useRenamePasskey,
  useTotpConfirm,
  useTotpDisable,
  useTotpSetup,
} from '../api/hooks.ts';
import { passkeysSupported } from '../lib/passkeys.ts';
import { QrCode } from './QrCode.tsx';
import { ActionRow, Button, Card, ErrorMessage, Field, Notice } from './ui.tsx';

function PasswordField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  return (
    <Field
      label={t('mfa.passwordLabel')}
      type="password"
      autoComplete="current-password"
      required
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function Row({
  title,
  status,
  actions,
  children,
}: {
  title: string;
  status: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-3 border-t border-fg/10 pt-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-fg/75">{status}</p>
        </div>
        {actions && (
          <div className="flex flex-col gap-2 sm:flex-row [&>*]:w-full sm:[&>*]:w-auto">
            {actions}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function ConfirmForm({
  hasPassword,
  confirmLabel,
  pending,
  onConfirm,
  onCancel,
  children,
}: {
  hasPassword: boolean;
  confirmLabel: string;
  pending: boolean;
  onConfirm: (password: string | undefined) => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onConfirm(hasPassword ? password : undefined);
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      {children}
      {hasPassword && <PasswordField value={password} onChange={setPassword} />}
      <ActionRow columns={2}>
        <Button type="submit" disabled={pending}>
          {confirmLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </ActionRow>
    </form>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="space-y-3 rounded-xl border border-fg/10 p-4">
      <h3 className="font-semibold">{t('mfa.codes.title')}</h3>
      <p className="text-sm text-fg/75">{t('mfa.codes.savePrompt')}</p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      {copied && <Notice>{t('mfa.codes.copied')}</Notice>}
      <ActionRow columns={2}>
        <Button type="button" variant="secondary" onClick={copy}>
          {t('mfa.codes.copy')}
        </Button>
        <Button type="button" onClick={onDone}>
          {t('mfa.codes.saved')}
        </Button>
      </ActionRow>
    </div>
  );
}

function TotpSection({
  enabled,
  hasPassword,
  onCodes,
}: {
  enabled: boolean;
  hasPassword: boolean;
  onCodes: (codes: string[]) => void;
}) {
  const { t } = useTranslation();
  const setup = useTotpSetup();
  const confirm = useTotpConfirm();
  const disable = useTotpDisable();
  const [mode, setMode] = useState<'idle' | 'setup' | 'remove'>('idle');
  const [code, setCode] = useState('');

  const close = () => {
    setMode('idle');
    setCode('');
    setup.reset();
    confirm.reset();
    disable.reset();
  };

  const actions =
    mode !== 'idle' ? undefined : enabled ? (
      <Button
        type="button"
        variant="secondary"
        disabled={disable.isPending}
        onClick={() => (hasPassword ? setMode('remove') : disable.mutate({}))}
      >
        {t('mfa.totp.remove')}
      </Button>
    ) : (
      <Button
        type="button"
        variant="secondary"
        disabled={setup.isPending}
        onClick={() => setup.mutate(undefined, { onSuccess: () => setMode('setup') })}
      >
        {t('mfa.totp.setup')}
      </Button>
    );

  return (
    <Row
      title={t('mfa.totp.title')}
      status={enabled ? t('mfa.totp.active') : t('mfa.totp.off')}
      actions={actions}
    >
      <ErrorMessage error={setup.error ?? confirm.error ?? disable.error} />
      {mode === 'setup' && setup.data && (
        <ConfirmForm
          hasPassword={hasPassword}
          confirmLabel={t('mfa.totp.confirm')}
          pending={confirm.isPending}
          onCancel={close}
          onConfirm={(password) =>
            confirm.mutate(
              { code, password },
              {
                onSuccess: (result) => {
                  close();
                  if (result.recoveryCodes.length > 0) onCodes(result.recoveryCodes);
                },
              },
            )
          }
        >
          <p className="text-sm">{t('mfa.totp.scan')}</p>
          <QrCode value={setup.data.otpauthUrl} label={t('mfa.totp.qrLabel')} />
          <p className="text-sm">
            {t('mfa.totp.manual')} <code className="break-all font-mono">{setup.data.secret}</code>
          </p>
          <Field
            label={t('mfa.totp.codeLabel')}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </ConfirmForm>
      )}
      {mode === 'remove' && (
        <ConfirmForm
          hasPassword={hasPassword}
          confirmLabel={t('mfa.totp.remove')}
          pending={disable.isPending}
          onCancel={close}
          onConfirm={(password) => disable.mutate({ password }, { onSuccess: close })}
        />
      )}
    </Row>
  );
}

function PasskeyItem({ passkey, hasPassword }: { passkey: PasskeyDto; hasPassword: boolean }) {
  const { t, i18n } = useTranslation();
  const rename = useRenamePasskey();
  const remove = useRemovePasskey();
  const [mode, setMode] = useState<'idle' | 'rename' | 'remove'>('idle');
  const [name, setName] = useState(passkey.name);
  const format = (value: string) => new Date(value).toLocaleDateString(i18n.language);

  return (
    <li className="space-y-2 rounded-xl border border-fg/10 p-3">
      <ErrorMessage error={rename.error ?? remove.error} />
      {mode === 'rename' && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            rename.mutate({ id: passkey.id, name }, { onSuccess: () => setMode('idle') });
          }}
        >
          <Field
            label={t('mfa.passkeys.nameLabel')}
            maxLength={60}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <ActionRow columns={2}>
            <Button type="submit" disabled={rename.isPending}>
              {t('common.save')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setMode('idle')}>
              {t('common.cancel')}
            </Button>
          </ActionRow>
        </form>
      )}
      {mode === 'remove' && (
        <ConfirmForm
          hasPassword={hasPassword}
          confirmLabel={t('mfa.passkeys.removeShort')}
          pending={remove.isPending}
          onCancel={() => setMode('idle')}
          onConfirm={(password) => remove.mutate({ id: passkey.id, password })}
        />
      )}
      {mode === 'idle' && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">{passkey.name}</p>
            <p className="text-sm text-fg/75">
              {t('mfa.passkeys.added', { date: format(passkey.createdAt) })}
              {' · '}
              {passkey.lastUsedAt
                ? t('mfa.passkeys.lastUsed', { date: format(passkey.lastUsedAt) })
                : t('mfa.passkeys.neverUsed')}
              {passkey.backedUp ? ` · ${t('mfa.passkeys.synced')}` : ''}
            </p>
          </div>
          <div className="flex gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
            <Button
              type="button"
              variant="secondary"
              aria-label={t('mfa.passkeys.rename', { name: passkey.name })}
              onClick={() => setMode('rename')}
            >
              {t('mfa.passkeys.renameShort')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              aria-label={t('mfa.passkeys.remove', { name: passkey.name })}
              onClick={() => (hasPassword ? setMode('remove') : remove.mutate({ id: passkey.id }))}
            >
              {t('mfa.passkeys.removeShort')}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function PasskeySection({
  passkeys,
  hasPassword,
  onCodes,
}: {
  passkeys: PasskeyDto[];
  hasPassword: boolean;
  onCodes: (codes: string[]) => void;
}) {
  const { t } = useTranslation();
  const add = useAddPasskey();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const supported = passkeysSupported();

  const close = () => {
    setAdding(false);
    setName('');
    add.reset();
  };

  return (
    <Row
      title={t('mfa.passkeys.title')}
      status={
        !supported
          ? t('mfa.passkeys.unsupported')
          : passkeys.length > 0
            ? t('mfa.passkeys.count', { count: passkeys.length })
            : t('mfa.passkeys.none')
      }
      actions={
        supported && !adding ? (
          <Button type="button" variant="secondary" onClick={() => setAdding(true)}>
            {t('mfa.passkeys.add')}
          </Button>
        ) : undefined
      }
    >
      {passkeys.length > 0 && (
        <ul aria-label={t('mfa.passkeys.title')} className="space-y-2">
          {passkeys.map((passkey) => (
            <PasskeyItem key={passkey.id} passkey={passkey} hasPassword={hasPassword} />
          ))}
        </ul>
      )}
      {adding && (
        <>
          <ErrorMessage error={add.error} />
          <ConfirmForm
            hasPassword={hasPassword}
            confirmLabel={t('mfa.passkeys.create')}
            pending={add.isPending}
            onCancel={close}
            onConfirm={(password) =>
              add.mutate(
                { name: name.trim(), password },
                {
                  onSuccess: (result) => {
                    close();
                    if (result.recoveryCodes) onCodes(result.recoveryCodes);
                  },
                },
              )
            }
          >
            <Field
              label={t('mfa.passkeys.nameLabel')}
              hint={t('mfa.passkeys.nameHint')}
              maxLength={60}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </ConfirmForm>
        </>
      )}
    </Row>
  );
}

function RecoverySection({
  left,
  hasPassword,
  onCodes,
}: {
  left: number;
  hasPassword: boolean;
  onCodes: (codes: string[]) => void;
}) {
  const { t } = useTranslation();
  const renew = useNewRecoveryCodes();
  const [asking, setAsking] = useState(false);
  const create = (password: string | undefined) =>
    renew.mutate(
      { password },
      {
        onSuccess: (result) => {
          setAsking(false);
          onCodes(result.recoveryCodes);
        },
      },
    );
  return (
    <Row
      title={t('mfa.codes.heading')}
      status={t('mfa.codes.text', { count: left })}
      actions={
        asking ? undefined : (
          <Button
            type="button"
            variant="secondary"
            disabled={renew.isPending}
            onClick={() => (hasPassword ? setAsking(true) : create(undefined))}
          >
            {t('mfa.codes.renew')}
          </Button>
        )
      }
    >
      <ErrorMessage error={renew.error} />
      {asking && (
        <ConfirmForm
          hasPassword={hasPassword}
          confirmLabel={t('mfa.codes.renew')}
          pending={renew.isPending}
          onCancel={() => setAsking(false)}
          onConfirm={create}
        />
      )}
    </Row>
  );
}

export function MfaCard({ me }: { me: MeResponse }) {
  const { t } = useTranslation();
  const { mfa, user } = me;
  const [codes, setCodes] = useState<string[] | null>(null);

  return (
    <Card title={t('mfa.title')}>
      <p className="text-sm text-fg/75">{t('mfa.text')}</p>
      {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />}
      <TotpSection enabled={mfa.totp} hasPassword={user.hasPassword} onCodes={setCodes} />
      <PasskeySection passkeys={mfa.passkeys} hasPassword={user.hasPassword} onCodes={setCodes} />
      {mfa.enabled && (
        <RecoverySection
          left={mfa.recoveryCodesLeft}
          hasPassword={user.hasPassword}
          onCodes={setCodes}
        />
      )}
    </Card>
  );
}
