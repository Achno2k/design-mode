import { cropCapturedFrames, type CapturedFrame } from './crop.ts';
import { postBlob } from '../lib/daemon.ts';
import {
  captureVisibleWindow,
  fail,
  ok,
  scrollTab,
  type Answer,
  type CapturedScreenshot,
  type CaptureRequest,
} from '../lib/messaging.ts';
import type { SelectionBox } from '../lib/protocol.ts';

const MAX_CAPTURE_FRAMES = 8;
// Chrome permits captureVisibleTab at most twice per second.
const FRAME_DELAY_MS = 550;

/** Capture a complete element, uploading it before any review state is persisted. */
export async function captureTabScreenshot(
  tabId: number | undefined,
  windowId: number | undefined,
  request: CaptureRequest,
): Promise<Answer<CapturedScreenshot>> {
  if (tabId === undefined || windowId === undefined) {
    return fail('Could not tell which tab to capture.');
  }

  const planned = planCapture(request);
  if (!planned.ok) return ok({ incompleteReason: planned.error });

  const frames: CapturedFrame[] = [];
  try {
    for (const [index, position] of planned.value.positions.entries()) {
      if (index > 0) await delay(FRAME_DELAY_MS);
      const moved = await scrollTab(tabId, planned.value.scrollX, position);
      if (!moved.ok) return ok({ incompleteReason: moved.error });

      const frame = await captureVisibleWindow(windowId);
      if (!frame.ok) return ok({ incompleteReason: frame.error });
      frames.push({ dataUrl: frame.value, scrollX: moved.value.x, scrollY: moved.value.y });
    }
  } finally {
    await scrollTab(tabId, request.scrollX, request.scrollY);
  }

  const cropped = await cropCapturedFrames(frames, planned.value.box, request.pixelRatio);
  if (!cropped.ok) return ok({ incompleteReason: cropped.error });

  const uploaded = await postBlob(cropped.value);
  if (uploaded.ok) return ok({ screenshotBlobId: uploaded.value.blobId });
  return ok({ screenshot: cropped.value, notice: uploaded.error });
}

interface CapturePlan {
  box: SelectionBox;
  scrollX: number;
  positions: number[];
}

function planCapture(request: CaptureRequest): Answer<CapturePlan> {
  if (
    request.box.width <= 0 ||
    request.box.height <= 0 ||
    request.viewportWidth <= 0 ||
    request.viewportHeight <= 0 ||
    request.pixelRatio <= 0
  ) {
    return fail('The element has no visible area to capture.');
  }

  if (request.box.width > request.viewportWidth) {
    return fail('Screenshot omitted because the element is wider than the viewport.');
  }

  const box = {
    x: request.box.x + request.scrollX,
    y: request.box.y + request.scrollY,
    width: request.box.width,
    height: request.box.height,
  };
  if (box.x < 0 || box.y < 0) {
    return fail('Screenshot omitted because part of the element is outside the document.');
  }

  const frameCount = Math.ceil(box.height / request.viewportHeight);
  if (frameCount > MAX_CAPTURE_FRAMES) {
    return fail(`Screenshot omitted because the element needs more than ${MAX_CAPTURE_FRAMES} frames.`);
  }

  const isAlreadyVisible =
    box.x >= request.scrollX &&
    box.x + box.width <= request.scrollX + request.viewportWidth &&
    box.y >= request.scrollY &&
    box.y + box.height <= request.scrollY + request.viewportHeight;

  return ok({
    box,
    scrollX: isAlreadyVisible ? request.scrollX : box.x,
    positions: isAlreadyVisible ? [request.scrollY] : framePositions(box, request.viewportHeight),
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function framePositions(box: SelectionBox, viewportHeight: number): number[] {
  const positions: number[] = [];
  const bottom = box.y + box.height;
  for (let y = box.y; y < bottom; y += viewportHeight) positions.push(y);
  return positions;
}
