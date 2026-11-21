import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
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

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  const styles =
    variant === 'primary'
      ? 'bg-brand text-cream hover:opacity-90'
      : 'border border-fg/20 bg-raised hover:border-accent';
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
