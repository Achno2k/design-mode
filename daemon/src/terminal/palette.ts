/**
 * Daemon output colours, lifted from the overlay's theme tokens so the pane and
 * the tray look like one product. The wordmark runs from the selection blue to
 * the annotation coral; the periwinkle between them keeps the blend from
 * passing through grey. Tuned for dark terminals, which is where herdr runs.
 */
export const palette = {
  gradient: [
    [56, 189, 248],
    [165, 180, 252],
    [255, 138, 106],
  ],
  accent: [142, 213, 255],
  text: [229, 226, 225],
  muted: [135, 146, 154],
  border: [78, 90, 99],
  ok: [126, 231, 135],
  warn: [245, 194, 107],
  error: [255, 180, 171],
} as const;
