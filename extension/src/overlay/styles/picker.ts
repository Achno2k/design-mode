/**
 * The agent chooser: a label, the current agent, and a menu grouped by harness.
 *
 * The menu opens upward because the toolbar usually sits near the bottom edge,
 * and animates with opacity and a short rise rather than a height change, which
 * would reflow every row on each frame.
 */
export const PICKER_CSS = `
.picker { position: relative; display: flex; align-items: center; gap: 8px; min-width: 0; }

.picker__label {
  flex: none;
  font-size: 11px;
  line-height: 14px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.picker__trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  padding: 3px 6px 3px 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background 140ms, border-color 140ms;
}

.picker__trigger:hover:not(:disabled) { background: rgba(255, 255, 255, 0.05); }
.picker--open .picker__trigger { background: rgba(255, 255, 255, 0.06); border-color: var(--hairline); }
.picker__trigger:disabled { cursor: default; color: var(--text-dim); }

.picker__name {
  min-width: 0;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker__pane { flex: none; color: var(--text-faint); font-weight: 500; }

.picker__chevron { flex: none; display: grid; place-items: center; color: var(--text-dim); }
.picker__chevron svg { width: 14px; height: 14px; transition: transform 160ms ease-out; }
.picker--open .picker__chevron svg { transform: rotate(180deg); }
.picker__trigger:disabled .picker__chevron { display: none; }

.picker__menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 2;
  width: 340px;
  max-width: 80vw;
  max-height: 300px;
  padding: 6px;
  overflow-y: auto;
  border: 1px solid var(--outline-variant);
  border-radius: 12px;
  background: var(--surface-high);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
  visibility: hidden;
  opacity: 0;
  transform: translateY(6px) scale(0.98);
  transform-origin: bottom left;
  pointer-events: none;
  transition: opacity 140ms ease-out, transform 160ms cubic-bezier(0.2, 0.8, 0.3, 1),
    visibility 0s linear 160ms;
}

.picker__menu--below {
  bottom: auto;
  top: calc(100% + 8px);
  transform: translateY(-6px) scale(0.98);
  transform-origin: top left;
}

.picker__menu--open {
  visibility: visible;
  opacity: 1;
  transform: none;
  pointer-events: auto;
  transition-delay: 0s;
}

.picker__menu::-webkit-scrollbar { width: 6px; }
.picker__menu::-webkit-scrollbar-track { background: transparent; }
.picker__menu::-webkit-scrollbar-thumb { background: var(--outline-variant); border-radius: 3px; }

.picker__group + .picker__group { margin-top: 4px; border-top: 1px solid var(--hairline); }

.picker__harness {
  padding: 8px 10px 4px;
  font-size: 11px;
  line-height: 14px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.picker__option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-dim);
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  letter-spacing: 0.02em;
  text-align: left;
  cursor: pointer;
  opacity: 0;
  transform: translateY(3px);
  transition: background 120ms, color 120ms;
}

.picker__menu--open .picker__option {
  opacity: 1;
  transform: none;
  transition: background 120ms, color 120ms, opacity 160ms ease-out var(--stagger, 0ms),
    transform 160ms ease-out var(--stagger, 0ms);
}

.picker__option:hover { background: rgba(255, 255, 255, 0.06); color: var(--text); }
.picker__option--on { background: rgba(56, 189, 248, 0.14); color: var(--text); }
.picker__option--on:hover { background: rgba(56, 189, 248, 0.2); }

.picker__option-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker__option-pane { flex: none; color: var(--text-faint); }
`;
