import type { CapturedScreenshot } from '../lib/messaging.ts';
import type { ElementSelection } from '../lib/protocol.ts';
import { captureWithoutOverlay, includeCaptureReason, resolveCapture } from './capture-result.ts';
import { describeElement, measure, readSource } from './collect.ts';
import type { Draft } from './composer.ts';
import { toElementSelection } from './selection-shapes.ts';

export interface CapturedElement {
  selection: ElementSelection;
  capture: CapturedScreenshot;
  hasSource: boolean;
}

/**
 * Turn a commented element into a review item: source location, screenshot,
 * and the facts read from the DOM. Slow parts first, so the element is
 * measured and described as late as possible in case the page moved.
 */
export async function captureElementSelection(
  layer: HTMLElement,
  element: Element,
  draft: Draft,
  pageUrl: string,
): Promise<CapturedElement> {
  const source = await readSource(element);
  const capture = resolveCapture(await captureWithoutOverlay(layer, measure(element)));
  const selection = toElementSelection(
    describeElement(element),
    draft,
    includeCaptureReason(draft.comment, capture),
    pageUrl,
    source,
    capture,
  );
  return { selection, capture, hasSource: source !== undefined };
}
