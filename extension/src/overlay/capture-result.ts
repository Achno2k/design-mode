import type { Answer, CapturedScreenshot } from '../lib/messaging.ts';
import type { SelectionBox } from '../lib/protocol.ts';
import { captureElement } from './collect.ts';

/** Hide extension chrome for every frame of a possibly stitched capture. */
export async function captureWithoutOverlay(
  layer: HTMLElement,
  box: SelectionBox,
): Promise<Answer<CapturedScreenshot>> {
  layer.classList.add('layer--capturing');
  try {
    return await captureElement(box);
  } finally {
    layer.classList.remove('layer--capturing');
  }
}

/** Turn capture transport failures into an explicit, image-free review item. */
export function resolveCapture(answer: Answer<CapturedScreenshot>): CapturedScreenshot {
  return answer.ok ? answer.value : { incompleteReason: answer.error };
}

/** Preserve a capture-limit explanation in the payload without adding wire fields. */
export function includeCaptureReason(comment: string, capture: CapturedScreenshot): string {
  if (capture.incompleteReason === undefined) return comment;
  const note = `[${capture.incompleteReason}]`;
  return comment === '' ? note : `${comment}\n\n${note}`;
}

/** A concise status for either an omitted image or an inline-upload fallback. */
export function captureNotice(capture: CapturedScreenshot): string | undefined {
  return capture.incompleteReason ?? capture.notice;
}
