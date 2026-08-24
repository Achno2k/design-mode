/**
 * The annotation toolbar.
 *
 * It starts centred above the bottom edge and switches to explicit coordinates
 * the moment the user drags it, which is what `.tray--floating` marks. Overflow
 * stays visible so the agent menu and the annotation card can escape the bar.
 */
export const TRAY_CSS = `
.tray {
  width: min(760px, calc(100vw - 32px));
  left: 50%;
  bottom: 18px;
  transform: translateX(-50%);
  padding: 0;
  background: var(--surface-low);
  border-radius: var(--radius-tray);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  overflow: visible;
}

.tray--floating { left: 0; top: 0; bottom: auto; transform: none; }
.tray--dragging { user-select: none; }

.tray__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  cursor: grab;
  touch-action: none;
}

.tray--dragging .tray__head { cursor: grabbing; }

.tray__head-actions { display: flex; align-items: center; gap: 6px; flex: none; }
.tray__collapse svg { transition: transform 150ms ease-out; }
.tray--collapsed .tray__collapse svg { transform: rotate(-90deg); }
.tray--collapsed .tray__note, .tray--collapsed .tray__actions { display: none; }
.tray--collapsed .stack { display: none; }

.tray__note {
  display: block;
  width: 100%;
  min-height: 36px;
  max-height: 80px;
  padding: 4px 12px 12px;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  resize: none;
}

.tray__note:focus { outline: none; }
.tray__note::placeholder { color: rgba(189, 200, 209, 0.5); }

.tray__actions { display: flex; align-items: center; gap: 6px; padding: 8px 12px; }
.tray__tool svg { width: 20px; height: 20px; }

.tray__queue {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 2px;
  padding: 5px 12px 5px 9px;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-pill);
  background: var(--surface-container);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  letter-spacing: 0.02em;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background 120ms, border-color 120ms, color 120ms;
}

.tray__queue:hover { background: var(--surface-high); }
.tray__queue--on { background: rgba(56, 189, 248, 0.16); border-color: rgba(56, 189, 248, 0.3); color: var(--accent); }
.tray__queue-icon { display: grid; place-items: center; color: currentColor; }
.tray__queue-icon svg { width: 15px; height: 15px; }

/* Takes the slack in the row, so a whole sentence of guidance fits. */
.status {
  flex: 1 1 auto;
  min-width: 0;
  margin-left: 2px;
  font-size: 12px;
  line-height: 16px;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status--idle { color: var(--text-faint); }
.status--busy { color: var(--warning); }
.status--error { color: var(--error); }
.status--success { color: var(--accent); }

/* Status is spelled out in the agent menu, where a colour is a legend, not decoration. */
.dot { flex: none; width: 7px; height: 7px; border-radius: 50%; }
.dot--idle, .dot--done { background: var(--accent); }
.dot--working { background: var(--warning); }
.dot--blocked, .dot--unknown { background: var(--error); }
`;
