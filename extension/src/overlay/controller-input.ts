import type { Draft } from './composer.ts';

/** Command-period on macOS, control-period elsewhere. */
export function isAnnotateShortcut(event: KeyboardEvent): boolean {
  return event.key === '.' && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey;
}

/** Find the page element under a pointer while excluding the shadow overlay. */
export function pageElementAt(event: MouseEvent, host: Element): Element | null {
  if (event.composedPath().includes(host)) return null;

  const element = document.elementFromPoint(event.clientX, event.clientY);
  return element === null || element === host || element === document.documentElement ? null : element;
}

/** Describe source and live-edit capture in one short tray message. */
export function describeAdded(draft: Draft, hasSource: boolean): string {
  // A rewritten line of copy counts as an edit alongside the style changes.
  const edits = draft.styleChanges.length + (draft.textChange === undefined ? 0 : 1);
  const parts = [edits === 0 ? 'Added' : `Added with ${edits} live edit${edits === 1 ? '' : 's'}`];
  if (!hasSource) parts.push('no source location in this build');
  return `${parts.join(' — ')}.`;
}

export function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
