import {
  fail,
  ok,
  type Answer,
  type ContentRequest,
  type FrameCommand,
  type FrameCommandResult,
  type FrameEvent,
} from './messaging.ts';

/**
 * Pass messages between the top frame and the content scripts in its iframes.
 *
 * Frames cannot talk to each other directly across extension worlds, so the
 * service worker forwards: events go up to frame 0 with the sender's frame id
 * attached, and commands go down to one frame, or to every frame when no id is
 * given. Frame ids come from Chrome, so a frame can never claim to be another.
 */
export async function relayFrameEvent(
  sender: chrome.runtime.MessageSender,
  event: FrameEvent,
): Promise<Answer<true>> {
  const tabId = sender.tab?.id;
  const frameId = sender.frameId;
  if (tabId === undefined || frameId === undefined) {
    return fail('Could not tell which frame sent this.');
  }

  const request: ContentRequest = { kind: 'frame-candidate', frameId, event };
  try {
    await chrome.tabs.sendMessage(tabId, request, { frameId: 0 });
    return ok(true);
  } catch {
    return fail('The top page is not running design mode.');
  }
}

export async function relayFrameCommand(
  tabId: number | undefined,
  frameId: number | undefined,
  command: FrameCommand,
): Promise<Answer<FrameCommandResult>> {
  if (tabId === undefined) return fail('Could not tell which tab owns these frames.');

  const request: ContentRequest = { kind: 'frame-command', command };
  try {
    if (frameId === undefined) {
      // A broadcast gets whichever frame answers first; only its delivery matters.
      await chrome.tabs.sendMessage(tabId, request);
      return ok(true);
    }
    const answer = (await chrome.tabs.sendMessage(tabId, request, { frameId })) as
      | Answer<FrameCommandResult>
      | undefined;
    return answer ?? fail('That frame did not answer.');
  } catch {
    return fail('That frame is not running design mode.');
  }
}
