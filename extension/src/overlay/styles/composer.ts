/**
 * The pop-up that opens on the element you clicked.
 *
 * Four bands, top to bottom: the prompt, the element it is pointed at, the
 * editor, and the actions. The editor is the only one that can be hidden, so
 * the panel keeps the same silhouette whether it is a one-line comment or a
 * full sheet of edits.
 *
 * Greys here are deliberately neutral rather than the blue-tinted surfaces the
 * rest of the overlay uses. The composer sits directly on top of the page being
 * reviewed, and a colour cast on that surface reads as part of the design under
 * review. The accent is kept for the one primary action.
 */
export const COMPOSER_CSS = `
.composer {
  --line: rgba(255, 255, 255, 0.13);
  --line-strong: rgba(255, 255, 255, 0.22);
  --label: rgba(255, 255, 255, 0.56);
  --value: rgba(255, 255, 255, 0.86);

  display: flex;
  flex-direction: column;
  width: 380px;
  max-height: min(560px, calc(100vh - 40px));
  background: #2b2b2b;
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  font-size: 13px;
}

/* ---------- prompt ---------- */

.composer__prompt {
  flex: none;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
}

.composer__input {
  flex: 1;
  min-width: 0;
  max-height: 120px;
  margin-top: 7px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--value);
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  resize: none;
  overflow-y: auto;
}

.composer__input:focus { outline: none; }
.composer__input::placeholder { color: rgba(255, 255, 255, 0.38); }

/* ---------- the element being edited ---------- */

.composer__identity {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  background: rgba(0, 0, 0, 0.22);
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  font-size: 14px;
  line-height: 19px;
  font-weight: 650;
  letter-spacing: 0.01em;
  overflow: hidden;
}

.composer__tag { flex: none; color: #fff; }

.composer__detail {
  min-width: 0;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------- live editor ---------- */

.editor {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.editor::-webkit-scrollbar { width: 8px; }
.editor::-webkit-scrollbar-track { background: transparent; }

.editor::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.14);
  border: 2px solid transparent;
  background-clip: padding-box;
  border-radius: 4px;
}

.editor::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.24); background-clip: padding-box; }

/* Bands the dividers separate: the copy, then appearance, type, layout, border.
   The extra right padding leaves the scrollbar its own lane, so a long value is
   never sitting underneath the thumb. */
.editor__group { padding: 14px 20px 14px 18px; }
.editor__group + .editor__group { border-top: 1px solid var(--line); }

.editor__row { display: flex; align-items: center; gap: 14px; }
.editor__row + .editor__row { margin-top: 12px; }

.editor__label {
  flex: none;
  width: 32%;
  font-size: 14px;
  line-height: 20px;
  color: var(--label);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.control {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: transparent;
  transition: border-color 130ms, background 130ms;
}

.control:hover { border-color: rgba(255, 255, 255, 0.32); }

.control:focus-within {
  border-color: var(--accent);
  background: rgba(255, 255, 255, 0.03);
}

/* Numbers need a fraction of the room prose does, and reading them left-aligned
   in a wide box makes the value look lost. */
.control--narrow { flex: 0 1 128px; margin-left: auto; }

.control--select { padding-right: 12px; }

.control__unit {
  position: absolute;
  right: 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
  pointer-events: none;
}

/* Sits over the select's right edge so the whole control is one click target. */
.control__chevron {
  position: absolute;
  right: 12px;
  display: grid;
  place-items: center;
  color: rgba(255, 255, 255, 0.6);
  pointer-events: none;
}

.control__chevron svg { width: 15px; height: 15px; }

.field {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--value);
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 18px;
}

.field:focus { outline: none; }
.field::placeholder { color: rgba(255, 255, 255, 0.3); }
.control--unit .field { padding-right: 22px; }

.field--select { cursor: pointer; appearance: none; padding-right: 22px; }
.field--select option { background: #2b2b2b; color: var(--value); }

/* Copy is prose, not code — it reads better in the panel's own face. */
.field--text { font-family: inherit; font-size: 14px; }

.field[type="number"]::-webkit-inner-spin-button,
.field[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }

/* The native swatch is a bordered box; this reduces it to the colour itself. */
.swatch {
  flex: none;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  background: none;
  cursor: pointer;
  overflow: hidden;
  -webkit-appearance: none;
  appearance: none;
}

.swatch::-webkit-color-swatch-wrapper { padding: 0; }
.swatch::-webkit-color-swatch { border: 0; border-radius: 50%; }

/* ---------- actions ---------- */

.composer__footer {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-top: 1px solid var(--line);
}

.pill--outline {
  padding: 9px 18px;
  border-color: var(--line-strong);
  color: var(--value);
  font-size: 14px;
}

.pill--outline:hover { background: rgba(255, 255, 255, 0.07); color: #fff; }

.composer .circle { width: 40px; height: 40px; }
.composer .circle svg { width: 19px; height: 19px; }

.circle--ghost {
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.75);
}

.circle--ghost:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }

.composer .circle--accent:disabled {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.45);
}
`;
