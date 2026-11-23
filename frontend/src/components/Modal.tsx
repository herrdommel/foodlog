import { type ReactNode } from 'react';

export function Modal({
  label,
  onClose,
  className = '',
  children,
}: {
  label: string;
  onClose: () => void;
  className?: string;
  children: (close: () => void) => ReactNode;
}) {
  return (
    <dialog
      ref={(element) => {
        if (element && !element.open) element.showModal();
      }}
      aria-label={label}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className={`m-auto max-h-[92vh] overflow-auto rounded-xl bg-raised text-fg backdrop:bg-black/70 ${className}`}
    >
      {children(onClose)}
    </dialog>
  );
}
