import {
  renderAuthoredCell,
  renderConsoleErrors,
  renderPseudoStyleFacts,
  renderTriage,
  renderViewportFact,
} from './render-extras.ts';
import type {
  ConsoleEntry,
  DrawingSelection,
  ElementSelection,
  ReviewPageNote,
  Selection,
} from './types.ts';

/** A selection paired with the screenshot filename written next to the note. */
export interface RenderedSelection {
  selection: Selection;
  screenshotFile: string | null;
}

/** Turn selections into the concise Markdown note the agent reads. */
export function renderNote(
  url: string,
  items: RenderedSelection[],
  pageNote?: string,
  pageNotes: ReviewPageNote[] = [],
  consoleErrors: ConsoleEntry[] = [],
): string {
  const pages = reviewPages(url, items, pageNotes);
  const heading = `# Browser review — ${pages.length === 1 ? pages[0] : `${pages.length} pages`}`;
  const intro = describeReview(items.length, pages.length);

  const note = pageNote?.trim();
  const legacyPageSection =
    note === undefined || note === '' ? [] : ['## Page note', '', ...quote(note), ''];
  const pageSections = pageNotes.flatMap((entry) => [
    `## Page note — ${entry.url}`,
    '',
    ...quote(entry.comment),
    '',
  ]);
  const consoleSection = renderConsoleErrors(consoleErrors);
  const sections = items.map((item, index) => renderSelection(item, index + 1));
  return [heading, '', intro, '', ...legacyPageSection, ...pageSections, ...consoleSection, ...sections]
    .join('\n')
    .trimEnd() + '\n';
}

function describeReview(itemCount: number, pageCount: number): string {
  if (itemCount === 0) {
    return pageCount === 1
      ? 'A general page note was added in the browser.'
      : `General page notes were added across ${pageCount} pages.`;
  }

  const items = itemCount === 1 ? 'One review item was' : `${itemCount} review items were`;
  return pageCount === 1 ? `${items} added in the browser.` : `${items} added across ${pageCount} pages.`;
}

function reviewPages(
  fallbackUrl: string,
  items: RenderedSelection[],
  pageNotes: ReviewPageNote[],
): string[] {
  const pages = new Set([
    ...items.flatMap(({ selection }) => (selection.pageUrl === undefined ? [] : [selection.pageUrl])),
    ...pageNotes.map((note) => note.url),
  ]);
  if (pages.size === 0 || items.some(({ selection }) => selection.pageUrl === undefined)) {
    pages.add(fallbackUrl);
  }
  return [...pages];
}

function renderSelection(item: RenderedSelection, position: number): string {
  const { selection, screenshotFile } = item;
  const lines = [`## ${position}. ${renderTriage(selection.triage)}${describeLocation(selection)}`, ''];

  if (selection.comment.trim() !== '') lines.push(...quote(selection.comment), '');

  const edits = selection.kind === 'element' ? renderLiveChanges(selection) : [];
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
function renderLiveChanges(selection: ElementSelection): string[] {
  const text = renderTextChange(selection);
  const styles = renderStyleChanges(selection);
  return text.length > 0 && styles.length > 0 ? [...text, '', ...styles] : [...text, ...styles];
}

function renderTextChange(selection: ElementSelection): string[] {
  const change = selection.textChange;
  if (change === undefined) return [];
  if (!change.from.includes('\n') && !change.to.includes('\n')) {
    return renderInlineTextChange(change.from, change.to);
  }

  return [
    'The user retyped this text live in the browser. Apply it in the source:',
    '',
    'Before:',
    ...renderTextValue(change.from),
    '',
    'After:',
    ...renderTextValue(change.to),
  ];
}

function renderInlineTextChange(from: string, to: string): string[] {
  if (from === '' && to === '') {
    return ['The user kept this text empty in the browser. Keep it empty in the source.'];
  }
  if (from === '') {
    const added = inlineCode(to);
    return [`The user added this text live in the browser: ${added}. Apply it in the source.`];
  }
  if (to === '') {
    const deleted = inlineCode(from);
    return [`The user deleted this text live in the browser: ${deleted}. Remove it from the source.`];
  }

  const before = inlineCode(from);
  const after = inlineCode(to);
  return [
    `The user retyped this text live in the browser from ${before} to ${after}. Apply it in the source.`,
  ];
}

function inlineCode(value: string): string {
  const longestRun = Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));
  const marker = '`'.repeat(longestRun + 1);
  const padding = /^[` ]|[` ]$/.test(value) ? ' ' : '';
  return `${marker}${padding}${value}${padding}${marker}`;
}

function renderTextValue(value: string): string[] {
  return value === '' ? ['*(empty)*'] : fence(value);
}

function fence(value: string): string[] {
  const longestRun = Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));
  const marker = '`'.repeat(Math.max(3, longestRun + 1));
  return [`${marker}text`, ...value.split('\n'), marker];
}

function renderStyleChanges(selection: ElementSelection): string[] {
  const changes = selection.styleChanges ?? [];
  if (changes.length === 0) return [];

  const hasAuthored = changes.some((change) => change.fromAuthored !== undefined);
  const header = hasAuthored ? '| property | from | authored | to |' : '| property | from | to |';
  const rule = hasAuthored ? '| --- | --- | --- | --- |' : '| --- | --- | --- |';
  return [
    'The user made these changes live in the browser. Apply them in the source:',
    '',
    header,
    rule,
    ...changes.map((change) => {
      const authored = hasAuthored ? ` ${renderAuthoredCell(change)} |` : '';
      return `| \`${change.property}\` | \`${change.from}\` |${authored} \`${change.to}\` |`;
    }),
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
    ...(selection.pageUrl === undefined ? [] : [`- page: ${selection.pageUrl}`]),
    `- annotation: freehand drawing with ${selection.strokes.length} ${strokeLabel} and ${pointCount} ${pointLabel}`,
    `- box: ${formatBox(selection)}`,
    ...(selection.viewport === undefined ? [] : [renderViewportFact(selection.viewport)]),
    `- brushes: ${brushes.map((brush) => `\`${brush}\``).join(', ')}`,
  ];
}

function renderElementFacts(selection: ElementSelection): string[] {
  const facts: string[] = [`- element: \`<${selection.tag}>\``];

  if (selection.pageUrl !== undefined) facts.push(`- page: ${selection.pageUrl}`);

  if (selection.frame !== undefined) {
    facts.push(`- frame: \`${selection.frame.selector}\` (${selection.frame.url})`);
  }
  if (selection.selector !== '') facts.push(`- selector: \`${selection.selector}\``);
  if (selection.path !== undefined && selection.path.includes('::shadow')) {
    facts.push(`- path: \`${selection.path.join(' > ')}\``);
  }
  if (selection.classes.length > 0) facts.push(`- classes: \`${selection.classes.join(' ')}\``);
  if (selection.text !== '') facts.push(`- text: ${JSON.stringify(selection.text)}`);

  facts.push(...renderContextFacts(selection));
  facts.push(`- box: ${formatBox(selection)}`);
  if (selection.viewport !== undefined) facts.push(renderViewportFact(selection.viewport));

  const styles = Object.entries(selection.styles);
  if (styles.length > 0) {
    facts.push(`- styles: ${styles.map(([name, value]) => `${name}: ${value}`).join('; ')}`);
  }

  if (selection.pseudoStyles !== undefined) facts.push(...renderPseudoStyleFacts(selection.pseudoStyles));

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
  pageCount = 1,
): string {
  const subject = count === 0 ? 'a general page note' : count === 1 ? '1 selection' : `${count} selections`;
  const location = pageCount === 1 ? `on ${url}` : `across ${pageCount} pages`;
  const action = count === 0 ? 'address it.' : 'address each comment.';
  const images = hasScreenshots ? ' Screenshots sit next to it in the same folder.' : '';

  return `Browser review — ${subject} ${location}. Read @${notePath} and ${action}${images}`;
}
