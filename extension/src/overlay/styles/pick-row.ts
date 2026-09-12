/** The row under the agent picker that follows a sent review. */
export const PICK_ROW_CSS = `
.pick-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-sunken);
  font-size: 12px;
  line-height: 16px;
  color: var(--text-faint);
}
.pick-row[hidden] { display: none; }
.pick-row__text {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pick-row__actions { display: flex; align-items: center; gap: 2px; flex: none; }
.pick-row__action {
  padding: 3px 9px;
  border-color: var(--hairline);
  background: var(--surface-container);
  font-size: 11px;
  line-height: 14px;
  white-space: nowrap;
}
.pick-row__action:hover { background: var(--surface-high); color: var(--accent); }
`;
