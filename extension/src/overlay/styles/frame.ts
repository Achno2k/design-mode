/**
 * Rules for the overlay a child frame runs on its own.
 *
 * A frame shows only a highlight; the composer and tray live in the top page.
 * Its box is dashed so a reader can tell "inside an iframe" from the top
 * page's solid one when both documents are visible at once.
 */
export const FRAME_CSS = `
.layer--frame .highlight { border-style: dashed; }
`;
