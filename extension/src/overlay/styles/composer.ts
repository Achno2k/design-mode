/**
 * The pop-up that opens on the element you clicked, in both of its states:
 * the one-line input on its own, and the same input above the property list.
 */
export const COMPOSER_CSS = `
.composer {
  width: 360px;
  background: var(--surface-high);
  border-color: var(--outline-variant);
  overflow: hidden;
}

.composer__label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 12px 0;
  font-size: 12px;
  line-height: 16px;
  letter-spacing: 0.02em;
  font-weight: 500;
  overflow: hidden;
}

.composer__tag { flex: none; color: var(--accent-dim); opacity: 0.7; }

.composer__detail {
  min-width: 0;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.composer__bar { display: flex; align-items: center; gap: 8px; padding: 12px; }

.composer__field {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  transition: border-color 150ms, box-shadow 150ms;
}

.composer__field:focus-within { border-color: var(--accent); box-shadow: var(--focus-ring); }

.composer__input {
  flex: 1;
  min-width: 0;
  max-height: 120px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  resize: none;
  overflow-y: auto;
}

.composer__input:focus { outline: none; }
.composer__input::placeholder { color: var(--outline); }

/* ---------- live style editor ---------- */

.editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 12px 14px;
  max-height: 340px;
  overflow-y: auto;
}

.editor::-webkit-scrollbar { width: 6px; }
.editor::-webkit-scrollbar-track { background: transparent; }
.editor::-webkit-scrollbar-thumb { background: var(--outline-variant); border-radius: 3px; }
.editor::-webkit-scrollbar-thumb:hover { background: var(--outline); }

.editor__row { display: flex; align-items: center; gap: 12px; }

.editor__label {
  flex: none;
  width: 33%;
  font-size: 13px;
  line-height: 18px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/*
 * Borderless until touched: the row reads as a value, and only looks like a
 * form field once it is being changed.
 */
.control {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: transparent;
  transition: background 150ms, border-color 150ms, box-shadow 150ms;
}

.control:hover { background: var(--surface); border-color: var(--outline-variant); }

.control:focus-within {
  background: var(--surface);
  border-color: var(--accent);
  box-shadow: var(--focus-ring);
}

.control__unit {
  position: absolute;
  right: 8px;
  font-size: 11px;
  line-height: 14px;
  letter-spacing: 0.02em;
  color: var(--outline-variant);
  pointer-events: none;
}

.control__chevron {
  position: absolute;
  right: 8px;
  display: grid;
  place-items: center;
  color: var(--text-dim);
  pointer-events: none;
}

.control__chevron svg { width: 16px; height: 16px; }

.field {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 11px;
  line-height: 14px;
  letter-spacing: 0.02em;
}

.field:focus { outline: none; }
.field::placeholder { color: var(--outline); }
.control--unit .field, .control--select .field { padding-right: 20px; }
.field--select { cursor: pointer; appearance: none; }
.field--select option { background: var(--surface-high); }

/* The native swatch is a bordered box; this reduces it to the colour itself. */
.swatch {
  flex: none;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 1px solid var(--outline-variant);
  border-radius: 50%;
  background: none;
  cursor: pointer;
  overflow: hidden;
  -webkit-appearance: none;
  appearance: none;
}

.swatch::-webkit-color-swatch-wrapper { padding: 0; }
.swatch::-webkit-color-swatch { border: 0; border-radius: 50%; }
`;
