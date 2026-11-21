import { useTranslation } from 'react-i18next';
import { useMe } from '../api/hooks.ts';
import { Card } from '../components/ui.tsx';

export function DashboardPage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  return (
    <>
      <h1 className="text-2xl font-bold">{t('dashboard.greeting', { name: me?.user.name })}</h1>
      <Card>
        <p className="text-fg/70">{t('dashboard.placeholder')}</p>
      </Card>
    </>
  );
}
