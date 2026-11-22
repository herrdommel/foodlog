import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderElement } from '../test/render.tsx';
import { BarcodeScanner } from './BarcodeScanner.tsx';

const reader = vi.hoisted(() => ({
  decodeFromConstraints: vi.fn(),
  decodeFromImageUrl: vi.fn(),
}));

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: class {
    constructor() {
      return reader;
    }
  },
}));
vi.mock('@zxing/library', () => ({
  BarcodeFormat: { EAN_13: 1, EAN_8: 2, UPC_A: 3, UPC_E: 4 },
  DecodeHintType: { POSSIBLE_FORMATS: 5 },
}));

const result = (text: string) => ({ getText: () => text });

beforeEach(() => {
  reader.decodeFromConstraints.mockReset();
  reader.decodeFromImageUrl.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function withCamera() {
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn() } });
}

describe('BarcodeScanner', () => {
  it('says why the live camera is missing and keeps the photo option', () => {
    renderElement(<BarcodeScanner onDetected={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Scan with camera' })).not.toBeInTheDocument();
    expect(screen.getByText(/needs a secure connection/)).toBeInTheDocument();
    expect(screen.getByText('Scan from a photo')).toBeInTheDocument();
  });

  it('asks for the rear camera and reports a valid code once', async () => {
    withCamera();
    const stop = vi.fn();
    let onResult: (value: unknown) => void = () => undefined;
    reader.decodeFromConstraints.mockImplementation(async (_constraints, _video, callback) => {
      onResult = callback;
      return { stop };
    });
    const onDetected = vi.fn();
    renderElement(<BarcodeScanner onDetected={onDetected} />);
    await userEvent.click(screen.getByRole('button', { name: 'Scan with camera' }));
    await waitFor(() => expect(reader.decodeFromConstraints).toHaveBeenCalled());
    expect(reader.decodeFromConstraints.mock.calls[0]![0]).toEqual({
      video: { facingMode: 'environment' },
    });

    onResult(result('1234567890123'));
    expect(onDetected).not.toHaveBeenCalled();
    onResult(undefined);
    onResult(result('4000000000013'));
    expect(onDetected).toHaveBeenCalledWith('4000000000013');
    expect(stop).toHaveBeenCalled();
  });

  it('tells the user when the camera cannot be started', async () => {
    withCamera();
    reader.decodeFromConstraints.mockRejectedValue(new Error('denied'));
    renderElement(<BarcodeScanner onDetected={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Scan with camera' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be started');
  });

  it('reads a code from a photo', async () => {
    reader.decodeFromImageUrl.mockResolvedValue(result('4000000000013'));
    const onDetected = vi.fn();
    renderElement(<BarcodeScanner onDetected={onDetected} />);
    const input = screen.getByLabelText('Scan from a photo');
    await userEvent.upload(input, new File(['x'], 'code.png', { type: 'image/png' }));
    await waitFor(() => expect(onDetected).toHaveBeenCalledWith('4000000000013'));
    expect(reader.decodeFromImageUrl.mock.calls[0]![0]).toMatch(/^data:image\/png;base64,/);
  });

  it('reports a photo without a readable code', async () => {
    reader.decodeFromImageUrl.mockRejectedValue(new Error('no code'));
    const onDetected = vi.fn();
    renderElement(<BarcodeScanner onDetected={onDetected} />);
    await userEvent.upload(
      screen.getByLabelText('Scan from a photo'),
      new File(['x'], 'code.png', { type: 'image/png' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('No barcode could be read');
    expect(onDetected).not.toHaveBeenCalled();
  });
});
