import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client.ts';

export function Field({
  label,
  hint,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium">
        {label}
      </label>
      <input
        {...props}
        id={inputId}
        aria-describedby={hint ? hintId : undefined}
        className="w-full rounded-lg border border-fg/20 bg-raised px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      {hint && (
        <p id={hintId} className="text-xs text-fg/75">
          {hint}
        </p>
      )}
    </div>
  );
}

export function SelectField({
  label,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <div className="space-y-1">
      <label htmlFor={selectId} className="block text-sm font-medium">
        {label}
      </label>
      <select
        {...props}
        id={selectId}
        className="w-full rounded-lg border border-fg/20 bg-raised px-3 py-2 disabled:opacity-50"
      >
        {children}
      </select>
    </div>
  );
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'dangerOutline';
}) {
  const styles = {
    primary: 'bg-brand text-cream hover:bg-brand-hover',
    secondary: 'border border-fg/20 bg-raised hover:border-accent',
    danger: 'bg-danger text-surface hover:brightness-90',
    dangerOutline: 'border border-danger bg-raised text-danger hover:bg-danger/10',
  }[variant];
  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2 font-medium transition disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className="space-y-4 rounded-2xl bg-raised p-6 shadow-sm"
    >
      {title && (
        <h2 id={headingId} className="text-lg font-semibold">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export function ErrorMessage({ error }: { error: unknown }) {
  const { t, i18n } = useTranslation();
  if (!error) return null;
  const code =
    error instanceof ApiError ? error.code : typeof error === 'string' ? error : 'generic';
  const key = `errors.${code}`;
  return (
    <p role="alert" className="rounded-lg bg-coral/15 px-3 py-2 text-sm">
      {i18n.exists(key) ? t(key) : t('errors.generic')}
    </p>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-lg bg-accent/15 px-3 py-2 text-sm">
      {children}
    </p>
  );
}

export function FilePicker({
  label,
  capture,
  onFile,
}: {
  label: string;
  capture?: boolean;
  onFile: (file: File | undefined) => void;
}) {
  return (
    <label className="block w-full cursor-pointer rounded-lg border border-fg/20 bg-raised px-4 py-2 text-center font-medium transition hover:border-accent focus-within:ring-2 focus-within:ring-accent/40 sm:inline-block sm:w-auto">
      {label}
      <input
        type="file"
        accept="image/*"
        capture={capture ? 'environment' : undefined}
        className="sr-only"
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </label>
  );
}

const ACTION_COLUMNS = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3 [&>*]:whitespace-nowrap [&>*]:px-2 sm:[&>*]:px-4',
} as const;

export function ActionRow({
  columns = 1,
  children,
}: {
  columns?: keyof typeof ACTION_COLUMNS;
  children: ReactNode;
}) {
  return (
    <div
      className={`grid gap-2 ${ACTION_COLUMNS[columns]} sm:flex sm:flex-wrap sm:items-center sm:gap-3 [&>*]:w-full sm:[&>*]:w-auto [&>a]:block [&>a]:text-center`}
    >
      {children}
    </div>
  );
}

export function CollapsibleCard({
  title,
  summary,
  defaultOpen,
  children,
}: {
  title: string;
  summary: string;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      role="region"
      aria-label={title}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group rounded-2xl bg-raised shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-6 focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-lg font-semibold">{title}</span>
          {!open && <span className="block text-sm text-fg/75">{summary}</span>}
        </span>
        <span aria-hidden="true" className="text-xl transition group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="space-y-4 px-6 pb-6">{children}</div>
    </details>
  );
}

export function ScrollX({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  const update = useCallback(() => {
    const element = ref.current;
    if (element) setMore(element.scrollWidth - element.clientWidth - element.scrollLeft > 4);
  }, []);

  useEffect(() => {
    update();
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [update]);

  return (
    <div className="relative">
      <div ref={ref} onScroll={update} tabIndex={more ? 0 : undefined} className="overflow-x-auto">
        {children}
      </div>
      {more && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 flex w-12 items-center justify-end bg-linear-to-l from-raised to-transparent pr-1 text-2xl text-fg/60 print:hidden"
        >
          ›
        </div>
      )}
    </div>
  );
}
