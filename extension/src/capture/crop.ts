import { fail, ok, type Answer } from '../lib/messaging.ts';
import type { SelectionBox } from '../lib/protocol.ts';

/** Widest a stored screenshot may be, to keep notes a sensible size on disk. */
const MAX_WIDTH = 1200;

/** Extra pixels kept around the element so it is legible in context. */
const PADDING = 8;

/**
 * Cut one element out of a full-page screenshot.
 *
 * Runs in the service worker, which has `OffscreenCanvas`. `captureVisibleTab`
 * returns device pixels while the selection box is measured in CSS pixels, so
 * every coordinate is scaled by the page's device pixel ratio before cropping.
 */
export async function cropToBox(
  dataUrl: string,
  box: SelectionBox,
  pixelRatio: number,
): Promise<Answer<string>> {
  try {
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const region = clampToImage(scale(box, pixelRatio), bitmap.width, bitmap.height);

    if (region.width < 1 || region.height < 1) {
      return fail('That element is not visible on screen.');
    }

    const factor = Math.min(1, MAX_WIDTH / region.width);
    const canvas = new OffscreenCanvas(
      Math.round(region.width * factor),
      Math.round(region.height * factor),
    );

    const context = canvas.getContext('2d');
    if (context === null) return fail('Could not prepare a canvas for the screenshot.');

    context.drawImage(
      bitmap,
      region.x,
      region.y,
      region.width,
      region.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    bitmap.close();

    return ok(await toBase64(await canvas.convertToBlob({ type: 'image/png' })));
  } catch (cause) {
    return fail(cause instanceof Error ? cause.message : 'Could not crop the screenshot.');
  }
}

function scale(box: SelectionBox, pixelRatio: number): SelectionBox {
  const padded = {
    x: box.x - PADDING,
    y: box.y - PADDING,
    width: box.width + PADDING * 2,
    height: box.height + PADDING * 2,
  };

  return {
    x: padded.x * pixelRatio,
    y: padded.y * pixelRatio,
    width: padded.width * pixelRatio,
    height: padded.height * pixelRatio,
  };
}

/** An element partly off-screen would otherwise ask the canvas for pixels that do not exist. */
function clampToImage(box: SelectionBox, imageWidth: number, imageHeight: number): SelectionBox {
  const x = Math.max(0, Math.round(box.x));
  const y = Math.max(0, Math.round(box.y));

  return {
    x,
    y,
    width: Math.min(Math.round(box.width), imageWidth - x),
    height: Math.min(Math.round(box.height), imageHeight - y),
  };
}

/** The daemon stores raw base64, so the `data:image/png;base64,` prefix is dropped. */
async function toBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());

  let binary = '';
  for (const byte of buffer) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
