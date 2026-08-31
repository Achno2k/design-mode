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
}

export interface SendResponse {
  pickId: string;
  notePath: string;
  paneId: string;
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
  protocol: 2;
  /** First 4 chars of the token, so the popup can identify the pairing. */
  tokenHint: string;
}

export interface BlobResponse {
  blobId: string;
}

