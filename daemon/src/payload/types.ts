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
  /** The value as written in the stylesheet, e.g. `var(--space-4)`, when a rule was found. */
  fromAuthored?: string;
  authoredBy?: AuthoredBy;
}

/** The element's text content, retyped live in the browser. */
export interface TextChange {
  from: string;
  to: string;
}

/** How the user triaged an item: what kind of issue it is and how urgent. */
export type ItemCategory = 'bug' | 'polish' | 'question';
export type ItemPriority = 'P1' | 'P2' | 'P3';

export interface ItemTriage {
  category?: ItemCategory;
  priority?: ItemPriority;
}

/** The browser viewport when an item was captured, in CSS pixels. */
export interface Viewport {
  width: number;
  height: number;
  dpr: number;
  scrollX: number;
  scrollY: number;
}

/** One console error captured while the review session was open. */
export interface ConsoleEntry {
  level: 'error' | 'rejection' | 'console';
  message: string;
  stack?: string;
  /** Milliseconds since the epoch. */
  at: number;
  pageUrl: string;
  /** How many consecutive identical messages this entry stands for. */
  count: number;
}

/** Authored declarations that apply to the element in one interactive state. */
export interface PseudoStyle {
  pseudo: ':hover' | ':focus' | ':focus-visible' | ':active';
  selector: string;
  sheet?: string;
  declarations: Record<string, string>;
}

/** The stylesheet rule that authored a value, so the agent can find it in source. */
export interface AuthoredBy {
  selector: string;
  sheet?: string;
  /** Classes on the element that the rule's selector names, e.g. Tailwind utilities. */
  classes?: string[];
}

/** The same-origin iframe an element lives in, located from the top document. */
export interface FrameRef {
  selector: string;
  url: string;
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
  triage?: ItemTriage;
  /** Selector per document scope; a `::shadow` segment marks a shadow-root boundary. */
  path?: string[];
  frame?: FrameRef;
  viewport?: Viewport;
  pseudoStyles?: PseudoStyle[];
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
  triage?: ItemTriage;
  viewport?: Viewport;
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
  /** Console errors captured while the session was open, when the user turned that on. */
  consoleErrors?: ConsoleEntry[];
}

/** Answer to `POST /send`. */
export interface SendResponse {
  pickId: string;
  notePath: string;
  paneId: string;
}

/** Where the agent is with a sent review. `lost` means its pane no longer hosts that agent. */
export type PickStatus = 'queued' | 'working' | 'blocked' | 'done' | 'lost';

/** Answer to `GET /pick?id=&since=`. */
export interface PickStatusResponse {
  pickId: string;
  paneId: string;
  status: PickStatus;
  /** Bumps on every status change; pass it back as `since` to long-poll. */
  seq: number;
  followUps: number;
  notePath: string;
}

/** Body of `POST /pick/follow-up`. */
export interface FollowUpRequest {
  pickId: string;
  comment: string;
}

/** Answer to `POST /pick/follow-up`. */
export interface FollowUpResponse {
  pickId: string;
  followUp: number;
  notePath: string;
}

