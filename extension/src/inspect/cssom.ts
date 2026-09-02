/**
 * Walk the stylesheets that apply to a document or shadow root.
 *
 * Shared by the pseudo-state reader and the authored-value reader. Sheets from
 * another origin refuse to expose their rules and are skipped rather than
 * failing the whole walk, and conditional groups are only entered when their
 * condition currently holds, so the rules visited are the ones that could be
 * styling the element right now.
 */
export function forEachStyleRule(
  root: Document | ShadowRoot,
  visit: (rule: CSSStyleRule, sheet: CSSStyleSheet) => void,
): void {
  const sheets = [...Array.from(root.styleSheets), ...(root.adoptedStyleSheets ?? [])];
  for (const sheet of sheets) walkSheet(sheet, visit, 0);
}

const MAX_IMPORT_DEPTH = 8;

function walkSheet(
  sheet: CSSStyleSheet,
  visit: (rule: CSSStyleRule, sheet: CSSStyleSheet) => void,
  depth: number,
): void {
  if (depth > MAX_IMPORT_DEPTH) return;

  let rules: CSSRuleList;
  try {
    rules = sheet.cssRules;
  } catch {
    // Cross-origin stylesheet: readable by the page, hidden from scripts.
    return;
  }
  walkRules(rules, sheet, visit, depth);
}

function walkRules(
  rules: CSSRuleList,
  sheet: CSSStyleSheet,
  visit: (rule: CSSStyleRule, sheet: CSSStyleSheet) => void,
  depth: number,
): void {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      visit(rule, sheet);
      // Nested CSS: a style rule can hold further style rules.
      if (rule.cssRules.length > 0) walkRules(rule.cssRules, sheet, visit, depth);
      continue;
    }
    if (rule instanceof CSSImportRule) {
      if (rule.styleSheet !== null) walkSheet(rule.styleSheet, visit, depth + 1);
      continue;
    }
    if (rule instanceof CSSMediaRule) {
      if (window.matchMedia(rule.conditionText).matches) walkRules(rule.cssRules, sheet, visit, depth);
      continue;
    }
    if (rule instanceof CSSSupportsRule) {
      if (CSS.supports(rule.conditionText)) walkRules(rule.cssRules, sheet, visit, depth);
      continue;
    }
    // Layers, containers, scopes: the condition cannot be checked cheaply, so
    // their rules are included rather than silently dropped.
    if (rule instanceof CSSGroupingRule) walkRules(rule.cssRules, sheet, visit, depth);
  }
}

const INTERACTIVE_STATES = /:(?:hover|focus-visible|focus-within|focus|active)\b/g;

/**
 * Remove interactive pseudo-classes so a selector can be tested with
 * `element.matches`. Pseudo-elements are left in place; callers must expect
 * `matches` to throw on those and treat it as "no match".
 */
export function stripPseudo(selector: string): string {
  return selector.replace(INTERACTIVE_STATES, '').trim();
}

/** A short name for where a rule came from, or nothing for an inline `<style>`. */
export function sheetName(sheet: CSSStyleSheet): string | undefined {
  if (sheet.href === null) return undefined;
  try {
    const path = new URL(sheet.href).pathname;
    return path.slice(path.lastIndexOf('/') + 1) || path;
  } catch {
    return sheet.href;
  }
}
