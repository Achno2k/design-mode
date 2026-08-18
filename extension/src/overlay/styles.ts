/**
 * Styles for the overlay.
 *
 * Everything lives inside a shadow root, so these rules cannot leak into the
 * page and the page's rules cannot leak in. Values are hard-coded rather than
 * inherited for the same reason — the overlay must look identical on every site.
 */
export const OVERLAY_CSS = `
:host {
  all: initial;
  --bg: #1a1b1a;
  --bg-sunken: #141514;
  --bg-raised: #292a29;
  --line: rgba(255, 255, 255, 0.08);
  --text: #f1f2ed;
  --text-dim: #a0a39b;
  --text-faint: #70736c;
  --accent: #7c9cff;
  --radius: 14px;
  font-family: "Avenir Next", Avenir, ui-sans-serif, -apple-system, "Segoe UI", sans-serif;
}

.layer {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
}

/* ---------- hover highlight ---------- */

.highlight {
  position: fixed;
  border: 1px solid var(--accent);
  background: rgba(76, 141, 255, 0.09);
  border-radius: 4px;
  pointer-events: none;
  transition: all 70ms ease-out;
}

.chip {
  position: fixed;
  padding: 2px 7px;
  background: var(--accent);
  color: #fff;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.01em;
  border-radius: 5px;
  white-space: nowrap;
  pointer-events: none;
}

.highlight[hidden], .chip[hidden], .composer[hidden], .tray[hidden] { display: none; }

/* Screenshots keep freehand SVG ink while removing every piece of overlay chrome. */
.layer--capturing .panel,
.layer--capturing .highlight,
.layer--capturing .chip { visibility: hidden; }

/* ---------- shared surface ---------- */

.panel {
  position: fixed;
  background: rgba(26, 27, 26, 0.96);
  color: var(--text);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius);
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.38), 0 2px 10px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(18px) saturate(1.15);
  pointer-events: auto;
  font-size: 13px;
}

.circle {
  flex: none;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  padding: 0;
  transition: background 120ms, color 120ms, transform 120ms;
}

.circle svg { width: 15px; height: 15px; }
.circle[hidden] { display: none; }
.circle--sm { width: 27px; height: 27px; }
.circle--sm svg { width: 14px; height: 14px; }
.circle:hover { background: rgba(255, 255, 255, 0.07); color: var(--text); }
.circle:active { transform: scale(0.94); }
.circle:disabled { opacity: 0.35; cursor: default; }
.circle:disabled:hover { background: transparent; color: var(--text-dim); }
.circle--on { background: rgba(124, 156, 255, 0.16); color: #a9bdff; }
.circle--quiet { background: transparent; }
.circle--accent { background: var(--accent); color: #101114; }
.circle--accent:hover { background: #91aaff; color: #101114; }
.circle--spin svg { animation: spin 700ms linear infinite; }

@keyframes spin { to { transform: rotate(360deg); } }

.pill {
  padding: 6px 9px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-dim);
  font: inherit;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms, color 120ms, transform 120ms;
}

.pill:hover { background: rgba(255, 255, 255, 0.06); color: var(--text); }
.pill:active { transform: scale(0.96); }
.pill--accent { padding-inline: 13px; background: var(--text); color: #171817; }
.pill--accent:hover { background: #fff; color: #111; }
.pill:disabled { opacity: 0.32; cursor: default; background: transparent; color: var(--text-faint); }
.pill--accent:disabled { background: rgba(255, 255, 255, 0.07); color: var(--text-faint); }

/* ---------- composer ---------- */

.composer { width: 380px; overflow: hidden; }

.composer__label {
  padding: 10px 14px 2px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  letter-spacing: 0.01em;
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.composer__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px 10px;
}

.composer__input {
  flex: 1;
  min-width: 0;
  max-height: 120px;
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13.5px;
  line-height: 1.45;
  resize: none;
  overflow-y: auto;
}

.composer__input:focus { outline: none; }
.composer__input::placeholder { color: var(--text-faint); }

/* ---------- live style editor ---------- */

.editor {
  border-top: 1px solid var(--line);
  padding: 6px 0;
  max-height: 300px;
  overflow-y: auto;
}

.editor__row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 14px;
}

.editor__label {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text-dim);
  white-space: nowrap;
}

.control {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 176px;
  padding: 0 9px;
  height: 30px;
  box-sizing: border-box;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg-sunken);
}

.control:focus-within { border-color: rgba(255, 255, 255, 0.22); }
.control--color { padding-left: 6px; }
.control__unit { font-size: 11px; color: var(--text-faint); }

.field {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.field:focus { outline: none; }
.field--select { font-family: inherit; cursor: pointer; }
.field--select option { background: var(--bg); }

/* The native swatch is a bordered box; this reduces it to the colour itself. */
.swatch {
  flex: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: none;
  cursor: pointer;
  overflow: hidden;
  -webkit-appearance: none;
  appearance: none;
}

.swatch::-webkit-color-swatch-wrapper { padding: 0; }
.swatch::-webkit-color-swatch { border: 0; border-radius: 50%; }

/* ---------- tooltip ---------- */

.tip-anchor { position: relative; display: flex; }

/* A light pill above the control, matching the reference affordance. */
.tip {
  position: absolute;
  bottom: calc(100% + 9px);
  left: 50%;
  transform: translateX(-50%) translateY(3px);
  padding: 5px 11px;
  border-radius: 999px;
  background: #f4f4f4;
  color: #1c1c1c;
  font-size: 11.5px;
  font-weight: 500;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 110ms ease-out, transform 110ms ease-out;
}

.tip-anchor:hover .tip { opacity: 1; transform: translateX(-50%) translateY(0); }

/* ---------- tray ---------- */

.tray {
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  width: min(600px, calc(100vw - 28px));
  padding: 7px 12px 9px;
}

.tray__agent {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
}

.tray__note {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 35px;
  max-height: 74px;
  padding: 7px 1px 9px;
  border: 0;
  border-radius: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  line-height: 1.45;
  resize: none;
}

.tray__note:focus { outline: none; border-bottom-color: rgba(124, 156, 255, 0.48); }
.tray__note::placeholder { color: var(--text-faint); }

.tray__rule { display: none; }

.tray__actions { display: flex; align-items: center; gap: 5px; padding-top: 7px; }

.tray__select {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-overflow: ellipsis;
}

.tray__select:focus { outline: none; }
.tray__select option { background: var(--bg); }

.tray__count { margin-left: 3px; font-size: 11.5px; font-weight: 500; white-space: nowrap; }
.tray__count--empty { color: var(--text-faint); font-weight: 400; }

.status {
  flex: 0 1 155px;
  min-width: 0;
  max-width: 155px;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.status--idle { color: var(--text-faint); }
.status--busy { color: #e1b45b; }
.status--error { color: #ff7c7c; }
.status--success { color: #72d5a7; }

.dot { flex: none; width: 5px; height: 5px; border-radius: 50%; }
.dot--idle, .dot--done { background: #72d5a7; box-shadow: 0 0 0 3px rgba(114, 213, 167, 0.09); }
.dot--working { background: #e1b45b; box-shadow: 0 0 0 3px rgba(225, 180, 91, 0.09); }
.dot--blocked, .dot--unknown { background: #ff7c7c; box-shadow: 0 0 0 3px rgba(255, 124, 124, 0.09); }
`;
