/** Symbols Chrome uses when it renders a shortcut on macOS. */
const MAC_SYMBOLS: Record<string, string> = {
  Command: '⌘',
  MacCtrl: '⌃',
  Ctrl: '⌘',
  Alt: '⌥',
  Shift: '⇧',
};

/**
 * The shortcut Chrome has actually bound to a command.
 *
 * Read from `chrome.commands` rather than hard-coded, because the manifest only
 * suggests a binding: Chrome drops it when it clashes with something else, and
 * the user can rebind it at any time from `chrome://extensions/shortcuts`.
 */
export async function readShortcut(name: string): Promise<string | null> {
  const commands = await chrome.commands.getAll();
  const shortcut = commands.find((command) => command.name === name)?.shortcut;

  return shortcut === undefined || shortcut === '' ? null : format(shortcut);
}

/**
 * Chrome reports bindings as `Alt+Shift+D` on every platform, but macOS spells
 * the same keys with symbols and no separators.
 */
function format(shortcut: string): string {
  if (!isMac()) return shortcut;

  return shortcut
    .split('+')
    .map((part) => MAC_SYMBOLS[part] ?? part)
    .join('');
}

function isMac(): boolean {
  // `userAgentData` is the non-deprecated source but is not in the DOM types
  // Chrome ships, so it is read defensively with the old property as a fallback.
  const modern = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
  const platform = modern?.platform ?? navigator.platform;
  return platform.toLowerCase().includes('mac');
}
