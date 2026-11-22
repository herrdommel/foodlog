import { NavLink, Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';

export function AdminLayout() {
  const { t } = useTranslation();
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-accent/20 text-fg' : 'hover:bg-fg/5'}`;
  return (
    <>
      <div>
        <h1 className="text-2xl font-bold">{t('admin.title')}</h1>
        <nav
          aria-label={t('admin.title')}
          className="mt-3 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <NavLink to="/admin/users" className={link}>
            {t('admin.tabs.users')}
          </NavLink>
          <NavLink to="/admin/invites" className={link}>
            {t('admin.tabs.invites')}
          </NavLink>
          <NavLink to="/admin/settings" className={link}>
            {t('admin.tabs.settings')}
          </NavLink>
        </nav>
      </div>
      <Outlet />
    </>
  );
}
