/**
 * Shapes the extension sends to the daemon.
 *
 * This file is duplicated verbatim in `extension/src/lib/protocol.ts`. The two
 * halves ship separately and a shared package would couple their builds for no
 * benefit, so the contract is copied rather than imported. Change both.
 */

/** Where a component was declared, when the dev build exposes it. */
export interface SelectionSource {
  file: string;
  line: number;
  column?: number;
}

/** Position and size of the element, in CSS pixels, relative to the viewport. */
export interface SelectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A style the user changed live in the browser to show what they meant. */
export interface StyleChange {
  property: string;
  from: string;
  to: string;
}

/** The element's text content, retyped live in the browser. */
export interface TextChange {
  from: string;
  to: string;
}

/** Extra accessibility and DOM details captured for a selection. */
export interface ElementContext {
  role?: string;
  accessibleName?: string;
  attributes: Record<string, string>;
  disabled?: boolean;
  nearestHeading?: string;
}

/** A sampled point, in CSS pixels relative to its drawing box. */
export interface DrawingPoint {
  x: number;
  y: number;
  pressure: number;
}

/** One uninterrupted freehand gesture. */
export interface DrawingStroke {
  color: string;
  width: number;
  points: DrawingPoint[];
}

/** One element the user picked and commented on. */
export interface ElementSelection {
  kind: 'element';
  comment: string;
  /** Page where the annotation was captured. Omitted by older extension builds. */
  pageUrl?: string;
  /** Lowercase tag name, e.g. "article". */
  tag: string;
  selector: string;
  classes: string[];
  /** Leading text content, trimmed — enough to grep for when there is no source. */
  text: string;
  box: SelectionBox;
  /** A curated subset of computed styles, not the full ~340 properties. */
  styles: Record<string, string>;
  context?: ElementContext;
  source?: SelectionSource;
  /** Live edits made in the overlay, as an exact before and after. */
  styleChanges?: StyleChange[];
  /** Live text edit made in the overlay, as an exact before and after. */
  textChange?: TextChange;
  /** Id returned by POST /blob. Preferred over `screenshot`. */
  screenshotBlobId?: string;
  /** Legacy inline base64 PNG, no data-URL prefix. Still accepted. */
  screenshot?: string;
}

export interface DrawingSelection {
  kind: 'drawing';
  comment: string;
  /** Page where the annotation was captured. Omitted by older extension builds. */
  pageUrl?: string;
  box: SelectionBox;
  strokes: DrawingStroke[];
  /** Id returned by POST /blob. Preferred over `screenshot`. */
  screenshotBlobId?: string;
  /** Legacy inline base64 PNG, no data-URL prefix. Still accepted. */
  screenshot?: string;
}

/** One element or freehand region the user commented on. */
export type Selection = ElementSelection | DrawingSelection;

/** Body of `POST /send`. */
export interface ReviewPageNote {
  url: string;
  comment: string;
}

export interface SendRequest {
  /** Current page, retained as a fallback for payloads without per-item URLs. */
  url: string;
  /** herdr pane to deliver the review to. */
  paneId: string;
  /** Legacy single-page note. */
  pageNote?: string;
  pageNotes?: ReviewPageNote[];
  selections: Selection[];
}

/** Answer to `POST /send`. */
export interface SendResponse {
  pickId: string;
  notePath: string;
  paneId: string;
}
