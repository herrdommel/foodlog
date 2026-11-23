import { Children, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthConfig } from '../api/hooks.ts';
import { LanguageSwitch, LegalLinks } from '../components/Layout.tsx';
import { Logo } from '../components/Logo.tsx';
import { Modal } from '../components/Modal.tsx';
import { Button } from '../components/ui.tsx';
import { useMediaQuery } from '../lib/useMediaQuery.ts';
import { LoginForm } from './Login.tsx';

const STEPS = ['log', 'find', 'share'] as const;
const FEATURES = ['timeline', 'ingredients', 'analysis', 'context', 'report', 'ai'] as const;
const SHOTS = ['dashboard', 'analysis', 'report'] as const;

const SLIDE = 'w-[82vw] shrink-0 snap-center md:w-auto';

function Swipe({
  as: Tag = 'div',
  label,
  columns,
  children,
}: {
  as?: 'div' | 'ul' | 'ol';
  label: string;
  columns: string;
  children: ReactNode;
}) {
  const [active, setActive] = useState(0);
  const count = Children.count(children);
  return (
    <div className="space-y-3">
      <Tag
        tabIndex={0}
        aria-label={label}
        onScroll={(event) => {
          const { scrollLeft, scrollWidth, clientWidth } = event.currentTarget;
          const range = scrollWidth - clientWidth;
          setActive(range > 0 ? Math.round((scrollLeft / range) * (count - 1)) : 0);
        }}
        className={`-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-[9vw] pb-1 md:mx-0 md:grid md:gap-4 md:overflow-visible md:px-0 ${columns}`}
      >
        {children}
      </Tag>
      <div aria-hidden="true" className="flex justify-center gap-2 md:hidden">
        {Array.from({ length: count }, (_, index) => (
          <span
            key={index}
            className={`h-2 w-2 rounded-full ${index === active ? 'bg-accent' : 'bg-fg/25'}`}
          />
        ))}
      </div>
    </div>
  );
}

export function LandingPage() {
  const { t, i18n } = useTranslation();
  const config = useAuthConfig();
  const lang = i18n.language.startsWith('de') ? 'de' : 'en';
  const [openShot, setOpenShot] = useState<(typeof SHOTS)[number] | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const wide = useMediaQuery('(min-width: 768px)');

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-10 px-4 py-6 md:gap-16">
      <header className="flex items-center justify-between">
        <Logo />
        <LanguageSwitch />
      </header>

      <main className="flex-1 space-y-12 md:space-y-20">
        <section className="grid gap-6 md:grid-cols-[3fr_2fr] md:gap-10 md:items-start">
          <div className="space-y-5">
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              {t('landing.title')}
            </h1>
            <p className="text-lg text-fg/80">{t('landing.lead')}</p>
            <ul className="hidden space-y-2 text-fg/80 sm:block">
              {(['one', 'two', 'three'] as const).map((key) => (
                <li key={key} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent"
                  />
                  {t(`landing.points.${key}`)}
                </li>
              ))}
            </ul>
          </div>
          {wide ? (
            <div className="rounded-2xl border border-fg/10 bg-raised p-6 shadow-sm">
              <LoginForm heading="h2" />
              {!config.data?.publicRegistration && (
                <p className="mt-4 text-sm text-fg/75">{t('landing.inviteOnly')}</p>
              )}
            </div>
          ) : (
            <Button type="button" onClick={() => setLoginOpen(true)}>
              {t('auth.login')}
            </Button>
          )}
        </section>

        <section aria-labelledby="how-heading" className="space-y-6">
          <h2 id="how-heading" className="font-display text-2xl font-bold">
            {t('landing.howTitle')}
          </h2>
          <Swipe as="ol" label={t('landing.howTitle')} columns="md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li
                key={step}
                className={`${SLIDE} space-y-2 rounded-2xl border border-fg/10 bg-raised p-5`}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 font-bold">
                  {index + 1}
                </span>
                <h3 className="font-semibold">{t(`landing.steps.${step}.title`)}</h3>
                <p className="text-sm text-fg/80">{t(`landing.steps.${step}.text`)}</p>
              </li>
            ))}
          </Swipe>
        </section>

        <section aria-labelledby="features-heading" className="space-y-6">
          <h2 id="features-heading" className="font-display text-2xl font-bold">
            {t('landing.featuresTitle')}
          </h2>
          <Swipe as="ul" label={t('landing.featuresTitle')} columns="md:grid-cols-3">
            {FEATURES.map((feature) => (
              <li
                key={feature}
                className={`${SLIDE} space-y-1 rounded-2xl border border-fg/10 bg-raised p-5`}
              >
                <h3 className="font-semibold">{t(`landing.features.${feature}.title`)}</h3>
                <p className="text-sm text-fg/80">{t(`landing.features.${feature}.text`)}</p>
              </li>
            ))}
          </Swipe>
        </section>

        <section aria-labelledby="shots-heading" className="space-y-6">
          <h2 id="shots-heading" className="font-display text-2xl font-bold">
            {t('landing.shotsTitle')}
          </h2>
          <Swipe label={t('landing.shotsTitle')} columns="md:grid-cols-3 md:gap-8">
            {SHOTS.map((shot) => (
              <figure key={shot} className={`${SLIDE} space-y-3`}>
                <button
                  type="button"
                  aria-label={t('landing.enlarge', { name: t(`landing.shots.${shot}.caption`) })}
                  onClick={() => setOpenShot(shot)}
                  className="block w-full"
                >
                  <img
                    src={`/landing/${shot}-${lang}.jpg`}
                    alt={t(`landing.shots.${shot}.alt`)}
                    width={900}
                    height={1100}
                    loading="lazy"
                    className="aspect-[4/5] w-full rounded-xl border border-fg/10 object-cover object-top shadow-sm"
                  />
                </button>
                <figcaption className="text-center text-sm text-fg/80 md:text-left">
                  {t(`landing.shots.${shot}.caption`)}
                </figcaption>
              </figure>
            ))}
          </Swipe>
        </section>

        <section
          aria-labelledby="trust-heading"
          className="space-y-3 rounded-2xl border border-fg/10 bg-raised p-6"
        >
          <h2 id="trust-heading" className="font-display text-2xl font-bold">
            {t('landing.trustTitle')}
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-fg/80">
            {(['data', 'open', 'hint'] as const).map((key) => (
              <li key={key}>{t(`landing.trust.${key}`)}</li>
            ))}
          </ul>
        </section>
      </main>

      <LegalLinks />

      {openShot && (
        <Modal
          label={t(`landing.shots.${openShot}.caption`)}
          onClose={() => setOpenShot(null)}
          className="max-w-[min(92vw,56rem)] p-2"
        >
          {(close) => (
            <>
              <img
                src={`/landing/${openShot}-${lang}.jpg`}
                alt={t(`landing.shots.${openShot}.alt`)}
                className="mx-auto h-auto max-h-[80vh] w-auto max-w-full rounded-lg"
              />
              <button
                type="button"
                onClick={close}
                className="mt-2 w-full rounded-lg border border-fg/20 px-4 py-2 font-medium hover:border-accent"
              >
                {t('landing.close')}
              </button>
            </>
          )}
        </Modal>
      )}

      {loginOpen && !wide && (
        <Modal
          label={t('auth.loginTitle')}
          onClose={() => setLoginOpen(false)}
          className="w-[min(92vw,26rem)] p-6"
        >
          {(close) => (
            <>
              <LoginForm heading="h2" />
              {!config.data?.publicRegistration && (
                <p className="mt-4 text-sm text-fg/75">{t('landing.inviteOnly')}</p>
              )}
              <button
                type="button"
                onClick={close}
                className="mt-4 w-full rounded-lg border border-fg/20 px-4 py-2 font-medium hover:border-accent"
              >
                {t('landing.close')}
              </button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
