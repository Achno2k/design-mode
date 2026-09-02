/** The row under the agent picker that follows a sent review. */
export const PICK_ROW_CSS = `
.pick-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 12px 0;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
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
