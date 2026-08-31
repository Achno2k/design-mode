import { isContextAlive } from './messaging.ts';

/** Where the user parked a movable panel. */
export interface StoredPosition {
  x: number;
  y: number;
}

/**
 * Remember where the toolbar was left, for as long as the session lasts.
 *
 * Kept in extension storage rather than the page's, both because the page must
 * not be written to and because a session survives full-page navigations that
 * replace the content script. It is dropped when the session ends, so every
 * session opens docked at the bottom. Storage failures are silent: an overlay
 * that opens in the default place is a far smaller problem than one that
 * refuses to open.
 */
const KEY = 'trayPosition';

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

function isPosition(value: unknown): value is StoredPosition {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.x === 'number' && typeof candidate.y === 'number';
}
