const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const DEFAULT_COLOR = '#ff4d3d';
const DEFAULT_WIDTH = 4;
const MIN_POINT_DISTANCE = 0.5;

/** A pointer sample in viewport CSS pixels. */
export interface DrawingPoint {
  x: number;
  y: number;
  /** Normalized pointer pressure. Mouse input is recorded as 0.5. */
  pressure: number;
}

/** One uninterrupted pointer gesture. */
export interface DrawingStroke {
  color: string;
  width: number;
  points: DrawingPoint[];
}

/** The ink and its capture region, all in viewport CSS pixels. */
export interface DrawingSnapshot {
  box: { x: number; y: number; width: number; height: number };
  strokes: DrawingStroke[];
}

export interface DrawingBrush {
  color: string;
  width: number;
}

export interface DrawingOptions {
  brush?: Partial<DrawingBrush>;
  /** Additional escape hatch for controls outside the standard overlay panels. */
  shouldIgnoreEvent?: (event: PointerEvent) => boolean;
  onModeChange?: (active: boolean) => void;
  /** Called when Escape leaves draw mode; completed ink is deliberately retained. */
  onCancelRequested?: () => void;
}

/**
 * Freehand ink owned by the shadow overlay.
 *
 * Controller integration is intentionally transactional:
 *
 * - `enter()` intercepts page pointers and starts drawing.
 * - `leave()` stops intercepting but leaves ink visible for a composer and tab capture.
 * - `commit()` returns a detached snapshot and removes the visible ink.
 * - `clear()` abandons the ink, while `destroy()` also removes listeners and DOM.
 *
 * Escape cancels an in-progress stroke first. A second Escape leaves draw mode and
 * invokes `onCancelRequested`, allowing the controller to update its tray state.
 * Tray/composer panels and normal interactive controls are never drawing targets.
 */
export interface DrawingOverlay {
  enter(brush?: Partial<DrawingBrush>): void;
  leave(): void;
  clear(): void;
  commit(): DrawingSnapshot | null;
  snapshot(): DrawingSnapshot | null;
  cancelCurrentStroke(): boolean;
  isActive(): boolean;
  hasInk(): boolean;
  destroy(): void;
}

type ActiveStroke = {
  pointerId: number;
  stroke: DrawingStroke;
  path: SVGPathElement;
};

/** Create a freehand drawing surface as the bottom-most child of an overlay layer. */
export function createDrawing(layer: HTMLElement, options: DrawingOptions = {}): DrawingOverlay {
  const surface = createSurface();
  // Existing panels are painted after the ink and remain clickable above it.
  layer.prepend(surface);

  const strokes: DrawingStroke[] = [];
  const paths: SVGPathElement[] = [];
  let brush = normalizeBrush(options.brush);
  let activeStroke: ActiveStroke | null = null;
  let active = false;
  let destroyed = false;

  function enter(nextBrush?: Partial<DrawingBrush>): void {
    if (destroyed) return;
    brush = normalizeBrush({ ...brush, ...nextBrush });
    if (active) return;

    active = true;
    surface.style.pointerEvents = 'all';
    surface.style.cursor = 'crosshair';
    options.onModeChange?.(true);
  }

  function leave(): void {
    if (!active) return;
    finishCurrentStroke();
    active = false;
    surface.style.pointerEvents = 'none';
    surface.style.cursor = 'default';
    options.onModeChange?.(false);
  }

  function clear(): void {
    discardCurrentStroke();
    strokes.length = 0;
    for (const path of paths) path.remove();
    paths.length = 0;
  }

  function commit(): DrawingSnapshot | null {
    leave();
    const result = snapshot();
    clear();
    return result;
  }

  function snapshot(): DrawingSnapshot | null {
    const allStrokes = currentStrokes();
    const box = measureStrokes(allStrokes);
    if (box === null) return null;

    return {
      box,
      strokes: allStrokes.map((stroke) => ({
        color: stroke.color,
        width: stroke.width,
        points: stroke.points.map((point) => ({ ...point })),
      })),
    };
  }

  function beginStroke(event: PointerEvent): void {
    if (!active || isIgnoredPointer(event, options)) return;

    // The transparent SVG, not the page, owns the gesture while draw mode is on.
    event.preventDefault();
    event.stopPropagation();
    if (activeStroke !== null || !event.isPrimary || event.button !== 0) return;

    const stroke: DrawingStroke = { ...brush, points: [] };
    const path = createPath(stroke);
    surface.append(path);
    activeStroke = { pointerId: event.pointerId, stroke, path };

    appendEvents(event);
    tryCapture(event.pointerId);
  }

  function moveStroke(event: PointerEvent): void {
    if (!active || isIgnoredPointer(event, options)) return;
    event.preventDefault();
    event.stopPropagation();
    if (activeStroke?.pointerId === event.pointerId) appendEvents(event);
  }

  function endStroke(event: PointerEvent): void {
    if (!active || isIgnoredPointer(event, options)) return;
    event.preventDefault();
    event.stopPropagation();
    if (activeStroke?.pointerId !== event.pointerId) return;
    appendEvents(event);
    finishCurrentStroke();
  }

  function appendEvents(event: PointerEvent): void {
    const samples = event.getCoalescedEvents?.() ?? [event];
    for (const sample of samples) appendPoint(sample);
    if (samples.length === 0) appendPoint(event);
  }

  function appendPoint(event: PointerEvent): void {
    if (activeStroke === null) return;

    const point = pointerPoint(event);
    const previous = activeStroke.stroke.points.at(-1);
    if (previous !== undefined && distance(previous, point) < MIN_POINT_DISTANCE) return;

    activeStroke.stroke.points.push(point);
    activeStroke.path.setAttribute('d', pathData(activeStroke.stroke.points));
  }

  function finishCurrentStroke(): void {
    const current = activeStroke;
    if (current === null) return;
    activeStroke = null;
    releaseCapture(current.pointerId);

    if (current.stroke.points.length === 0) {
      current.path.remove();
      return;
    }
    strokes.push(current.stroke);
    paths.push(current.path);
  }

  function discardCurrentStroke(): boolean {
    const current = activeStroke;
    if (current === null) return false;
    activeStroke = null;
    releaseCapture(current.pointerId);
    current.path.remove();
    return true;
  }

  function tryCapture(pointerId: number): void {
    try {
      surface.setPointerCapture(pointerId);
    } catch {
      // Capture can fail if the pointer ended between dispatch and this call.
    }
  }

  function releaseCapture(pointerId: number): void {
    try {
      if (surface.hasPointerCapture(pointerId)) surface.releasePointerCapture(pointerId);
    } catch {
      // The browser may already have released capture after pointer cancellation.
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!active || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();

    if (discardCurrentStroke()) return;
    leave();
    options.onCancelRequested?.();
  }

  function onPointerCancel(event: PointerEvent): void {
    if (!active || isIgnoredPointer(event, options)) return;
    event.preventDefault();
    event.stopPropagation();
    if (activeStroke?.pointerId === event.pointerId) discardCurrentStroke();
  }

  function suppressPageEvent(event: Event): void {
    if (!active || isOverlayControl(event)) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function onLostPointerCapture(event: PointerEvent): void {
    if (activeStroke?.pointerId === event.pointerId) finishCurrentStroke();
  }

  function destroy(): void {
    if (destroyed) return;
    clear();
    leave();
    destroyed = true;
    removeListeners();
    surface.remove();
  }

  function removeListeners(): void {
    layer.removeEventListener('pointerdown', beginStroke, true);
    layer.removeEventListener('pointermove', moveStroke, true);
    layer.removeEventListener('pointerup', endStroke, true);
    layer.removeEventListener('pointercancel', onPointerCancel, true);
    for (const type of suppressedEvents) layer.removeEventListener(type, suppressPageEvent, true);
    layer.removeEventListener('wheel', suppressPageEvent, true);
    surface.removeEventListener('lostpointercapture', onLostPointerCapture);
    window.removeEventListener('keydown', onKeyDown, true);
  }

  layer.addEventListener('pointerdown', beginStroke, true);
  layer.addEventListener('pointermove', moveStroke, true);
  layer.addEventListener('pointerup', endStroke, true);
  layer.addEventListener('pointercancel', onPointerCancel, true);
  for (const type of suppressedEvents) layer.addEventListener(type, suppressPageEvent, true);
  layer.addEventListener('wheel', suppressPageEvent, { capture: true, passive: false });
  surface.addEventListener('lostpointercapture', onLostPointerCapture);
  window.addEventListener('keydown', onKeyDown, true);

  return {
    enter,
    leave,
    clear,
    commit,
    snapshot,
    cancelCurrentStroke: discardCurrentStroke,
    isActive: () => active,
    hasInk: () => activeStroke !== null || strokes.length > 0,
    destroy,
  };

  function currentStrokes(): DrawingStroke[] {
    return activeStroke === null ? strokes : [...strokes, activeStroke.stroke];
  }
}

const suppressedEvents = [
  'click',
  'dblclick',
  'contextmenu',
  'mousedown',
  'mousemove',
  'mouseup',
  'pointerover',
  'pointerout',
] as const;

function createSurface(): SVGSVGElement {
  const surface = document.createElementNS(SVG_NAMESPACE, 'svg');
  surface.setAttribute('aria-hidden', 'true');
  surface.style.cssText = [
    'position:fixed',
    'inset:0',
    'width:100%',
    'height:100%',
    'overflow:visible',
    'pointer-events:none',
    'touch-action:none',
    'z-index:0',
  ].join(';');
  return surface;
}

function createPath(stroke: DrawingStroke): SVGPathElement {
  const path = document.createElementNS(SVG_NAMESPACE, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', stroke.color);
  path.setAttribute('stroke-width', String(stroke.width));
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  path.style.pointerEvents = 'none';
  return path;
}

function isIgnoredPointer(event: PointerEvent, options: DrawingOptions): boolean {
  return options.shouldIgnoreEvent?.(event) === true || isOverlayControl(event);
}

function isOverlayControl(event: Event): boolean {
  return event.composedPath().some((target) => {
    if (!(target instanceof Element)) return false;
    return target.matches(
      '.tray, .composer, .panel, button, input, select, textarea, a[href], [contenteditable="true"], [data-herdr-drawing-ignore]',
    );
  });
}

function pointerPoint(event: PointerEvent): DrawingPoint {
  const pressure = event.pressure > 0 ? event.pressure : 0.5;
  return {
    x: round(event.clientX),
    y: round(event.clientY),
    pressure: round(Math.min(1, Math.max(0, pressure))),
  };
}

function pathData(points: DrawingPoint[]): string {
  const first = points[0];
  if (first === undefined) return '';
  if (points.length === 1) return `M ${first.x} ${first.y} l 0 0.01`;
  if (points.length === 2) {
    const second = points[1];
    return second === undefined ? '' : `M ${first.x} ${first.y} L ${second.x} ${second.y}`;
  }

  const commands = [`M ${first.x} ${first.y}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    if (point === undefined || next === undefined) continue;
    commands.push(`Q ${point.x} ${point.y} ${midpoint(point.x, next.x)} ${midpoint(point.y, next.y)}`);
  }
  const last = points.at(-1);
  if (last !== undefined) commands.push(`L ${last.x} ${last.y}`);
  return commands.join(' ');
}

function measureStrokes(strokes: DrawingStroke[]): DrawingSnapshot['box'] | null {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const stroke of strokes) {
    const radius = stroke.width / 2;
    for (const point of stroke.points) {
      left = Math.min(left, point.x - radius);
      top = Math.min(top, point.y - radius);
      right = Math.max(right, point.x + radius);
      bottom = Math.max(bottom, point.y + radius);
    }
  }

  if (!Number.isFinite(left)) return null;
  return {
    x: round(left),
    y: round(top),
    width: round(right - left),
    height: round(bottom - top),
  };
}

function normalizeBrush(brush: Partial<DrawingBrush> | undefined): DrawingBrush {
  const color = brush?.color?.trim();
  const width = brush?.width;
  return {
    color: color === undefined || color === '' ? DEFAULT_COLOR : color,
    width: width !== undefined && Number.isFinite(width) && width > 0 ? width : DEFAULT_WIDTH,
  };
}

function distance(left: DrawingPoint, right: DrawingPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function midpoint(left: number, right: number): number {
  return round((left + right) / 2);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
