import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../test/server.ts';
import { mockGuest, mockLoggedIn, renderApp } from '../test/render.tsx';

function legal(documents: Record<string, string>) {
  server.use(
    http.get('/api/legal/:doc', ({ request, params }) => {
      const lang = new URL(request.url).searchParams.get('lang');
      const text = documents[`${params.doc}.${lang}`];
      return text
        ? HttpResponse.json({ markdown: text })
        : HttpResponse.json({ error: { code: 'not_configured', message: '' } }, { status: 404 });
    }),
  );
}

describe('legal pages', () => {
  it('renders the operator text for guests', async () => {
    mockGuest();
    legal({ 'privacy.en': '# Privacy\n\nWe take **care**.\n\n- item one\n- item two' });
    renderApp('/privacy');
    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByText('care').tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('always has exactly one main heading', async () => {
    mockGuest();
    legal({ 'privacy.en': '# Own title\n\ntext', 'imprint.en': 'No heading here' });
    const first = renderApp('/privacy');
    await screen.findByText('text');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    first.unmount();
    renderApp('/imprint');
    await screen.findByText('No heading here');
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Imprint');
  });

  it('is available while signed in', async () => {
    mockLoggedIn();
    legal({ 'imprint.en': '# Imprint\n\nOperator Example' });
    renderApp('/imprint');
    expect(await screen.findByText('Operator Example')).toBeInTheDocument();
  });

  it('falls back to German and says so', async () => {
    mockGuest();
    legal({ 'imprint.de': '# Impressum\n\nBetreiber Muster' });
    renderApp('/imprint');
    expect(await screen.findByText('Betreiber Muster')).toBeInTheDocument();
    expect(screen.getByText('Dieser Text liegt nur auf Deutsch vor.')).toBeInTheDocument();
  });

  it('says clearly when the operator has not provided the text', async () => {
    mockGuest();
    legal({});
    renderApp('/privacy');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The operator has not provided this text yet.',
    );
  });

  it('never executes html from the document', async () => {
    mockGuest();
    legal({ 'privacy.en': '<script>window.hacked = true</script>\n\n[x](javascript:alert(1))' });
    renderApp('/privacy');
    expect(await screen.findByText(/<script>/)).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect((window as unknown as { hacked?: boolean }).hacked).toBeUndefined();
  });

  it('links to both documents from the footer of public and signed-in pages', async () => {
    mockGuest();
    renderApp('/login');
    const footer = await screen.findByRole('navigation', { name: 'Legal' });
    expect(footer.querySelector('a[href="/privacy"]')).not.toBeNull();
    expect(footer.querySelector('a[href="/imprint"]')).not.toBeNull();
  });
});
