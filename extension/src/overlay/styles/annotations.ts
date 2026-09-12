/**
 * The card of pending annotations, anchored to the toolbar it belongs to.
 *
 * It is positioned against the toolbar rather than the viewport so that
 * dragging the toolbar carries it along, and flips below when the toolbar has
 * been parked too near the top of the window.
 */
export const ANNOTATIONS_CSS = `
.stack {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 10px);
  display: flex;
  flex-direction: column;
  max-height: 360px;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 22px;
  background: var(--surface-raised);
  box-shadow: var(--shadow-menu);
  cursor: default;
  visibility: hidden;
  opacity: 0;
  transform: translateY(6px);
  pointer-events: none;
  transition: opacity 150ms ease-out, transform 170ms cubic-bezier(0.2, 0.8, 0.3, 1),
    visibility 0s linear 170ms;
}

.stack--open {
  visibility: visible;
  opacity: 1;
  transform: none;
  pointer-events: auto;
  transition-delay: 0s;
}

.stack--below { bottom: auto; top: calc(100% + 8px); transform: translateY(-6px); }
.stack--below.stack--open { transform: none; }

.stack__list { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.stack__list::-webkit-scrollbar { width: 6px; }
.stack__list::-webkit-scrollbar-track { background: transparent; }
.stack__list::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 3px; }

/* Destructive, so it sits with the list it empties rather than next to Send. */
.stack__foot { flex: none; display: flex; justify-content: flex-end; padding: 4px 2px 0; }

.stack__clear {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  transition: background 120ms, color 120ms;
}
.stack__clear svg { width: 14px; height: 14px; }
.stack__clear:hover { background: rgba(255, 180, 171, 0.14); color: var(--error); }

.stack__row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px;
  border-radius: 12px;
  transition: background 120ms;
}

/* Clicking the crop opens it to the row's full width; clicking again folds it. */
.stack__row--expanded { flex-wrap: wrap; }
.stack__row--expanded .stack__shot {
  order: 10;
  flex: 1 0 100%;
  width: 100%;
  height: auto;
  max-height: 320px;
  object-fit: contain;
  cursor: zoom-out;
}

.stack__row:hover { background: rgba(255, 255, 255, 0.04); }
.stack__row + .stack__row { border-top: 1px solid var(--line); }

/* The crop the agent will see, shown large enough to recognise the element. */
.stack__shot {
  flex: none;
  width: 104px;
  height: 68px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: var(--surface-lowest);
  object-fit: cover;
  object-position: left top;
  cursor: zoom-in;
  transition: border-color 120ms, transform 120ms;
}

.stack__shot:hover { border-color: rgba(142, 213, 255, 0.5); }

.stack__shot--missing {
  display: block;
  cursor: default;
  background:
    repeating-linear-gradient(135deg, transparent 0 6px, rgba(255, 255, 255, 0.03) 6px 12px),
    var(--surface-lowest);
}
.stack__shot--missing:hover { border-color: rgba(255, 255, 255, 0.08); }

.stack__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }

.stack__meta { display: flex; align-items: center; gap: 6px; min-width: 0; }

.stack__tag {
  flex: none;
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--surface-highest);
  color: var(--accent-dim);
  font-size: 11px;
  line-height: 16px;
  letter-spacing: 0.02em;
  font-weight: 500;
}

.stack__detail {
  min-width: 0;
  color: var(--text-faint);
  font-size: 11px;
  line-height: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stack__comment {
  margin: 0;
  color: var(--text);
  font-size: 13px;
  line-height: 18px;
  overflow-wrap: anywhere;
}

.stack__remove {
  flex: none;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  opacity: 0.45;
  transition: background 120ms, color 120ms, opacity 120ms;
}

.stack__remove svg { width: 14px; height: 14px; }
.stack__row:hover .stack__remove, .stack__remove:focus-visible { opacity: 1; }
.stack__remove:hover { background: rgba(255, 255, 255, 0.08); color: var(--error); opacity: 1; }

/* ---------- per-row controls ---------- */

/* Quiet until the row is hovered: the list is for reading first, editing second. */
.stack__controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  opacity: 0.6;
  transition: opacity 120ms;
}

.stack__row:hover .stack__controls, .stack__controls:focus-within { opacity: 1; }

.stack__action {
  padding: 2px 8px;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-dim);
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background 120ms, color 120ms, border-color 120ms;
}

.stack__action:hover { background: rgba(255, 255, 255, 0.06); color: var(--text); border-color: var(--outline-variant); }

/* ---------- triage, shared by the rows and the composer ---------- */

.triage { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; }

.triage__chip {
  padding: 2px 9px;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-faint);
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  letter-spacing: 0.02em;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms, color 120ms, border-color 120ms;
}

.triage__chip:hover { background: rgba(255, 255, 255, 0.1); color: var(--text); }
.triage__chip--bug { background: rgba(255, 180, 171, 0.16); color: var(--error); }
.triage__chip--polish { background: rgba(142, 213, 255, 0.16); color: var(--accent); }
.triage__chip--question { background: rgba(245, 194, 107, 0.16); color: var(--warning); }
.triage__chip--bug:hover, .triage__chip--polish:hover, .triage__chip--question:hover { filter: brightness(1.15); }

.triage__priority {
  padding: 2px 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-faint);
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  letter-spacing: 0.02em;
  font-weight: 500;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  transition: color 120ms, border-color 120ms;
}

/* An unset priority says nothing, so it stays out of the row until the control is hovered. */
.triage__priority--unset { display: none; }
.triage:hover .triage__priority--unset, .triage:focus-within .triage__priority--unset { display: inline-block; }

.triage__priority:hover { background: rgba(255, 255, 255, 0.1); color: var(--text); }
.triage__priority:focus { outline: none; border-color: var(--accent); }
.triage__priority--set { background: rgba(255, 255, 255, 0.1); color: var(--text); }
.triage__priority option { background: var(--surface-container); color: var(--text); }
`;
