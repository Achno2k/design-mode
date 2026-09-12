/**
 * The pieces every overlay surface shares: the layer, the hover highlight, the
 * panel shell, and the two button shapes the design uses everywhere.
 */
export const BASE_CSS = `
.layer {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
}

[hidden] { display: none !important; }

/* ---------- hover highlight ---------- */

.highlight {
  position: fixed;
  border: 1px solid var(--accent);
  background: rgba(142, 213, 255, 0.1);
  border-radius: var(--radius-control);
  pointer-events: none;
  transition: all 70ms ease-out;
}

.chip {
  position: fixed;
  padding: 2px 7px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 11px;
  line-height: 14px;
  font-weight: 500;
  letter-spacing: 0.02em;
  border-radius: var(--radius-control);
  white-space: nowrap;
  pointer-events: none;
}

/* ---------- child component outlines ---------- */

/*
 * One faint box per child component of whatever is hovered, so the shape of the
 * component tree is readable at a glance. Deliberately quiet: the pointer's own
 * blue box stays the thing being pointed at, and these only hint at what sits
 * inside it. Siblings differ by hue alone, never by weight.
 */
.child {
  position: fixed;
  border: 1px solid var(--tree-line);
  background: var(--tree-fill);
  border-radius: var(--radius-control);
  pointer-events: none;
}

.child--1 { --tree-line: rgba(255, 138, 128, 0.55); --tree-fill: rgba(255, 138, 128, 0.07); }
.child--2 { --tree-line: rgba(126, 231, 135, 0.55); --tree-fill: rgba(126, 231, 135, 0.07); }
.child--3 { --tree-line: rgba(245, 194, 107, 0.55); --tree-fill: rgba(245, 194, 107, 0.07); }
.child--4 { --tree-line: rgba(201, 167, 255, 0.55); --tree-fill: rgba(201, 167, 255, 0.07); }
.child--5 { --tree-line: rgba(126, 231, 231, 0.55); --tree-fill: rgba(126, 231, 231, 0.07); }
.child--6 { --tree-line: rgba(255, 158, 205, 0.55); --tree-fill: rgba(255, 158, 205, 0.07); }

/* Screenshots keep freehand SVG ink while removing every piece of overlay chrome. */
.layer--capturing .panel,
.layer--capturing .tray-tab,
.layer--capturing .highlight,
.layer--capturing .child,
.layer--capturing .box-band,
.layer--capturing .chip { visibility: hidden; }

/* ---------- shared surface ---------- */

.panel {
  position: fixed;
  background: var(--surface-container);
  color: var(--text);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-panel);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  pointer-events: auto;
  font-size: 13px;
}

.panel, .panel * { box-sizing: border-box; }

/* ---------- buttons ---------- */

.circle {
  flex: none;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  padding: 0;
  transition: background 120ms, color 120ms, transform 120ms;
}

.circle svg { width: 18px; height: 18px; }
.circle--sm { width: 28px; height: 28px; }
.circle--sm svg { width: 16px; height: 16px; }
.circle:hover { background: rgba(255, 255, 255, 0.05); color: var(--text); }
.circle:active { transform: scale(0.94); }
.circle:disabled { opacity: 0.35; cursor: default; }
.circle:disabled:hover { background: transparent; color: var(--text-dim); }

.circle--on {
  background: rgba(56, 189, 248, 0.2);
  border-color: rgba(56, 189, 248, 0.3);
  color: var(--accent);
}
.circle--on:hover { background: rgba(56, 189, 248, 0.3); color: var(--accent); }

.circle--accent { background: var(--accent); color: var(--on-accent); }
.circle--accent:hover { background: var(--accent-bright); color: var(--on-accent); }

.circle--accent:disabled,
.circle--accent:disabled:hover {
  opacity: 1;
  background: var(--surface-highest);
  color: var(--text-faint);
}
.circle--spin svg { animation: spin 700ms linear infinite; }

@keyframes spin { to { transform: rotate(360deg); } }

.pill {
  padding: 6px 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-dim);
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  letter-spacing: 0.02em;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms, color 120ms, transform 120ms;
}

.pill:hover { background: rgba(255, 255, 255, 0.05); color: var(--text); }
.pill:active { transform: scale(0.96); }
.pill--accent { padding-inline: 16px; background: var(--accent); color: var(--on-accent); }
.pill--accent:hover { background: var(--accent-bright); color: var(--on-accent); }
.pill:disabled { cursor: default; background: transparent; color: var(--text-faint); }

.pill--accent:disabled {
  background: var(--surface-low);
  border-color: var(--hairline);
  color: rgba(189, 200, 209, 0.5);
}

.pill--outline { border-color: var(--line-strong); color: var(--text); }
.pill--outline:hover { background: rgba(255, 255, 255, 0.05); color: #fff; }

/* ---------- keyboard focus ---------- */

/*
 * Every control gets the same ring, drawn as an outline so it never fights a
 * control's own box-shadow. Pointer users never see it.
 */
.panel button:focus-visible,
.panel select:focus-visible,
.tray-tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* ---------- tooltip ---------- */

.tip-anchor { position: relative; display: flex; }

.tip {
  position: absolute;
  bottom: calc(100% + 9px);
  left: 50%;
  transform: translateX(-50%) translateY(3px);
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  background: var(--surface-highest);
  border: 1px solid var(--hairline);
  color: var(--text);
  font-size: 11px;
  line-height: 14px;
  letter-spacing: 0.02em;
  font-weight: 500;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 110ms ease-out, transform 110ms ease-out;
}

.tip-anchor:hover .tip { opacity: 1; transform: translateX(-50%) translateY(0); }

/* ---------- reduced motion ---------- */

/* Menus and cards simply appear; the refresh spinner stays, since it is the
   only sign that anything is happening. */
@media (prefers-reduced-motion: reduce) {
  .panel, .panel *, .tray-tab, .highlight, .outline { transition: none !important; }
}
`;
