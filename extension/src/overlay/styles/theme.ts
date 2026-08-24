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
  --focus-ring: 0 0 0 2px rgba(142, 213, 255, 0.2);

  --warning: #f5c26b;
  --error: #ffb4ab;

  --radius-panel: 16px;
  --radius-tray: 12px;
  --radius-control: 4px;
  --radius-pill: 999px;

  font-family: "SF Pro", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", sans-serif;
  font-size: 14px;
}
`;
