import type { ReactNode } from 'react';
import { PRESET_AVATAR_COUNT } from '@foodlog/shared';

const G = '#1F6F54';
const G2 = '#3EA37F';
const C = '#F6F3EC';
const O = '#FF8A5B';
const O2 = '#FFC3A8';
const D = '#17261F';

const designs: { bg: string; shapes: ReactNode }[] = [
  {
    bg: G,
    shapes: (
      <>
        <circle cx="44" cy="22" r="14" fill={O} />
        <rect x="8" y="40" width="30" height="16" rx="8" fill={C} />
      </>
    ),
  },
  {
    bg: O,
    shapes: (
      <>
        <circle cx="24" cy="32" r="16" fill={D} />
        <circle cx="44" cy="32" r="10" fill={C} />
      </>
    ),
  },
  {
    bg: D,
    shapes: (
      <>
        <path d="M8 56 A24 24 0 0 1 56 56 Z" fill={G2} />
        <circle cx="32" cy="22" r="9" fill={O} />
      </>
    ),
  },
  {
    bg: C,
    shapes: (
      <>
        <rect x="10" y="10" width="28" height="28" rx="6" fill={G} />
        <circle cx="42" cy="42" r="14" fill={O} />
      </>
    ),
  },
  {
    bg: G2,
    shapes: (
      <>
        <path d="M0 40 Q16 16 32 40 T64 40 V64 H0 Z" fill={D} />
        <circle cx="46" cy="18" r="8" fill={C} />
      </>
    ),
  },
  {
    bg: O2,
    shapes: (
      <>
        <circle cx="32" cy="32" r="22" fill={G} />
        <circle cx="32" cy="32" r="10" fill={O} />
      </>
    ),
  },
  {
    bg: G,
    shapes: (
      <>
        <rect x="0" y="0" width="32" height="64" fill={D} />
        <circle cx="32" cy="32" r="14" fill={O} />
      </>
    ),
  },
  {
    bg: C,
    shapes: (
      <>
        <path d="M32 6 L58 52 H6 Z" fill={O} />
        <circle cx="32" cy="38" r="8" fill={G} />
      </>
    ),
  },
  {
    bg: D,
    shapes: (
      <>
        <circle cx="20" cy="20" r="10" fill={C} />
        <circle cx="44" cy="20" r="10" fill={O} />
        <rect x="12" y="38" width="40" height="14" rx="7" fill={G2} />
      </>
    ),
  },
  {
    bg: O,
    shapes: (
      <>
        <path d="M0 64 L64 0 V64 Z" fill={G} />
        <circle cx="20" cy="22" r="9" fill={C} />
      </>
    ),
  },
  {
    bg: G2,
    shapes: (
      <>
        <rect x="8" y="8" width="20" height="48" rx="10" fill={C} />
        <rect x="36" y="8" width="20" height="30" rx="10" fill={D} />
      </>
    ),
  },
  {
    bg: O2,
    shapes: (
      <>
        <circle cx="32" cy="48" r="26" fill={D} />
        <circle cx="32" cy="22" r="10" fill={G} />
      </>
    ),
  },
];

if (designs.length !== PRESET_AVATAR_COUNT) {
  throw new Error('preset avatar designs must match PRESET_AVATAR_COUNT');
}

export function PresetAvatar({ index, className }: { index: number; className?: string }) {
  const design = designs[index - 1] ?? designs[0]!;
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" fill={design.bg} />
      {design.shapes}
    </svg>
  );
}
