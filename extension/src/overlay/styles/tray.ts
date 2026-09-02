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
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0) 45%),
    rgba(20, 20, 20, 0.88);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 18px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 24px 60px rgba(0, 0, 0, 0.55),
    0 2px 8px rgba(0, 0, 0, 0.35);
  overflow: visible;
}

.tray--floating { left: 0; top: 0; bottom: auto; transform: none; }
.tray--dragging { user-select: none; }

.tray__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px 4px;
  cursor: grab;
  touch-action: none;
}

.tray--dragging .tray__head { cursor: grabbing; }

.tray__head-actions { display: flex; align-items: center; gap: 6px; flex: none; }
.tray__collapse svg { transition: transform 150ms ease-out; }
.tray--collapsed .tray__collapse svg { transform: rotate(-90deg); }
.tray--collapsed .tray__note, .tray--collapsed .tray__actions { display: none; }
.tray--collapsed .stack { display: none; }

/* The page note sits in its own field, so it reads as input rather than as a caption. */
.tray__note {
  display: block;
  width: calc(100% - 24px);
  min-height: 38px;
  max-height: 80px;
  margin: 6px 12px 2px;
  padding: 9px 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.28);
  color: var(--text);
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  resize: none;
  transition: border-color 120ms, background 120ms, box-shadow 120ms;
}

.tray__note:focus {
  outline: none;
  border-color: rgba(142, 213, 255, 0.45);
  background: rgba(0, 0, 0, 0.36);
  box-shadow: var(--focus-ring);
}
.tray__note::placeholder { color: rgba(189, 200, 209, 0.45); }

.tray__actions { display: flex; align-items: center; gap: 8px; padding: 8px 12px 12px; }

/* The three modes read as one segmented control. */
.tray__tools {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.04);
}
.tray__tools .circle { width: 30px; height: 30px; }
.tray__tool svg { width: 19px; height: 19px; }

.tray__send { box-shadow: 0 0 0 1px rgba(142, 213, 255, 0.25), 0 6px 18px rgba(56, 189, 248, 0.3); }
.tray__send:hover { transform: translateY(-1px); }
.tray__send:disabled { box-shadow: none; }

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
