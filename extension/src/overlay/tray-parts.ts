import { make } from './dom.ts';

/** Small pieces the toolbar is assembled from. */

/** A round icon-only button with its label for assistive tech and its tooltip. */
export function iconButton(
  className: string,
  markup: string,
  label: string,
  title = label,
): HTMLButtonElement {
  const button = make('button', {
    className,
    attributes: { type: 'button', title, 'aria-label': label },
  });
  button.innerHTML = markup;
  return button;
}

export function stopKeyboardLeak(event: KeyboardEvent): void {
  event.stopPropagation();
  event.stopImmediatePropagation();
}

export function isMac(): boolean {
  const modern = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
  return (modern?.platform ?? navigator.platform).toLowerCase().includes('mac');
}
