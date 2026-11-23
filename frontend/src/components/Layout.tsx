import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  IconBrandGithub,
  IconChevronDown,
  IconInfoCircle,
  IconLicense,
  IconShieldLock,
} from '@tabler/icons-react';
import { useLogout, useMe } from '../api/hooks.ts';
import { setLocale } from '../i18n/index.ts';
import { Avatar } from './Avatar.tsx';
import { LanguageSelect } from './LanguageSelect.tsx';
import { Logo } from './Logo.tsx';

const SOURCE_URL = 'https://github.com/herrdommel/foodlog';

export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  return (
    <LanguageSelect
      variant="compact"
      label={t('common.language')}
      value={i18n.language.startsWith('de') ? 'de' : 'en'}
      onChange={setLocale}
    />
  );
}

export function LegalLinks() {
  const { t } = useTranslation();
  return (
    <footer className="mt-auto py-6 text-center text-sm text-fg/75 print:hidden">
      <nav aria-label={t('legal.footer')} className="flex flex-wrap justify-center gap-x-5 gap-y-2">
        <Link to="/privacy" className="inline-flex items-center gap-1.5 hover:underline">
          <IconShieldLock size={16} aria-hidden="true" />
          {t('legal.privacy')}
        </Link>
        <Link to="/imprint" className="inline-flex items-center gap-1.5 hover:underline">
          <IconInfoCircle size={16} aria-hidden="true" />
          {t('legal.imprint')}
        </Link>
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 hover:underline"
        >
          <IconBrandGithub size={16} aria-hidden="true" />
          {t('legal.source')}
        </a>
        <a
          href="/licenses/third-party-notices.txt"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 hover:underline"
        >
          <IconLicense size={16} aria-hidden="true" />
          {t('legal.thirdParty')}
        </a>
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

function AccountMenu() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const logout = useLogout();
  const { pathname } = useLocation();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;
  const setOpen = (value: boolean) => setOpenFor(value ? pathname : null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return;
        trigger.current?.focus();
      } else if (root.current?.contains(event.target as Node)) {
        return;
      }
      setOpenFor(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!me) return null;
  const item = 'block w-full rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-fg/5';
  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-label={t('nav.account')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2 hover:bg-fg/5"
      >
        <Avatar user={me.user} />
        <IconChevronDown
          size={16}
          aria-hidden="true"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-fg/10 bg-raised p-2 shadow-lg">
          <p className="truncate px-3 py-1 text-sm font-semibold">{me.user.name}</p>
          <p className="break-all px-3 pb-2 text-xs text-fg/75">{me.user.email}</p>
          <div className="border-t border-fg/10 pt-2">
            <Link to="/ingredients" className={item}>
              {t('nav.ingredients')}
            </Link>
            <Link to="/profile" className={item}>
              {t('nav.profile')}
            </Link>
            {me.user.role === 'admin' && (
              <Link to="/admin" className={item}>
                {t('nav.admin')}
              </Link>
            )}
            <button type="button" onClick={() => logout.mutate()} className={item}>
              {t('common.logout')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const { t } = useTranslation();
  const { data: me } = useMe();
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
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-8">
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
        </nav>
        <AccountMenu />
      </header>
      <main className="flex-1 space-y-6 py-4">
        <Outlet />
      </main>
      <LegalLinks />
    </div>
  );
}
