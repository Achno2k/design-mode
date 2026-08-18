import type { SelectionSource } from '../lib/protocol.ts';

/**
 * Find where a component was declared, running inside the page's own world.
 *
 * This function is handed to `chrome.scripting.executeScript` and serialised
 * with `toString()`, so it must be entirely self-contained: no imports, no
 * module-scope constants, no helpers declared outside it. The marker attribute
 * arrives through `args` rather than a shared constant for that reason.
 *
 * It has to run in the MAIN world because Chrome keeps a separate set of
 * expando properties per world. A content script sees the same `<div>` but not
 * the `__reactFiber$…` property React attached to it.
 *
 * Four strategies, most reliable first. All of them are development-only —
 * production builds strip this information and the function returns null, which
 * callers treat as "no source", never as an error.
 */
export function readSourceInPage(marker: string): SelectionSource | null {
  const element = document.querySelector(`[${marker}]`);
  if (element === null) return null;

  const strategies = [fromViteInspector, fromReactFiber, fromReactProps, fromVueComponent];
  for (const strategy of strategies) {
    const source = strategy(element);
    if (source !== null) return source;
  }
  return null;

  /** Vite inspector plugins stamp the location straight onto the DOM. */
  function fromViteInspector(node: Element): SelectionSource | null {
    for (let current: Element | null = node; current !== null; current = current.parentElement) {
      const path = current.getAttribute('data-inspector-relative-path');
      const line = current.getAttribute('data-inspector-line');
      if (path !== null && line !== null) {
        return build(path, line, current.getAttribute('data-inspector-column'));
      }

      // The Vue plugin packs everything into one attribute: "src/App.vue:12:3".
      const packed = current.getAttribute('data-v-inspector');
      if (packed !== null) {
        const parts = packed.split(':');
        if (parts.length >= 2) return build(parts[0], parts[1], parts[2]);
      }
    }
    return null;
  }

  /**
   * React 16 to 18 hang a `_debugSource` off the fiber. The nearest one is
   * often a plain `<div>`, so the owner chain is climbed to reach the component
   * that actually rendered it. React 19 removed this field.
   */
  function fromReactFiber(node: Element): SelectionSource | null {
    let fiber = readExpando(node, '__reactFiber$') as FiberLike | null;

    for (let depth = 0; fiber != null && depth < 30; depth += 1) {
      const found = readDebugSource(fiber);
      if (found !== null) return found;
      fiber = fiber._debugOwner ?? fiber.return ?? null;
    }
    return null;
  }

  /** With the JSX source transform enabled, the location arrives as a prop. */
  function fromReactProps(node: Element): SelectionSource | null {
    const props = readExpando(node, '__reactProps$') as { __source?: DebugSource } | null;
    return props?.__source === undefined ? null : fromDebugSource(props.__source);
  }

  /** Vue records the defining file on the component type. */
  function fromVueComponent(node: Element): SelectionSource | null {
    const instance = readExpando(node, '__vueParentComponent') as
      | { type?: { __file?: string } }
      | null;
    const file = instance?.type?.__file;
    return file === undefined ? null : { file, line: 1 };
  }

  function readDebugSource(fiber: FiberLike): SelectionSource | null {
    return fiber._debugSource === undefined ? null : fromDebugSource(fiber._debugSource);
  }

  function fromDebugSource(source: DebugSource): SelectionSource | null {
    return source.fileName === undefined ? null : build(source.fileName, source.lineNumber, source.columnNumber);
  }

  /** Expando keys carry a random suffix, so they are matched by prefix. */
  function readExpando(node: Element, prefix: string): unknown {
    const key = Object.keys(node).find((name) => name.startsWith(prefix));
    return key === undefined ? null : (node as unknown as Record<string, unknown>)[key];
  }

  function build(
    file: string | undefined,
    line: string | number | undefined,
    column: string | number | undefined | null,
  ): SelectionSource | null {
    if (file === undefined || file === '') return null;

    const lineNumber = Number(line);
    if (!Number.isFinite(lineNumber)) return null;

    const columnNumber = Number(column);
    return {
      file,
      line: lineNumber,
      column: Number.isFinite(columnNumber) && columnNumber > 0 ? columnNumber : undefined,
    };
  }

  type DebugSource = { fileName?: string; lineNumber?: number; columnNumber?: number };
  type FiberLike = { _debugSource?: DebugSource; _debugOwner?: FiberLike; return?: FiberLike };
}
