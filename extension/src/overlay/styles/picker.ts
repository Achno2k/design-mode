/**
 * The agent chooser: a pill naming the current agent, and a menu of the rest.
 *
 * The menu is the same surface as the bar it rises from, so the two read as
 * one object. It opens upward because the bar usually sits near the bottom
 * edge, and fades in place rather than unrolling row by row.
 */
export const PICKER_CSS = `
/* Never the one to give way: a long status line shortens itself, not the agent's name. */
.picker { position: relative; flex: none; display: flex; align-items: center; }

.picker__trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 240px;
  height: 36px;
  padding: 0 12px 0 12px;
  font-size: 12px;
}

.picker__trigger:disabled { cursor: default; }
.picker__trigger:disabled .picker__chevron { display: none; }
.picker--open .picker__trigger { background: var(--surface-highest); border-color: var(--line-strong); }

.picker__dot { flex: none; }

.picker__name {
  min-width: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker__pane { flex: none; color: var(--text-faint); font-weight: 500; }

.picker__chevron { flex: none; display: grid; place-items: center; color: var(--text-faint); }
.picker__chevron svg { width: 14px; height: 14px; transition: transform 160ms ease-out; }
.picker--open .picker__chevron svg { transform: rotate(180deg); }

.picker__menu {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 0;
  z-index: 2;
  width: 360px;
  max-width: 80vw;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--surface-raised);
  box-shadow: var(--shadow-menu);
  visibility: hidden;
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition: opacity 120ms ease-out, transform 140ms cubic-bezier(0.2, 0.8, 0.3, 1),
    visibility 0s linear 140ms;
}

.picker__menu--below {
  bottom: auto;
  top: calc(100% + 10px);
  transform: translateY(-4px);
}

.picker__menu--open {
  visibility: visible;
  opacity: 1;
  transform: none;
  pointer-events: auto;
  transition-delay: 0s;
}

/* Bare text with a hairline beneath: a place to type, not another box in a box. */
.picker__filter {
  display: block;
  width: 100%;
  margin: 0 0 6px;
  padding: 8px 14px 10px;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  outline: none;
}
.picker__filter::placeholder { color: var(--text-faint); }
.picker__filter::-webkit-search-cancel-button { -webkit-appearance: none; }

/* Scrolls, but without a bar: the fade of the last row past the edge says there is more. */
.picker__list { max-height: 320px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; }
.picker__list::-webkit-scrollbar { display: none; }

/* Groups are parted by a rule, not by spacing alone. */
.picker__group { padding: 4px 0 8px; }
.picker__group + .picker__group { margin-top: 4px; border-top: 1px solid var(--line); padding-top: 10px; }

.picker__harness {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px 6px;
  font-size: 11px;
  line-height: 14px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-dim);
}

.picker__count {
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-dim);
  font-size: 11px;
  letter-spacing: 0;
}

.picker__row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 12px 8px 14px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  text-align: left;
  cursor: pointer;
  transition: background 120ms, color 120ms;
}
.picker__row[hidden] { display: none; }

/* The check says which is chosen; a fill would say it twice. */
.picker__row:hover { background: var(--surface-sunken); }

.picker__row-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.picker__row-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.picker__row-meta { color: var(--text-faint); font-size: 11px; line-height: 14px; }

.picker__chip {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 26px;
  padding: 0 10px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-dim);
  font-size: 12px;
  line-height: 16px;
}
.picker__chip-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--text-faint); }
.picker__chip--working { color: var(--warning); }
.picker__chip--working .picker__chip-dot { background: var(--warning); }
.picker__chip--blocked, .picker__chip--unknown { color: var(--error); }
.picker__chip--blocked .picker__chip-dot, .picker__chip--unknown .picker__chip-dot { background: var(--error); }

/* Always laid out, so the chips sit in one column whether or not a row is chosen. */
.picker__check { flex: none; display: grid; place-items: center; width: 18px; color: var(--accent); visibility: hidden; }
.picker__check svg { width: 16px; height: 16px; }
.picker__row--on .picker__check { visibility: visible; }

/* Small and tucked in the corner: asking again is rare, choosing is not. */
.picker__foot { display: flex; align-items: center; gap: 10px; margin-top: 4px; padding: 8px 6px 2px 14px; border-top: 1px solid var(--line); }
.picker__total { flex: 1; color: var(--text-faint); font-size: 11px; line-height: 14px; }
.picker__foot-rule { width: 1px; height: 16px; background: var(--line-strong); }

.picker__refresh {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-faint);
  font: inherit;
  font-size: 11px;
  line-height: 14px;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background 120ms, color 120ms;
}

.picker__refresh:hover { background: rgba(255, 122, 92, 0.16); color: #ffb08f; }
.picker__refresh:disabled { cursor: default; color: var(--text-faint); background: transparent; }
.picker__refresh-icon { display: grid; place-items: center; }
.picker__refresh-icon svg { width: 13px; height: 13px; }
.picker__refresh--busy .picker__refresh-icon svg { animation: spin 700ms linear infinite; }
`;
