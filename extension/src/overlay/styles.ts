import { ANNOTATIONS_CSS } from './styles/annotations.ts';
import { BASE_CSS } from './styles/base.ts';
import { COMPOSER_CSS } from './styles/composer.ts';
import { PICKER_CSS } from './styles/picker.ts';
import { THEME_CSS } from './styles/theme.ts';
import { TRAY_CSS } from './styles/tray.ts';

/**
 * Every rule the overlay needs, in one string.
 *
 * Everything lives inside a shadow root, so these rules cannot leak into the
 * page and the page's rules cannot leak in. Values come from `theme.ts` rather
 * than from the page for the same reason — the overlay must look identical on
 * every site.
 */
export const OVERLAY_CSS = [
  THEME_CSS,
  BASE_CSS,
  COMPOSER_CSS,
  TRAY_CSS,
  PICKER_CSS,
  ANNOTATIONS_CSS,
].join('\n');
