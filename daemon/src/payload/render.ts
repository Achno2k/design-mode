import type { DrawingSelection, ElementSelection, Selection } from './types.ts';

/** A selection paired with the screenshot filename written next to the note. */
export interface RenderedSelection {
  selection: Selection;
  screenshotFile: string | null;
}

/** Turn selections into the concise Markdown note the agent reads. */
export function renderNote(url: string, items: RenderedSelection[], pageNote?: string): string {
  const heading = `# Browser review — ${url}`;
  const intro =
    items.length === 0
      ? 'A general page note was added in the browser.'
      : items.length === 1
        ? 'One review item was added in the browser.'
        : `${items.length} review items were added in the browser.`;

  const note = pageNote?.trim();
  const pageSection = note === undefined || note === '' ? [] : ['## Page note', '', ...quote(note), ''];
  const sections = items.map((item, index) => renderSelection(item, index + 1));
  return [heading, '', intro, '', ...pageSection, ...sections].join('\n').trimEnd() + '\n';
}

function renderSelection(item: RenderedSelection, position: number): string {
  const { selection, screenshotFile } = item;
  const lines = [`## ${position}. ${describeLocation(selection)}`, ''];

  if (selection.comment.trim() !== '') lines.push(...quote(selection.comment), '');

  const edits = selection.kind === 'element' ? renderStyleChanges(selection) : [];
  if (edits.length > 0) lines.push(...edits, '');
  lines.push(...renderFacts(selection));

  if (screenshotFile !== null) {
    const subject = selection.kind === 'drawing' ? 'drawing' : 'selection';
    lines.push('', `![${subject} ${position}](./${screenshotFile})`);
  }

  lines.push('');
  return lines.join('\n');
}

/** A source path is most actionable; drawings instead lead with their viewport location. */
function describeLocation(selection: Selection): string {
  if (selection.kind === 'drawing') {
    return `Drawing at (${Math.round(selection.box.x)}, ${Math.round(selection.box.y)})`;
  }
  if (selection.source === undefined) return `${selection.tag} (source unknown)`;
  return `${selection.source.file}:${selection.source.line}`;
}

/** Live edits are a specification rather than supporting context. */
function renderStyleChanges(selection: ElementSelection): string[] {
  const changes = selection.styleChanges ?? [];
  if (changes.length === 0) return [];

  return [
    'The user made these changes live in the browser. Apply them in the source:',
    '',
    '| property | from | to |',
    '| --- | --- | --- |',
    ...changes.map((change) => `| \`${change.property}\` | \`${change.from}\` | \`${change.to}\` |`),
  ];
}

function renderFacts(selection: Selection): string[] {
  return selection.kind === 'drawing' ? renderDrawingFacts(selection) : renderElementFacts(selection);
}

function renderDrawingFacts(selection: DrawingSelection): string[] {
  const pointCount = selection.strokes.reduce((total, stroke) => total + stroke.points.length, 0);
  const strokeLabel = selection.strokes.length === 1 ? 'stroke' : 'strokes';
  const pointLabel = pointCount === 1 ? 'sampled point' : 'sampled points';
  const brushes = Array.from(
    new Set(selection.strokes.map((stroke) => `${stroke.color} at ${formatNumber(stroke.width)}px`)),
  );

  return [
    `- annotation: freehand drawing with ${selection.strokes.length} ${strokeLabel} and ${pointCount} ${pointLabel}`,
    `- box: ${formatBox(selection)}`,
    `- brushes: ${brushes.map((brush) => `\`${brush}\``).join(', ')}`,
  ];
}

function renderElementFacts(selection: ElementSelection): string[] {
  const facts: string[] = [`- element: \`<${selection.tag}>\``];

  if (selection.selector !== '') facts.push(`- selector: \`${selection.selector}\``);
  if (selection.classes.length > 0) facts.push(`- classes: \`${selection.classes.join(' ')}\``);
  if (selection.text !== '') facts.push(`- text: ${JSON.stringify(selection.text)}`);

  facts.push(...renderContextFacts(selection));
  facts.push(`- box: ${formatBox(selection)}`);

  const styles = Object.entries(selection.styles);
  if (styles.length > 0) {
    facts.push(`- styles: ${styles.map(([name, value]) => `${name}: ${value}`).join('; ')}`);
  }

  if (selection.source === undefined) {
    facts.push(
      '- note: this build does not expose component source locations, so find the element by its text or classes.',
    );
  }
  return facts;
}

function renderContextFacts(selection: ElementSelection): string[] {
  const context = selection.context;
  if (context === undefined) return [];

  const summary: string[] = [];
  if (context.role !== undefined) summary.push(`role \`${context.role}\``);
  if (context.accessibleName !== undefined) summary.push(`accessible name ${JSON.stringify(context.accessibleName)}`);
  if (context.disabled !== undefined) summary.push(context.disabled ? 'disabled' : 'enabled');
  if (context.nearestHeading !== undefined) summary.push(`nearest heading ${JSON.stringify(context.nearestHeading)}`);

  const facts: string[] = [];
  if (summary.length > 0) facts.push(`- context: ${summary.join('; ')}`);

  const attributes = Object.entries(context.attributes);
  if (attributes.length > 0) {
    facts.push(
      `- attributes: ${attributes
        .map(([name, value]) => (value === '' ? `\`${name}\`` : `\`${name}=${JSON.stringify(value)}\``))
        .join('; ')}`,
    );
  }
  return facts;
}

function formatBox(selection: Selection): string {
  const { width, height, x, y } = selection.box;
  return `${Math.round(width)}x${Math.round(height)} at (${Math.round(x)}, ${Math.round(y)})`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '');
}

function quote(comment: string): string[] {
  return comment
    .trim()
    .split('\n')
    .map((line) => `> ${line}`);
}

/** The one-line prompt points at the note and mentions only images that exist. */
export function renderPrompt(
  notePath: string,
  count: number,
  url: string,
  hasScreenshots: boolean,
): string {
  const subject = count === 0 ? 'a general page note' : count === 1 ? '1 selection' : `${count} selections`;
  const action = count === 0 ? 'address it.' : 'address each comment.';
  const images = hasScreenshots ? ' Screenshots sit next to it in the same folder.' : '';

  return `Browser review — ${subject} on ${url}. Read @${notePath} and ${action}${images}`;
}
