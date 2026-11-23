import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

export type SelectOption<T extends string | number> = {
  value: T;
  label: string;
  short?: string;
  icon?: ReactNode;
};

const SEARCH_FROM = 12;

export function Select<T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled,
  variant = 'field',
}: {
  label: string;
  options: SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  variant?: 'field' | 'compact';
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const labelId = useId();
  const valueId = useId();
  const compact = variant === 'compact';
  const searchable = options.length > SEARCH_FROM;
  const current = options.find((option) => option.value === value);
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? options.filter((option) => option.label.toLowerCase().includes(needle))
    : options;

  useEffect(() => {
    if (!open) return;
    const selected = items.current[options.findIndex((option) => option.value === value)];
    if (searchable) {
      search.current?.focus();
      selected?.scrollIntoView?.({ block: 'nearest' });
    } else {
      selected?.focus();
    }
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return;
        trigger.current?.focus();
      } else if (root.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
      setQuery('');
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
    // Focus and listeners are set up once per opening, not whenever the options change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = (next: T) => {
    onChange(next);
    setOpen(false);
    setQuery('');
    trigger.current?.focus();
  };

  const focusItem = (index: number) => items.current[index]?.focus();

  return (
    <div ref={root} className={`relative ${compact ? 'shrink-0' : 'space-y-1'}`}>
      <span id={labelId} className={compact ? 'sr-only' : 'block text-sm font-medium'}>
        {label}
      </span>
      <button
        ref={trigger}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 rounded-lg border border-fg/20 bg-raised text-sm disabled:opacity-50 ${compact ? 'px-2 py-1' : 'w-full px-3 py-2 text-base'}`}
      >
        {current?.icon}
        <span id={valueId} className={compact ? undefined : 'min-w-0 flex-1 truncate text-left'}>
          {compact ? (current?.short ?? current?.label) : current?.label}
        </span>
        <IconChevronDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div
          className={`absolute top-full z-20 mt-1 rounded-xl border border-fg/10 bg-raised p-1 shadow-lg ${compact ? 'right-0 min-w-36' : 'left-0 w-full'}`}
        >
          {searchable && (
            <input
              ref={search}
              type="search"
              value={query}
              aria-label={t('common.search')}
              placeholder={t('common.search')}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  focusItem(0);
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  if (visible[0]) choose(visible[0].value);
                } else if (event.key === 'Tab') {
                  setOpen(false);
                }
              }}
              className="mb-1 w-full rounded-lg border border-fg/20 bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          )}
          <ul role="listbox" aria-labelledby={labelId} className="max-h-64 overflow-y-auto">
            {visible.map((option, index) => (
              <li
                key={option.value}
                ref={(element) => {
                  items.current[index] = element;
                }}
                role="option"
                aria-selected={option.value === value}
                tabIndex={-1}
                onClick={() => choose(option.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    choose(option.value);
                  } else if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    focusItem(Math.min(index + 1, visible.length - 1));
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    if (index > 0) focusItem(index - 1);
                    else if (searchable) search.current?.focus();
                  } else if (event.key === 'Home') {
                    event.preventDefault();
                    focusItem(0);
                  } else if (event.key === 'End') {
                    event.preventDefault();
                    focusItem(visible.length - 1);
                  } else if (event.key === 'Tab') {
                    setOpen(false);
                  }
                }}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-fg/5 focus-visible:bg-fg/5 focus-visible:outline-2 focus-visible:outline-accent ${option.value === value ? 'font-semibold' : ''}`}
              >
                {option.icon}
                {option.label}
              </li>
            ))}
          </ul>
          {visible.length === 0 && (
            <p className="px-3 py-2 text-sm text-fg/75">{t('common.noResults')}</p>
          )}
        </div>
      )}
    </div>
  );
}
