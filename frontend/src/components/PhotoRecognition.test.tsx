import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiPhotoResultDto, AiSettingsDto } from '@foodlog/shared';
import { renderElement } from '../test/render.tsx';
import { server } from '../test/server.ts';
import { PhotoRecognition } from './PhotoRecognition.tsx';

const image = vi.hoisted(() => ({
  downscaleImage: vi.fn(),
  blobToDataUrl: vi.fn(),
}));
vi.mock('../lib/image.ts', () => image);

const settings = (photoConsent: boolean): AiSettingsDto => ({
  provider: 'anthropic',
  model: 'mock-large',
  keys: {
    anthropic: { configured: true, last4: '1234' },
    openai: { configured: false, last4: null },
  },
  consent: { given: true, version: 1, currentVersion: 1, at: null },
  photoConsent: { given: photoConsent, at: null },
});

const result: AiPhotoResultDto = {
  provider: 'anthropic',
  model: 'mock-large',
  suggestions: {
    matched: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        nameDe: 'Milch',
        nameEn: 'Milk',
        custom: false,
        allergens: ['lactose'],
      },
    ],
    proposed: [{ name: 'Dragon fruit', allergens: [], source: 'ingredient' }],
  },
};

function setup(photoConsent = true) {
  image.downscaleImage.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
  image.blobToDataUrl.mockResolvedValue('data:image/jpeg;base64,anBlZw==');
  const uploads: string[] = [];
  server.use(
    http.get('/api/ai/settings', () => HttpResponse.json(settings(photoConsent))),
    http.post('/api/ai/photo', async ({ request }) => {
      uploads.push(request.headers.get('content-type') ?? '');
      return HttpResponse.json(result);
    }),
    http.post('/api/ingredients', async ({ request }) => {
      const body = (await request.json()) as { name: string; allergens: string[] };
      return HttpResponse.json({
        id: 'new-1',
        nameDe: body.name,
        nameEn: body.name,
        custom: true,
        allergens: [],
      });
    }),
  );
  const onAdd = vi.fn();
  renderElement(<PhotoRecognition onAdd={onAdd} />);
  return { onAdd, uploads };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PhotoRecognition', () => {
  it('points to the setup when the consent for photos is missing', async () => {
    setup(false);
    await userEvent.click(screen.getByRole('button', { name: 'Recognise from a photo' }));
    expect(await screen.findByText(/needs your AI provider/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set it up' })).toHaveAttribute('href', '/ai');
    expect(screen.queryByLabelText('Photo or file')).not.toBeInTheDocument();
  });

  it('offers only the file picker on a desktop, where a camera button would do the same', async () => {
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Recognise from a photo' }));
    expect(await screen.findByLabelText('Photo or file')).not.toHaveAttribute('capture');
    expect(screen.queryByLabelText('Camera')).not.toBeInTheDocument();
  });

  it('offers the camera and the library separately on a phone', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Recognise from a photo' }));
    expect(await screen.findByLabelText('Camera')).toHaveAttribute('capture', 'environment');
    expect(screen.getByLabelText('Photo or file')).not.toHaveAttribute('capture');
  });

  it('shows the photo and where it goes, then adds the checked suggestions', async () => {
    const { onAdd, uploads } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Recognise from a photo' }));
    await user.upload(
      await screen.findByLabelText('Photo or file'),
      new File(['raw'], 'big.heic', { type: 'image/heic' }),
    );
    expect(await screen.findByRole('img', { name: 'Your photo' })).toHaveAttribute(
      'src',
      'data:image/jpeg;base64,anBlZw==',
    );
    expect(screen.getByText(/sent to Anthropic \(Claude\) \(mock-large\)/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Recognise ingredients' }));
    expect(await screen.findByText('Dragon fruit')).toBeInTheDocument();
    expect(uploads[0]).toMatch(/^multipart\/form-data; boundary=/);

    await user.click(screen.getByRole('button', { name: 'Add 2 to the meal' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0]![0].map((i: { nameEn: string }) => i.nameEn)).toEqual([
      'Milk',
      'Dragon fruit',
    ]);
  });

  it('explains a photo that cannot be read', async () => {
    setup();
    image.downscaleImage.mockRejectedValue(new Error('decode'));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Recognise from a photo' }));
    await user.upload(
      await screen.findByLabelText('Photo or file'),
      new File(['raw'], 'x.png', { type: 'image/png' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('not a supported image');
  });

  it('shows the server error when the analysis fails', async () => {
    setup();
    server.use(
      http.post('/api/ai/photo', () =>
        HttpResponse.json({ error: { code: 'ai_rate_limited', message: '' } }, { status: 429 }),
      ),
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Recognise from a photo' }));
    await user.upload(
      await screen.findByLabelText('Photo or file'),
      new File(['raw'], 'x.png', { type: 'image/png' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Recognise ingredients' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('provider limit');
  });
});
