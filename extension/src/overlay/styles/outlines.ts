/**
 * Numbered boxes around the elements of a sent review, shown after "Reload and
 * show" so the agent's changes can be checked against what was asked.
 *
 * They are guidance, not chrome: no fill, so the element beneath stays
 * readable, and hidden from screenshots like every other overlay box.
 */
export const OUTLINES_CSS = `
.outline {
  position: fixed;
  border: 2px solid var(--accent);
  border-radius: var(--radius-control);
  box-sizing: border-box;
  pointer-events: none;
}

.outline__number {
  position: absolute;
  top: -10px;
  left: -10px;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 11px;
  line-height: 20px;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
}

.layer--capturing .outline { visibility: hidden; }
`;
