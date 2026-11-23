import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Select } from './Select.tsx';

const zones = Array.from({ length: 30 }, (_, index) => `Zone/City${index}`).concat('Europe/Berlin');

function setup(options = zones, disabled = false) {
  const onChange = vi.fn();
  render(
    <Select
      label="Time zone"
      options={options.map((value) => ({ value, label: value }))}
      value="Zone/City0"
      onChange={onChange}
      disabled={disabled}
    />,
  );
  return onChange;
}

describe('Select', () => {
  it('filters long lists with a search field and picks with Enter', async () => {
    const onChange = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Time zone Zone/City0' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search' }), 'berl');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('Europe/Berlin');
  });

  it('says so when nothing matches', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: /^Time zone/ }));
    await userEvent.type(screen.getByRole('searchbox'), 'nowhere');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('has no search field for short lists', async () => {
    setup(['a', 'b']);
    await userEvent.click(screen.getByRole('button', { name: /^Time zone/ }));
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('does not open when disabled', async () => {
    setup(['a', 'b'], true);
    await userEvent.click(screen.getByRole('button', { name: /^Time zone/ }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
