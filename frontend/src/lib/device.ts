// The `capture` attribute only opens a camera on phones and tablets. Elsewhere it is ignored and the
// browser shows the normal file dialog, so a separate camera button would only duplicate the other one.
export function hasTouchCamera(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches);
}
