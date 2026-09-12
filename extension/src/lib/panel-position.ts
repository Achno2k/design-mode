import { isContextAlive } from './messaging.ts';

/** Where the user parked a movable panel. */
export interface StoredPosition {
  x: number;
  y: number;
}

/** Which screen edge the collapsed toolbar is parked against. */
export type TraySide = 'left' | 'right';

/**
 * Remember where the toolbar was left and whether it was collapsed, for as long
 * as the session lasts.
 *
 * Kept in extension storage rather than the page's, both because the page must
 * not be written to and because a session survives full-page navigations that
 * replace the content script — a bar collapsed out of the way has to stay out
 * of the way on the next page, or the user has to dismiss it again per page.
 * Both are dropped when the session ends, so every session opens docked at the
 * bottom and expanded. Storage failures are silent: an overlay that opens in
 * the default place is a far smaller problem than one that refuses to open.
 */
const KEY = 'trayPosition';
const COLLAPSED_KEY = 'trayCollapsed';

export async function readPanelPosition(): Promise<StoredPosition | null> {
  if (!isContextAlive()) return null;

  try {
    const stored = await chrome.storage.local.get(KEY);
    const value: unknown = stored[KEY];
    return isPosition(value) ? value : null;
  } catch {
    return null;
  }
}

export function writePanelPosition(position: StoredPosition): void {
  if (!isContextAlive()) return;
  void chrome.storage.local.set({ [KEY]: position }).catch(() => {});
}

/** Forget the parked place, so the next session opens docked at the bottom. */
export function clearPanelPosition(): void {
  if (!isContextAlive()) return;
  void chrome.storage.local.remove(KEY).catch(() => {});
}

/** The edge the bar was collapsed to, or `null` if it was left expanded. */
export async function readTrayCollapse(): Promise<TraySide | null> {
  if (!isContextAlive()) return null;

  try {
    const stored = await chrome.storage.local.get(COLLAPSED_KEY);
    const value: unknown = stored[COLLAPSED_KEY];
    return value === 'left' || value === 'right' ? value : null;
  } catch {
    return null;
  }
}

export function writeTrayCollapse(side: TraySide): void {
  if (!isContextAlive()) return;
  void chrome.storage.local.set({ [COLLAPSED_KEY]: side }).catch(() => {});
}

/** Forget the collapse, so the next session opens with the bar showing. */
export function clearTrayCollapse(): void {
  if (!isContextAlive()) return;
  void chrome.storage.local.remove(COLLAPSED_KEY).catch(() => {});
}

function isPosition(value: unknown): value is StoredPosition {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.x === 'number' && typeof candidate.y === 'number';
}
