import { CONSOLE_EVENT, installConsoleHook } from '../inspect/console-hook.ts';
import { fail, ok, type Answer } from './messaging.ts';

/** Said to the user when the page will not take the hook; nothing else is wrong. */
const REFUSED = 'Could not hook console on this page.';

/**
 * Put the console hook into a tab's own JavaScript world.
 *
 * `func` is serialised with `toString()`, which is why `installConsoleHook` has
 * no imports and takes the event name through `args`. A page with a strict
 * content policy can refuse the injection, so the answer is what decides
 * whether the tray's toggle goes on.
 */
export async function installConsoleHookInTab(tabId: number | undefined): Promise<Answer<true>> {
  if (tabId === undefined) return fail('Could not tell which tab asked for this.');

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: installConsoleHook,
      args: [CONSOLE_EVENT],
    });
    return result?.result === true ? ok(true) : fail(REFUSED);
  } catch {
    return fail(REFUSED);
  }
}
