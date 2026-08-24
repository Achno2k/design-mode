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
  bottom: calc(100% + 8px);
  max-height: 320px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-tray);
  background: var(--surface-container);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
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

.stack::-webkit-scrollbar { width: 6px; }
.stack::-webkit-scrollbar-track { background: transparent; }
.stack::-webkit-scrollbar-thumb { background: var(--outline-variant); border-radius: 3px; }

.stack__row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  transition: background 120ms;
}

.stack__row:hover { background: rgba(255, 255, 255, 0.04); }
.stack__row + .stack__row { border-top: 1px solid var(--hairline); }

.stack__shot {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid var(--hairline);
  background: var(--surface-lowest);
  object-fit: cover;
}

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
`;
