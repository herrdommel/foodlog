import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from './Markdown.tsx';

describe('Markdown', () => {
  it('renders headings, paragraphs and lists', () => {
    render(
      <Markdown
        source={
          '# Title\n\nFirst line\nsecond line.\n\n## Section\n\n- one\n- two\n\n1. a\n2. b\n\n---\n\n#### Small'
        }
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Section' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'Small' })).toBeInTheDocument();
    const paragraph = screen.getByText(/First line/);
    expect(paragraph.querySelectorAll('br')).toHaveLength(1);
    expect(paragraph.textContent).toBe('First linesecond line.');
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'one',
      'two',
      'a',
      'b',
    ]);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('renders bold, italic, code and safe links', () => {
    render(
      <Markdown source="**bold** and *italic* and `code` with [site](https://example.com/a?b=1) and [mail](mailto:a@example.com)" />,
    );
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('italic').tagName).toBe('EM');
    expect(screen.getByText('code').tagName).toBe('CODE');
    const site = screen.getByRole('link', { name: 'site' });
    expect(site).toHaveAttribute('href', 'https://example.com/a?b=1');
    expect(site).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: 'mail' })).toHaveAttribute(
      'href',
      'mailto:a@example.com',
    );
  });

  it('never renders html or unsafe links', () => {
    const { container } = render(
      <Markdown
        source={
          '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[click](javascript:alert(1)) [data](data:text/html,<b>x</b>) [vb](vbscript:x)\n\n# <b>Head</b>'
        }
      />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(screen.getByText(/click/)).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('javascript:');
  });

  it('keeps the line breaks of an address block', () => {
    const { container } = render(
      <Markdown source={'Operator Example\nExample Street 1\n12345 Example City'} />,
    );
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelectorAll('br')).toHaveLength(2);
  });

  it('handles empty input', () => {
    const { container } = render(<Markdown source="" />);
    expect(container.textContent).toBe('');
  });
});
