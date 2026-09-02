import type { CapturedScreenshot } from '../lib/messaging.ts';
import type {
  DrawingSelection,
  ElementSelection,
  Selection,
  SelectionSource,
} from '../lib/protocol.ts';
import type { AnnotationItem } from './annotations.ts';
import { readViewport } from './collect.ts';
import type { Draft } from './composer.ts';
import type { DrawingSnapshot } from './drawing.ts';

/**
 * Turn what the overlay captured into the shapes other layers expect.
 *
 * Two audiences, one source: the daemon receives a `Selection` over the wire,
 * and the toolbar shows the same thing back to the user as a card row. Keeping
 * both conversions here means a field can only ever be renamed in one place.
 */

/** Everything the overlay learned about the element it is turning into a selection. */
export interface ElementFacts {
  tag: string;
  selector: string;
  classes: string[];
  text: string;
  box: ElementSelection['box'];
  styles: Record<string, string>;
  context?: ElementSelection['context'];
  viewport?: ElementSelection['viewport'];
  pseudoStyles?: ElementSelection['pseudoStyles'];
}

/** A commented element, in the protocol's shape. */
export function toElementSelection(
  facts: ElementFacts,
  draft: Draft,
  comment: string,
  pageUrl: string,
  source: SelectionSource | undefined,
  capture: CapturedScreenshot,
): ElementSelection {
  return {
    kind: 'element',
    ...facts,
    comment,
    pageUrl,
    ...(draft.styleChanges.length === 0 ? {} : { styleChanges: draft.styleChanges }),
    ...(draft.textChange === undefined ? {} : { textChange: draft.textChange }),
    ...(source === undefined ? {} : { source }),
    ...(capture.screenshot === undefined ? {} : { screenshot: capture.screenshot }),
    ...(capture.screenshotBlobId === undefined
      ? {}
      : { screenshotBlobId: capture.screenshotBlobId }),
  };
}

/** A finished drawing, in the protocol's shape, with points relative to its box. */
export function toDrawingSelection(
  snapshot: DrawingSnapshot,
  comment: string,
  capture: CapturedScreenshot,
): DrawingSelection {
  const { box } = snapshot;
  return {
    kind: 'drawing',
    comment,
    box: { ...box },
    viewport: readViewport(),
    strokes: snapshot.strokes.map((stroke) => ({
      color: stroke.color,
      width: stroke.width,
      points: stroke.points.map((point) => ({
        x: round(point.x - box.x),
        y: round(point.y - box.y),
        pressure: point.pressure,
      })),
    })),
    ...(capture.screenshot === undefined ? {} : { screenshot: capture.screenshot }),
    ...(capture.screenshotBlobId === undefined
      ? {}
      : { screenshotBlobId: capture.screenshotBlobId }),
  };
}

/** One queued selection, as the toolbar's annotation card shows it. */
export function toAnnotationItem(selection: Selection, index: number): AnnotationItem {
  const shape =
    selection.kind === 'drawing'
      ? { tag: 'Drawing', detail: plural(selection.strokes.length, 'stroke') }
      : {
          tag: `<${selection.tag}>`,
          detail: selection.classes.slice(0, 2).map((name) => `.${name}`).join(''),
        };

  return {
    index,
    ...shape,
    detail: [shape.detail, describePage(selection.pageUrl)].filter((part) => part !== '').join(' · '),
    comment: selection.comment === '' ? describeUnwritten(selection) : selection.comment,
    ...(selection.screenshot === undefined ? {} : { screenshot: selection.screenshot }),
  };
}

function describePage(pageUrl: string | undefined): string {
  if (pageUrl === undefined) return '';
  try {
    const url = new URL(pageUrl);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return pageUrl;
  }
}

/** A selection can be made of live edits alone, with nothing written down. */
function describeUnwritten(selection: Selection): string {
  if (selection.kind !== 'element') return 'No comment';

  const edits =
    (selection.styleChanges?.length ?? 0) + (selection.textChange === undefined ? 0 : 1);
  return edits === 0 ? 'No comment' : plural(edits, 'live edit');
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
