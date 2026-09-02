/** The row under the agent picker that follows a sent review. */
export const PICK_ROW_CSS = `
.pick-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 0;
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
`;
