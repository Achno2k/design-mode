/**
 * The daemon's HTTP contract.
 *
 * This file is duplicated verbatim in `daemon/src/payload/types.ts` and mirrors
 * the responses in `daemon/src/server/routes/`. The two halves ship separately
 * and a shared package would couple their builds for no benefit, so the
 * contract is copied rather than imported. Change both.
 */

export interface SelectionSource {
  file: string;
  /** Omitted when a framework exposes the file but not a trustworthy line. */
  line?: number;
  column?: number;
}

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

export interface ElementSelection {
  kind: 'element';
  comment: string;
  /** Page where the annotation was captured. Omitted by older extension builds. */
  pageUrl?: string;
  tag: string;
  selector: string;
  classes: string[];
  text: string;
  box: SelectionBox;
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

export interface ReviewPageNote {
  url: string;
  comment: string;
}

export interface SendRequest {
  /** Current page, retained as a fallback for payloads without per-item URLs. */
  url: string;
  paneId: string;
  /** Legacy single-page note. */
  pageNote?: string;
  pageNotes?: ReviewPageNote[];
  selections: Selection[];
  /** Console errors captured while the session was open, when the user turned that on. */
  consoleErrors?: ConsoleEntry[];
}

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

export type AgentStatus = 'idle' | 'working' | 'blocked' | 'done' | 'unknown';

/** A herdr agent that could act on the current page. */
export interface Target {
  paneId: string;
  workspaceId: string;
  label: string;
  agent: string;
  status: AgentStatus;
  cwd: string;
  focused: boolean;
  lastActiveSeq: number;
}

export interface TargetsResponse {
  projectDir: string | null;
  scope: string | null;
  resolved: Target | null;
  candidates: Target[];
  /** Present when nothing matched; safe to show to the user. */
  message?: string;
  /** How projectDir was determined. */
  source: 'lsof' | 'none';
}

export interface HealthResponse {
  ok: true;
  protocol: 3;
  /** First 4 chars of the token, so the popup can identify the pairing. */
  tokenHint: string;
}

export interface BlobResponse {
  blobId: string;
}

