import type { ConsoleEntry, ItemTriage, PseudoStyle, StyleChange, Viewport } from './types.ts';

/** Markdown for the optional review context added in protocol 3. */

/** A prefix for the item heading, e.g. `[bug · P1] `, or nothing when untriaged. */
export function renderTriage(triage: ItemTriage | undefined): string {
  if (triage === undefined) return '';

  const parts = [triage.category, triage.priority].filter((part) => part !== undefined);
  return parts.length === 0 ? '' : `[${parts.join(' · ')}] `;
}

/** `1440x900 @2x, scrolled to (0, 320)`; scroll is left out when at the origin. */
export function renderViewportFact(viewport: Viewport): string {
  const size = `${Math.round(viewport.width)}x${Math.round(viewport.height)} @${formatDpr(viewport.dpr)}x`;
  const scrolled =
    viewport.scrollX === 0 && viewport.scrollY === 0
      ? ''
      : `, scrolled to (${Math.round(viewport.scrollX)}, ${Math.round(viewport.scrollY)})`;
  return `- viewport: ${size}${scrolled}`;
}

/** A section listing what the console reported, oldest first. */
export function renderConsoleErrors(entries: ConsoleEntry[]): string[] {
  if (entries.length === 0) return [];

  const heading = entries.length === 1 ? '## Console errors (1)' : `## Console errors (${entries.length})`;
  const lines = [heading, '', 'Captured in the browser while this review was open, oldest first.', ''];
  for (const entry of [...entries].sort((a, b) => a.at - b.at)) {
    lines.push(...renderConsoleEntry(entry));
  }
  return lines;
}

function renderConsoleEntry(entry: ConsoleEntry): string[] {
  const label = { error: 'uncaught error', rejection: 'unhandled rejection', console: 'console.error' }[
    entry.level
  ];
  const times = entry.count > 1 ? ` (×${entry.count})` : '';
  const lines = [`- ${label}${times} on ${entry.pageUrl}`, '', ...fence(entry.message)];
  if (entry.stack !== undefined && entry.stack !== entry.message) {
    lines.push('', '  <details><summary>stack</summary>', '', ...fence(entry.stack), '', '  </details>');
  }
  lines.push('');
  return lines;
}

/** One line per interactive state, e.g. `- :hover (.btn:hover): background-color: #333`. */
export function renderPseudoStyleFacts(styles: PseudoStyle[]): string[] {
  return styles.map((style) => {
    const declarations = Object.entries(style.declarations)
      .map(([name, value]) => `${name}: ${value}`)
      .join('; ');
    const sheet = style.sheet === undefined ? '' : ` in ${style.sheet}`;
    return `- ${style.pseudo} (\`${style.selector}\`${sheet}): ${declarations}`;
  });
}

/** The `authored` table cell: the source value plus where it came from. */
export function renderAuthoredCell(change: StyleChange): string {
  if (change.fromAuthored === undefined) return '';

  const by = change.authoredBy;
  if (by === undefined) return `\`${change.fromAuthored}\``;

  const where = [by.classes?.length ? by.classes.map((name) => `.${name}`).join(' ') : `\`${by.selector}\``];
  if (by.sheet !== undefined) where.push(by.sheet);
  return `\`${change.fromAuthored}\` (${where.join(', ')})`;
}

function formatDpr(dpr: number): string {
  return Number.isInteger(dpr) ? String(dpr) : dpr.toFixed(2).replace(/0+$/, '');
}

function fence(value: string): string[] {
  const longestRun = Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));
  const marker = '`'.repeat(Math.max(3, longestRun + 1));
  return [`  ${marker}text`, ...value.split('\n').map((line) => `  ${line}`), `  ${marker}`];
}
