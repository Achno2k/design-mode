/** Inline SVG icons, sized to the current font. Inline so nothing is fetched at runtime. */

const WRAP = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

/** Sliders, matching the affordance that opens the style panel. */
export const SLIDERS_ICON = WRAP(
  '<path d="M5 8h9M18 8h1M5 16h3M12 16h7"/><circle cx="16" cy="8" r="2"/><circle cx="10" cy="16" r="2"/>',
);

export const CHECK_ICON = WRAP('<path d="M5 13l4 4L19 7"/>');

export const CLOSE_ICON = WRAP('<path d="M6 6l12 12M18 6L6 18"/>');

export const REFRESH_ICON = WRAP('<path d="M20 12a8 8 0 0 1-13.7 5.6L4 15"/><path d="M4 20v-5h5"/><path d="M4 12A8 8 0 0 1 17.7 6.4L20 9"/><path d="M20 4v5h-5"/>');

/** A compact pen nib for freehand annotations. */
export const PEN_ICON = WRAP('<path d="M14.7 5.3l4 4L8.5 19.5 4 20l.5-4.5L14.7 5.3z"/><path d="M12.8 7.2l4 4"/>');

/** Speech bubble with a plus — the affordance that resumes picking. */
export const ANNOTATE_ICON = WRAP(
  '<path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H9l-4 3v-3.9A7.5 7.5 0 0 1 4 11.5 7.5 7.5 0 0 1 11.5 4h1A7.5 7.5 0 0 1 20 11.5z"/><path d="M12 8.6v5.4M9.3 11.3h5.4"/>',
);

/** Chevron pointing down — collapse toggles and select controls. */
export const CHEVRON_ICON = WRAP('<path d="M6 9l6 6 6-6"/>');

/** Arrow leaving towards the top right — the send affordance. */
export const ARROW_UP_RIGHT_ICON = WRAP('<path d="M7 17L17 7"/><path d="M8.5 7H17v8.5"/>');

/** A small bin, for throwing the whole queue away. */
export const TRASH_ICON = WRAP(
  '<path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l.8 12.2A1 1 0 0 0 8.3 20h7.4a1 1 0 0 0 1-.8L17.5 7"/><path d="M10 11v5M14 11v5"/>',
);

export const CONSOLE_ICON = WRAP('<path d="M4 17l6-5-6-5"/><path d="M12 19h8"/>');
