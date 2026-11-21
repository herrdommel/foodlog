import { useTranslation } from 'react-i18next';
import {
  useAdminAudit,
  useAdminSettings,
  useUpdateFeature,
  useUpdateSettings,
} from '../../api/hooks.ts';
import { Card, ErrorMessage } from '../../components/ui.tsx';

function RegistrationCard() {
  const { t } = useTranslation();
  const settings = useAdminSettings();
  const update = useUpdateSettings();
  return (
    <Card title={t('admin.settings.registrationTitle')}>
      <ErrorMessage error={settings.error ?? update.error} />
      {settings.data && (
        <>
          <label className="flex items-center gap-3 font-medium">
            <input
              type="checkbox"
              checked={settings.data.publicRegistration}
              disabled={update.isPending}
              onChange={(event) => update.mutate({ publicRegistration: event.target.checked })}
              className="h-5 w-5"
            />
            {t('admin.settings.publicRegistration')}
          </label>
          <p className="text-sm text-fg/75">{t('admin.settings.registrationHint')}</p>
        </>
      )}
    </Card>
  );
}

function FeaturesCard() {
  const { t } = useTranslation();
  const settings = useAdminSettings();
  const update = useUpdateFeature();
  return (
    <Card title={t('admin.settings.featuresTitle')}>
      <p className="text-sm text-fg/75">{t('admin.settings.featuresText')}</p>
      <ErrorMessage error={update.error} />
      {settings.data && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('admin.settings.featuresTitle')}</caption>
            <thead>
              <tr className="border-b border-fg/20 text-fg/75">
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('admin.settings.feature')}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t('admin.settings.enabled')}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {t('admin.settings.defaultForUsers')}
                </th>
              </tr>
            </thead>
            <tbody>
              {settings.data.features.map((feature) => {
                const name = t(`admin.features.${feature.key}`);
                return (
                  <tr key={feature.key} className="border-b border-fg/10">
                    <th scope="row" className="py-3 pr-3 font-medium">
                      {name}
                    </th>
                    <td className="py-3 pr-3">
                      <input
                        type="checkbox"
                        aria-label={`${name}: ${t('admin.settings.enabled')}`}
                        checked={feature.enabled}
                        disabled={update.isPending}
                        onChange={(event) =>
                          update.mutate({
                            key: feature.key,
                            body: { enabled: event.target.checked },
                          })
                        }
                        className="h-5 w-5"
                      />
                    </td>
                    <td className="py-3">
                      <input
                        type="checkbox"
                        aria-label={`${name}: ${t('admin.settings.defaultForUsers')}`}
                        checked={feature.defaultForUsers}
                        disabled={update.isPending || !feature.enabled}
                        onChange={(event) =>
                          update.mutate({
                            key: feature.key,
                            body: { defaultForUsers: event.target.checked },
                          })
                        }
                        className="h-5 w-5"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function AuditCard() {
  const { t, i18n } = useTranslation();
  const audit = useAdminAudit();
  const format = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' });
  return (
    <Card title={t('admin.settings.auditTitle')}>
      <ErrorMessage error={audit.error} />
      {audit.data?.length === 0 && <p className="text-fg/75">{t('admin.settings.auditEmpty')}</p>}
      <ul className="divide-y divide-fg/10 text-sm">
        {audit.data?.map((entry) => (
          <li key={entry.id} className="space-y-0.5 py-2">
            <p>
              <span className="font-medium">
                {i18n.exists(`admin.settings.actions.${entry.action}`)
                  ? t(`admin.settings.actions.${entry.action}`)
                  : entry.action}
              </span>
              {entry.target && <span className="text-fg/75">: {entry.target}</span>}
            </p>
            <p className="text-fg/75">
              {entry.actor ?? '–'} · {format.format(new Date(entry.createdAt))}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function AdminSettingsPage() {
  return (
    <>
      <RegistrationCard />
      <FeaturesCard />
      <AuditCard />
    </>
  );
}
