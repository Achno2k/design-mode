import { fail, type Answer, type FrameCommand, type FrameEvent } from './messaging.ts';

/**
 * Pass messages between the top frame and the content scripts in its iframes.
 *
 * Placeholders until iframe picking lands. Events go up to frame 0 with the
 * sender's frame id attached; commands go down to one frame, or to all of them
 * when no frame id is given.
 */
export async function relayFrameEvent(
  _sender: chrome.runtime.MessageSender,
  _event: FrameEvent,
): Promise<Answer<true>> {
  return fail('Frame picking is not available yet.');
}

export async function relayFrameCommand(
  _tabId: number | undefined,
  _frameId: number | undefined,
  _command: FrameCommand,
): Promise<Answer<true>> {
  return fail('Frame picking is not available yet.');
}
