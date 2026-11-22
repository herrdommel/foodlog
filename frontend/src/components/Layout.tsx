import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
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

export function LegalLinks() {
  const { t } = useTranslation();
  return (
    <footer className="mt-auto py-6 text-center text-sm text-fg/75 print:hidden">
      <nav aria-label={t('legal.footer')} className="flex justify-center gap-4">
        <Link to="/privacy" className="hover:underline">
          {t('legal.privacy')}
        </Link>
        <Link to="/imprint" className="hover:underline">
          {t('legal.imprint')}
        </Link>
      </nav>
    </footer>
  );
}

export function PublicLayout({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`mx-auto flex min-h-screen w-full flex-col gap-8 px-4 py-8 ${wide ? 'max-w-3xl' : 'max-w-md'}`}
    >
      <header className="flex items-center justify-between">
        <Logo />
        <LanguageSwitch />
      </header>
      <main className="flex-1">{children}</main>
      <LegalLinks />
    </div>
  );
}

export function AppLayout() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const logout = useLogout();
  const nav = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    nav.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }, [pathname]);
  const link = ({ isActive }: { isActive: boolean }) =>
    `shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-accent/20 text-fg' : 'hover:bg-fg/5'}`;
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4 print:hidden">
        <Logo />
        <nav
          ref={nav}
          className="order-last flex w-full items-center gap-1 overflow-x-auto [scrollbar-width:none] sm:order-none sm:w-auto [&::-webkit-scrollbar]:hidden"
        >
          <NavLink to="/" end className={link}>
            {t('nav.dashboard')}
          </NavLink>
          <NavLink to="/analysis" className={link}>
            {t('nav.analysis')}
          </NavLink>
          {me?.features.ai_analysis && (
            <NavLink to="/ai" className={link}>
              {t('nav.ai')}
            </NavLink>
          )}
          <NavLink to="/ingredients" className={link}>
            {t('nav.ingredients')}
          </NavLink>
          <NavLink to="/profile" className={link}>
            {t('nav.profile')}
          </NavLink>
          {me?.user.role === 'admin' && (
            <NavLink to="/admin" className={link}>
              {t('nav.admin')}
            </NavLink>
          )}
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
      <main className="flex-1 space-y-6 py-4">
        <Outlet />
      </main>
      <LegalLinks />
    </div>
  );
}
