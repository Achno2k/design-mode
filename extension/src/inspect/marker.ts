/**
 * Attribute used to hand an element across the isolated-world boundary.
 *
 * A DOM node cannot be passed to `chrome.scripting.executeScript`, but
 * attributes live on the real shared DOM, so the content script tags the
 * element and the injected script looks it up again.
 */
export const SOURCE_MARKER = 'data-hdm-target';
