
import { err, ok, type Result } from '../result.ts';
import {
  parseConsoleErrors,
  parseFrame,
  parsePath,
  parsePseudoStyles,
  parseTriage,
  parseViewport,
} from './parse-extras.ts';
import {
  isFiniteNumber,
  isPositiveNumber,
  isRecord,
  readString,
  readStringArray,
  readStringMap,
} from './parse-primitives.ts';
import type {
  DrawingPoint,
  DrawingSelection,
  DrawingStroke,
  ElementSelection,
  ReviewPageNote,
  Selection,
  SelectionBox,
  SendRequest,
  StyleChange,
  TextChange,
} from './types.ts';

const MAX_TEXT_CHANGE_LENGTH = 4_000;

/**
 * Validate a `POST /send` body.
 *
 * The body arrives from a web page, so nothing in it is trusted. Anything
 * malformed is rejected with a message naming the offending field rather than
 * being silently coerced.
 */
export function parseSendRequest(body: unknown): Result<SendRequest> {
  if (!isRecord(body)) return err('Expected a JSON object.');

  const url = readString(body.url);
  if (url === null) return err('"url" must be a non-empty string.');

  const paneId = readString(body.paneId);
  if (paneId === null) return err('"paneId" must be a non-empty string.');

  const pageNote = readString(body.pageNote) ?? undefined;
  const pageNotes = parsePageNotes(body.pageNotes);
  const consoleErrors = parseConsoleErrors(body.consoleErrors);
  if (!Array.isArray(body.selections)) return err('"selections" must be an array.');
  if (body.selections.length === 0 && pageNote === undefined && pageNotes.length === 0) {
    return err('Provide at least one selection or a non-empty "pageNote" or "pageNotes" entry.');
  }

  const selections: Selection[] = [];
  for (const [index, raw] of body.selections.entries()) {
    const selection = parseSelection(raw);
    if (!selection.ok) return err(`Selection ${index + 1}: ${selection.error}`);
    selections.push(selection.value);
  }

  return ok({
    url,
    paneId,
    ...(pageNote === undefined ? {} : { pageNote }),
    ...(pageNotes.length === 0 ? {} : { pageNotes }),
    selections,
    ...(consoleErrors === undefined ? {} : { consoleErrors }),
  });
}

function parseSelection(raw: unknown): Result<Selection> {
  if (!isRecord(raw)) return err('expected an object.');

  if (raw.kind === 'drawing') return parseDrawing(raw);
  // Older extensions did not send a discriminator; those payloads remain valid elements.
  if (raw.kind === undefined || raw.kind === 'element') return parseElement(raw);
  return err('"kind" must be "element" or "drawing".');
}

function parseElement(raw: Record<string, unknown>): Result<ElementSelection> {
  const box = parseBox(raw.box);
  if (!box.ok) return box;

  const textChange = parseTextChange(raw.textChange);
  if (!textChange.ok) return textChange;

  return ok({
    kind: 'element',
    comment: readString(raw.comment) ?? '',
    pageUrl: readString(raw.pageUrl) ?? undefined,
    tag: readString(raw.tag) ?? 'unknown',
    selector: readString(raw.selector) ?? '',
    classes: readStringArray(raw.classes),
    text: readString(raw.text) ?? '',
    box: box.value,
    styles: readStringMap(raw.styles),
    context: parseContext(raw.context),
    source: parseSource(raw.source),
    styleChanges: parseStyleChanges(raw.styleChanges),
    textChange: textChange.value,
    screenshotBlobId: readString(raw.screenshotBlobId) ?? undefined,
    screenshot: readString(raw.screenshot) ?? undefined,
    triage: parseTriage(raw.triage),
    path: parsePath(raw.path),
    frame: parseFrame(raw.frame),
    viewport: parseViewport(raw.viewport),
    pseudoStyles: parsePseudoStyles(raw.pseudoStyles),
  });
}

function parseDrawing(raw: Record<string, unknown>): Result<DrawingSelection> {
  const comment = readString(raw.comment);
  if (comment === null) return err('drawing "comment" must be a non-empty string.');

  const box = parseBox(raw.box);
  if (!box.ok) return box;
  if (box.value.width <= 0 || box.value.height <= 0) {
    return err('drawing "box" width and height must be positive.');
  }
  if (!Array.isArray(raw.strokes) || raw.strokes.length === 0) {
    return err('drawing "strokes" must contain at least one stroke.');
  }

  const strokes: DrawingStroke[] = [];
  for (const [index, value] of raw.strokes.entries()) {
    const stroke = parseStroke(value);
    if (!stroke.ok) return err(`stroke ${index + 1}: ${stroke.error}`);
    strokes.push(stroke.value);
  }

  return ok({
    kind: 'drawing',
    comment,
    pageUrl: readString(raw.pageUrl) ?? undefined,
    box: box.value,
    strokes,
    screenshotBlobId: readString(raw.screenshotBlobId) ?? undefined,
    screenshot: readString(raw.screenshot) ?? undefined,
    triage: parseTriage(raw.triage),
    viewport: parseViewport(raw.viewport),
  });
}

function parseStroke(raw: unknown): Result<DrawingStroke> {
  if (!isRecord(raw)) return err('expected an object.');

  const color = readString(raw.color);
  if (color === null) return err('"color" must be a non-empty string.');
  if (!isPositiveNumber(raw.width)) return err('"width" must be a positive number.');
  if (!Array.isArray(raw.points) || raw.points.length === 0) {
    return err('"points" must contain at least one point.');
  }

  const points: DrawingPoint[] = [];
  for (const [index, value] of raw.points.entries()) {
    const point = parsePoint(value);
    if (!point.ok) return err(`point ${index + 1}: ${point.error}`);
    points.push(point.value);
  }
  return ok({ color, width: raw.width, points });
}

function parsePoint(raw: unknown): Result<DrawingPoint> {
  if (!isRecord(raw)) return err('expected an object.');
  if (!isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) {
    return err('"x" and "y" must be finite numbers.');
  }
  if (!isFiniteNumber(raw.pressure) || raw.pressure < 0 || raw.pressure > 1) {
    return err('"pressure" must be a number from 0 to 1.');
  }
  return ok({ x: raw.x, y: raw.y, pressure: raw.pressure });
}

function parseBox(raw: unknown): Result<SelectionBox> {
  if (!isRecord(raw)) return err('"box" is missing.');

  const numbers = (['x', 'y', 'width', 'height'] as const).map((key) => raw[key]);
  if (!numbers.every(isFiniteNumber)) {
    return err('"box" needs numeric x, y, width and height.');
  }

  const [x, y, width, height] = numbers as number[];
  return ok({ x: x ?? 0, y: y ?? 0, width: width ?? 0, height: height ?? 0 });
}

/** Context is optional, and malformed pieces are dropped rather than fatal. */
function parseContext(raw: unknown): ElementSelection['context'] {
  if (!isRecord(raw)) return undefined;

  const role = readString(raw.role) ?? undefined;
  const accessibleName = readString(raw.accessibleName) ?? undefined;
  const nearestHeading = readString(raw.nearestHeading) ?? undefined;
  const disabled = typeof raw.disabled === 'boolean' ? raw.disabled : undefined;
  const attributes = readStringMap(raw.attributes);

  if (
    role === undefined &&
    accessibleName === undefined &&
    nearestHeading === undefined &&
    disabled === undefined &&
    Object.keys(attributes).length === 0
  ) {
    return undefined;
  }

  return { role, accessibleName, attributes, disabled, nearestHeading };
}

/** Source is optional everywhere — production builds simply do not expose it. */
function parseSource(raw: unknown): ElementSelection['source'] {
  if (!isRecord(raw)) return undefined;

  const file = readString(raw.file);
  const line = raw.line;
  if (file === null || typeof line !== 'number') return undefined;

  const column = typeof raw.column === 'number' ? raw.column : undefined;
  return { file, line, column };
}

function parseTextChange(raw: unknown): Result<TextChange | undefined> {
  if (raw === undefined) return ok(undefined);
  if (!isRecord(raw) || typeof raw.from !== 'string' || typeof raw.to !== 'string') {
    return err('"textChange" must be an object with string "from" and "to" values.');
  }
  if (raw.from.length > MAX_TEXT_CHANGE_LENGTH) {
    return err(`"textChange.from" must be ${MAX_TEXT_CHANGE_LENGTH} characters or fewer.`);
  }
  if (raw.to.length > MAX_TEXT_CHANGE_LENGTH) {
    return err(`"textChange.to" must be ${MAX_TEXT_CHANGE_LENGTH} characters or fewer.`);
  }
  return ok({ from: raw.from, to: raw.to });
}

/** Live edits are optional, and a malformed one is dropped rather than fatal. */
function parseStyleChanges(raw: unknown): StyleChange[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const changes = raw.flatMap((entry) => {
    if (!isRecord(entry)) return [];

    const property = readString(entry.property);
    const from = readString(entry.from);
    const to = readString(entry.to);
    if (property === null || from === null || to === null) return [];

    const fromAuthored = readString(entry.fromAuthored);
    const authoredBy = parseAuthoredBy(entry.authoredBy);
    return [
      {
        property,
        from,
        to,
        ...(fromAuthored === null ? {} : { fromAuthored }),
        ...(authoredBy === undefined ? {} : { authoredBy }),
      },
    ];
  });

  return changes.length === 0 ? undefined : changes;
}

function parseAuthoredBy(raw: unknown): StyleChange['authoredBy'] {
  if (!isRecord(raw)) return undefined;

  const selector = readString(raw.selector);
  if (selector === null) return undefined;

  const sheet = readString(raw.sheet);
  const classes = readStringArray(raw.classes);
  return {
    selector,
    ...(sheet === null ? {} : { sheet }),
    ...(classes.length === 0 ? {} : { classes }),
  };
}

function parsePageNotes(raw: unknown): ReviewPageNote[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const url = readString(entry.url);
    const comment = readString(entry.comment);
    return url === null || comment === null ? [] : [{ url, comment }];
  });
}
