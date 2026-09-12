/** Where a panel sits, in viewport coordinates. */
export interface Point {
  x: number;
  y: number;
}

/** A panel the user can move, and put back. */
export interface Draggable {
  /** Move to a remembered position, clamped to the current viewport. */
  moveTo(position: Point): void;
  /** Return to the position the stylesheet gives it. */
  clear(): void;
  destroy(): void;
}

export interface DragOptions {
  /** Class marking that the panel sits where the user put it, not where CSS puts it. */
  floatingClass: string;
  /** Class applied for the duration of one drag. */
  draggingClass: string;
  /** The resting place after a drag, so the caller can remember it. */
  onSettle(position: Point): void;
}

/** Distance kept between the panel and the edges of the window. */
const MARGIN = 8;

/**
 * Let the user drag a `position: fixed` panel anywhere on screen.
 *
 * Only the handle starts a drag, and only when the press did not land on a
 * control inside it — otherwise picking an agent from the select would move the
 * bar instead. Pointer capture means a fast drag that outruns the cursor still
 * delivers its moves here rather than to the page underneath.
 */
export function makeDraggable(
  panel: HTMLElement,
  handle: HTMLElement,
  options: DragOptions,
): Draggable {
  let grabOffset: Point | null = null;
  let position: Point | null = null;

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    if (startsOnControl(event)) return;

    const box = panel.getBoundingClientRect();
    grabOffset = { x: event.clientX - box.left, y: event.clientY - box.top };

    // The panel must stop being centred before the first move, or it would jump.
    apply({ x: box.left, y: box.top });
    panel.classList.add(options.draggingClass);
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent): void {
    if (grabOffset === null) return;
    apply({ x: event.clientX - grabOffset.x, y: event.clientY - grabOffset.y });
  }

  function onPointerUp(event: PointerEvent): void {
    if (grabOffset === null) return;
    grabOffset = null;
    panel.classList.remove(options.draggingClass);
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    if (position !== null) options.onSettle(position);
  }

  /**
   * A window that shrank must not leave the panel off screen.
   *
   * Re-injection replaces the whole overlay, so this also unsubscribes once its
   * panel is no longer in the document.
   */
  function onResize(): void {
    if (!panel.isConnected) {
      window.removeEventListener('resize', onResize);
      return;
    }
    if (position !== null) apply(position);
  }

  function apply(next: Point): void {
    const { width, height } = panel.getBoundingClientRect();
    position = {
      x: clamp(next.x, MARGIN, Math.max(MARGIN, window.innerWidth - width - MARGIN)),
      y: clamp(next.y, MARGIN, Math.max(MARGIN, window.innerHeight - height - MARGIN)),
    };

    panel.classList.add(options.floatingClass);
    panel.style.left = `${Math.round(position.x)}px`;
    panel.style.top = `${Math.round(position.y)}px`;
  }

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);
  handle.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('resize', onResize);

  return {
    moveTo: apply,

    clear() {
      position = null;
      grabOffset = null;
      panel.classList.remove(options.floatingClass, options.draggingClass);
      panel.style.removeProperty('left');
      panel.style.removeProperty('top');
    },

    destroy() {
      handle.removeEventListener('pointerdown', onPointerDown);
      handle.removeEventListener('pointermove', onPointerMove);
      handle.removeEventListener('pointerup', onPointerUp);
      handle.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('resize', onResize);
    },
  };
}

/** Presses that belong to a control, or to a region that opted out with `data-drag-ignore`. */
function startsOnControl(event: PointerEvent): boolean {
  const target = event.target;
  return (
    target instanceof Element &&
    target.closest('button, select, input, textarea, a, img, [data-drag-ignore]') !== null
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
