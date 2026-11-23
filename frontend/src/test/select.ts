import { screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

type Scope = Pick<typeof screen, 'findByRole'>;

const named = (label: string) => (name: string) => name === label || name.startsWith(`${label} `);

export function selectTrigger(label: string, scope: Scope = screen) {
  return scope.findByRole('button', { name: named(label) });
}

export async function choose(
  user: UserEvent,
  label: string,
  option: string,
  scope: Scope = screen,
) {
  await user.click(await selectTrigger(label, scope));
  await user.click(await screen.findByRole('option', { name: option }));
}
