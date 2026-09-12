/**
 * Design tokens for the overlay.
 *
 * These are the Material 3 dark values from the Stitch design system, named as
 * the design names them so a token can be traced back to the source. They live
 * on `:host` so every rule in the shadow root can read them and nothing else
 * can.
 */
export const THEME_CSS = `
:host {
  all: initial;

  --surface: #131313;
  --surface-lowest: #0e0e0e;
  --surface-low: #1c1b1b;
  --surface-container: #201f1f;
  --surface-high: #2a2a2a;
  --surface-highest: #353534;

  /* The bar and what opens out of it: one flat surface, one step up, one step down. */
  --surface-bar: #1c1c1c;
  --surface-raised: #232323;
  --surface-sunken: #121212;
  --line: rgba(255, 255, 255, 0.07);
  --line-strong: rgba(255, 255, 255, 0.14);
  --shadow-bar: 0 24px 60px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.35);
  --shadow-menu: 0 16px 40px rgba(0, 0, 0, 0.5);

  --outline-variant: #3e484f;
  --outline: #87929a;
  --hairline: rgba(62, 72, 79, 0.3);

  --text: #e5e2e1;
  --text-dim: #bdc8d1;
  --text-faint: #87929a;

  --accent: #8ed5ff;
  --accent-bright: #c4e7ff;
  --accent-dim: #7bd0ff;
  --accent-container: #38bdf8;
  --on-accent: #00354a;
  --accent-soft: rgba(142, 213, 255, 0.18);
  --focus-ring: 0 0 0 2px rgba(142, 213, 255, 0.2);

  /* Drawing has its own warmth, so the mode pill says which tool is in hand. */
  --ink: #ff8a6a;
  --ink-soft: rgba(255, 122, 92, 0.2);

  --ok: #7ee787;
  --warning: #f5c26b;
  --error: #ffb4ab;

  --radius-panel: 16px;
  --radius-tray: 12px;
  --radius-control: 4px;
  --radius-pill: 999px;

  font-family: "SF Pro", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", sans-serif;
  font-size: 13px;
}
`;
