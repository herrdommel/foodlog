import { NavLink, Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Locale } from '@foodlog/shared';
import { useLogout, useMe } from '../api/hooks.ts';
import { setLocale } from '../i18n/index.ts';
import { Avatar } from './Avatar.tsx';
import { Logo } from './Logo.tsx';

export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  return (
    <select
      aria-label={t('common.language')}
      value={i18n.language}
      onChange={(event) => setLocale(event.target.value as Locale)}
      className="rounded-lg border border-fg/20 bg-raised px-2 py-1 text-sm"
    >
      <option value="de">DE</option>
      <option value="en">EN</option>
    </select>
  );
}

export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-8 px-4 py-8">
      <header className="flex items-center justify-between">
        <Logo />
        <LanguageSwitch />
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

export function AppLayout() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const logout = useLogout();
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-accent/20 text-fg' : 'hover:bg-fg/5'}`;
  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl px-4 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4 print:hidden">
        <Logo />
        <nav className="order-last flex w-full items-center gap-1 sm:order-none sm:w-auto">
          <NavLink to="/" end className={link}>
            {t('nav.dashboard')}
          </NavLink>
          <NavLink to="/analysis" className={link}>
            {t('nav.analysis')}
          </NavLink>
          <NavLink to="/ingredients" className={link}>
            {t('nav.ingredients')}
          </NavLink>
          <NavLink to="/profile" className={link}>
            {t('nav.profile')}
          </NavLink>
        </nav>
        <div className="flex items-center gap-3">
          {me && <Avatar user={me.user} />}
          <button
            type="button"
            onClick={() => logout.mutate()}
            className="text-sm font-medium hover:text-accent"
          >
            {t('common.logout')}
          </button>
        </div>
      </header>
      <main className="space-y-6 py-4">
        <Outlet />
      </main>
    </div>
  );
}
