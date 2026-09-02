import { fail, type Answer } from './messaging.ts';

/**
 * Put the console hook into a tab's own JavaScript world.
 *
 * Placeholder until console capture lands. It will use
 * `chrome.scripting.executeScript({ world: 'MAIN' })` the same way the source
 * reader does, so the hook can wrap the page's real `console`.
 */
export async function installConsoleHookInTab(_tabId: number | undefined): Promise<Answer<true>> {
  return fail('Console capture is not available yet.');
}
