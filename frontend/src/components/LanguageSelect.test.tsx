import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LanguageSelect } from './LanguageSelect.tsx';

function setup(variant: 'compact' | 'field' = 'compact') {
  const onChange = vi.fn();
  render(<LanguageSelect variant={variant} label="Language" value="en" onChange={onChange} />);
  return onChange;
}

describe('LanguageSelect', () => {
  it('names the current language and lists both with flags when opened', async () => {
    setup();
    const trigger = screen.getByRole('button', { name: 'Language EN' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(trigger);
    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['Deutsch', 'English']);
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(options[0]!.querySelector('svg')).not.toBeNull();
  });

  it('shows the full name in the field variant', () => {
    setup('field');
    expect(screen.getByRole('button', { name: 'Language English' })).toBeInTheDocument();
  });

  it('reports the choice and closes', async () => {
    const onChange = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Language EN' }));
    await userEvent.click(screen.getByRole('option', { name: 'Deutsch' }));
    expect(onChange).toHaveBeenCalledWith('de');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('works with the keyboard and closes with Escape', async () => {
    const onChange = setup();
    const trigger = screen.getByRole('button', { name: 'Language EN' });
    await userEvent.click(trigger);
    expect(screen.getByRole('option', { name: 'English' })).toHaveFocus();

    await userEvent.keyboard('{ArrowUp}{Enter}');
    expect(onChange).toHaveBeenCalledWith('de');

    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
