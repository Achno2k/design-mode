/**
 * The annotation bar.
 *
 * One flat surface with a deep, soft shadow: a note on top and a row of
 * controls beneath it. It starts centred above the bottom edge and switches
 * to explicit coordinates the moment the user drags it, which is what
 * `.tray--floating` marks. Overflow stays visible so the agent menu and the
 * annotation card can rise out of it.
 */
export const TRAY_CSS = `
.tray {
  width: min(680px, calc(100vw - 32px));
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  padding: 14px 14px 12px;
  background: var(--surface-bar);
  border: 1px solid var(--line);
  border-radius: 28px;
  box-shadow: var(--shadow-bar), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  overflow: visible;
  cursor: grab;
}

.tray--floating { left: 0; top: 0; bottom: auto; transform: none; }
.tray--dragging { cursor: grabbing; user-select: none; }

/* Out of the way until the pointer is on the bar; it is the one control that is rarely wanted. */
.tray__collapse {
  flex: none;
  width: 22px;
  height: 22px;
  /* Sits on the note's own first line, and the 6px matches the note's side padding. */
  margin-right: 6px;
  opacity: 0;
  transition: opacity 140ms, background 120ms, color 120ms;
}
.tray__collapse svg { width: 14px; height: 14px; }
.tray:hover .tray__collapse, .tray__collapse:focus-visible { opacity: 1; }
/* Points at the edge the bar collapses to, not down at content it would fold away. */
.tray__collapse svg { transform: rotate(-90deg); }

/*
 * The collapsed bar: a tab against the nearest screen edge.
 *
 * Collapsing exists to hand the page back, so the bar goes away completely
 * rather than shrinking in place, and what is left is narrow enough to sit
 * beside a site's own edge furniture without covering it.
 */
.tray-tab {
  position: fixed;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 44px;
  padding: 12px 0 10px;
  border: 1px solid var(--line);
  border-right: none;
  border-radius: 16px 0 0 16px;
  background: var(--surface-bar);
  box-shadow: var(--shadow-menu);
  color: var(--text-dim);
  cursor: pointer;
  pointer-events: auto;
  transition: color 120ms, width 200ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

/* Leans out a little under the pointer: the bar is in here, come and get it. */
.tray-tab:hover { width: 50px; color: var(--accent); }

.tray-tab--left {
  right: auto;
  left: 0;
  border-radius: 0 16px 16px 0;
  border-right: 1px solid var(--line);
  border-left: none;
}

.tray-tab__icon { display: grid; place-items: center; }
.tray-tab__icon svg { width: 20px; height: 20px; }
/* The glyph keeps the tool's colour, so the tab says which mode is waiting. */
.tray-tab--annotate .tray-tab__icon { color: var(--accent); }
.tray-tab--draw .tray-tab__icon { color: var(--ink); }

/* What is still queued has to survive the collapse, or sending it is a surprise. */
.tray-tab__count {
  display: grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--accent-container);
  color: var(--on-accent);
  font-size: 11px;
  line-height: 18px;
  font-weight: 600;
  letter-spacing: 0;
}

/* The note and the collapse button share a line, so the chevron tops the words rather than the bar. */
.tray__note-row { display: flex; align-items: flex-start; gap: 8px; margin: 0 0 12px; }

/* The note is the bar's own text, not a field inside it: no box, just the words. */
.tray__note {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 22px;
  max-height: 88px;
  margin: 0;
  padding: 0 6px;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  resize: none;
  overflow-y: auto;
  cursor: text;
}

.tray__note:focus { outline: none; }
.tray__note::placeholder { color: var(--text-faint); }

.tray__row { display: flex; align-items: center; gap: 10px; cursor: default; }
.tray__row .circle { width: 36px; height: 36px; }
.tray__row .circle svg { width: 18px; height: 18px; }
/* Accent buttons keep their own hover, which this rule outranks. :where() leaves its weight as it was. */
.tray__row .circle:where(:not(.circle--accent)):hover { background: rgba(255, 255, 255, 0.06); }

/* ---------- the two picking modes ---------- */

/*
 * One switch for Annotate and Draw: a knob slides to the tool in hand and the
 * track takes that tool's colour, blue for picking elements and warm for ink.
 * With neither on, the knob rests where it last was, unlit, so the next
 * switch moves from the right place. The buttons sit over the track and stay
 * transparent; only the knob and the icons carry colour.
 */
.switch {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 36px;
  padding: 3px;
  border-radius: var(--radius-pill);
  background: var(--surface-highest);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.35);
  transition: background-color 260ms, box-shadow 260ms;
}

.switch--annotate { background: rgba(142, 213, 255, 0.28); box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2); }
.switch--draw { background: rgba(255, 122, 92, 0.26); box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.2); }

.switch__knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #3a3a3a;
  transform: translateX(0);
  transition: transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1), background-color 200ms, box-shadow 200ms;
  pointer-events: none;
}

.switch--right .switch__knob { transform: translateX(34px); }
.switch--annotate .switch__knob, .switch--draw .switch__knob {
  background: #f4f4f4;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.05);
}

.switch__side {
  position: relative;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  transition: color 200ms;
}

.switch__side svg { width: 16px; height: 16px; }
.switch__side:hover { color: var(--text); }
.switch--annotate .tray__annotate { color: #0b5b86; }
.switch--draw .tray__draw { color: #b83f22; }
.switch--annotate .tray__annotate:hover { color: #083f5e; }
.switch--draw .tray__draw:hover { color: #8f2e17; }

/* ---------- what the bar has to say ---------- */

/*
 * A line above the bar for a moment, never a slot inside it. Errors are
 * tinted and stay longest; a busy line stays until whatever is busy is done.
 */
.toast {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 10px);
  max-width: calc(100% - 32px);
  padding: 7px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--surface-raised);
  box-shadow: var(--shadow-menu);
  color: var(--text-dim);
  font-size: 12px;
  line-height: 16px;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0;
  transform: translate(-50%, 4px);
  pointer-events: none;
  transition: opacity 140ms ease-out, transform 160ms cubic-bezier(0.2, 0.8, 0.3, 1);
}

.toast--below { bottom: auto; top: calc(100% + 10px); transform: translate(-50%, -4px); }
.toast--open { opacity: 1; transform: translate(-50%, 0); }
.toast--busy { color: var(--warning); }
.toast--error { color: var(--error); border-color: rgba(255, 180, 171, 0.25); }
.toast--success { color: var(--accent); }

/* ---------- the rest of the row ---------- */

.tray__send { box-shadow: 0 6px 18px rgba(56, 189, 248, 0.3); }
.tray__send:hover { transform: translateY(-1px); }
.tray__send:disabled { box-shadow: none; }

.tray__queue {
  flex: none;
  height: 32px;
  padding: 0 12px;
  border-color: var(--line);
  color: var(--text-dim);
  white-space: nowrap;
}

.tray__queue:hover { background: rgba(255, 255, 255, 0.05); color: var(--text); }
.tray__queue--on { background: var(--surface-highest); border-color: var(--line-strong); color: var(--text); }

.tray__end { display: flex; align-items: center; gap: 8px; margin-left: auto; }

/* Status is spelled out in the agent menu, where a colour is a legend, not decoration. */
.dot { flex: none; width: 7px; height: 7px; border-radius: 50%; }
.dot--idle, .dot--done { background: var(--accent); }
.dot--working { background: var(--warning); }
.dot--blocked, .dot--unknown { background: var(--error); }
`;
