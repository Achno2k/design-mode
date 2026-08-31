import { fail, ok, type Answer } from '../lib/messaging.ts';
import type { SelectionBox } from '../lib/protocol.ts';

/** Widest a stored screenshot may be, to keep notes a sensible size on disk. */
const MAX_WIDTH = 1200;

export interface CapturedFrame {
  dataUrl: string;
  /** Document-space viewport origin when this frame was captured. */
  scrollX: number;
  scrollY: number;
}

/** Stitch viewport captures into one complete document-space selection image. */
export async function cropCapturedFrames(
  frames: CapturedFrame[],
  box: SelectionBox,
  pixelRatio: number,
): Promise<Answer<string>> {
  if (frames.length === 0) return fail('No screenshot frames were captured.');

  const bitmaps = await decodeFrames(frames);
  if (!bitmaps.ok) return bitmaps;

  try {
    const factor = Math.min(1, MAX_WIDTH / (box.width * pixelRatio));
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(box.width * pixelRatio * factor)),
      Math.max(1, Math.round(box.height * pixelRatio * factor)),
    );
    const context = canvas.getContext('2d');
    if (context === null) return fail('Could not prepare a canvas for the screenshot.');

    const covered: SelectionBox[] = [];
    for (const entry of bitmaps.value) {
      const intersection = intersect(box, frameBox(entry, pixelRatio));
      if (intersection === null) continue;
      drawIntersection(context, entry, intersection, box, pixelRatio, factor);
      covered.push(intersection);
    }

    if (!coversBox(covered, box)) {
      return fail('The element could not be captured completely after scrolling.');
    }
    return ok(await toBase64(await canvas.convertToBlob({ type: 'image/png' })));
  } catch (cause) {
    return fail(cause instanceof Error ? cause.message : 'Could not stitch the screenshot.');
  } finally {
    for (const entry of bitmaps.value) entry.bitmap.close();
  }
}

type DecodedFrame = CapturedFrame & { bitmap: ImageBitmap };

async function decodeFrames(frames: CapturedFrame[]): Promise<Answer<DecodedFrame[]>> {
  const decoded: DecodedFrame[] = [];
  try {
    for (const frame of frames) {
      const bitmap = await createImageBitmap(await (await fetch(frame.dataUrl)).blob());
      decoded.push({ ...frame, bitmap });
    }
    return ok(decoded);
  } catch (cause) {
    for (const frame of decoded) frame.bitmap.close();
    return fail(cause instanceof Error ? cause.message : 'Could not read the screenshot frames.');
  }
}

function frameBox(frame: DecodedFrame, pixelRatio: number): SelectionBox {
  return {
    x: frame.scrollX,
    y: frame.scrollY,
    width: frame.bitmap.width / pixelRatio,
    height: frame.bitmap.height / pixelRatio,
  };
}

function intersect(a: SelectionBox, b: SelectionBox): SelectionBox | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right <= x || bottom <= y ? null : { x, y, width: right - x, height: bottom - y };
}

function drawIntersection(
  context: OffscreenCanvasRenderingContext2D,
  frame: DecodedFrame,
  region: SelectionBox,
  target: SelectionBox,
  pixelRatio: number,
  factor: number,
): void {
  context.drawImage(
    frame.bitmap,
    (region.x - frame.scrollX) * pixelRatio,
    (region.y - frame.scrollY) * pixelRatio,
    region.width * pixelRatio,
    region.height * pixelRatio,
    (region.x - target.x) * pixelRatio * factor,
    (region.y - target.y) * pixelRatio * factor,
    region.width * pixelRatio * factor,
    region.height * pixelRatio * factor,
  );
}

function coversBox(regions: SelectionBox[], box: SelectionBox): boolean {
  const fullWidth = regions.filter(
    (region) => region.x <= box.x + 0.5 && region.x + region.width >= box.x + box.width - 0.5,
  );
  const intervals = fullWidth
    .map((region) => ({ start: region.y, end: region.y + region.height }))
    .sort((a, b) => a.start - b.start);

  let coveredUntil = box.y;
  for (const interval of intervals) {
    if (interval.start > coveredUntil + 0.5) return false;
    coveredUntil = Math.max(coveredUntil, interval.end);
    if (coveredUntil >= box.y + box.height - 0.5) return true;
  }
  return false;
}

async function toBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of buffer) binary += String.fromCharCode(byte);
  return btoa(binary);
}
