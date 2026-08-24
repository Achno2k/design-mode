/** Symbols Chrome uses when it renders a shortcut on macOS. */
const MAC_SYMBOLS: Record<string, string> = {
  Command: '⌘',
  MacCtrl: '⌃',
  Ctrl: '⌘',
  Alt: '⌥',
  Shift: '⇧',
};

/**
 * The keys Chrome has actually bound to a command, one per chip.
 *
 * Read from `chrome.commands` rather than hard-coded, because the manifest only
 * suggests a binding: Chrome drops it when it clashes with something else, and
 * the user can rebind it at any time from `chrome://extensions/shortcuts`.
 */
export async function readShortcutKeys(name: string): Promise<string[] | null> {
  const commands = await chrome.commands.getAll();
  const shortcut = commands.find((command) => command.name === name)?.shortcut;

  if (shortcut === undefined || shortcut === '') return null;
  // Chrome reports bindings as `Alt+Shift+D` on every platform, but macOS
  // spells the same modifiers with symbols.
  return shortcut.split('+').map((part) => (isMac() ? MAC_SYMBOLS[part] ?? part : part));
}

/** The keys for annotate on / off, which the page handles rather than Chrome. */
export function annotateKeys(): string[] {
  return [isMac() ? '⌘' : 'Ctrl', '.'];
}

function isMac(): boolean {
  // `userAgentData` is the non-deprecated source but is not in the DOM types
  // Chrome ships, so it is read defensively with the old property as a fallback.
  const modern = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
  const platform = modern?.platform ?? navigator.platform;
  return platform.toLowerCase().includes('mac');
}
