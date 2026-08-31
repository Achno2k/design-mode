import type { Target } from '../lib/protocol.ts';
import type { StatusTone } from './tray.ts';

/** Gate blocked and working agents while returning the next confirmation state. */
export function confirmTargetReady(
  target: Target,
  confirmedPaneId: string | null,
  setConfirmedPaneId: (paneId: string | null) => void,
  showStatus: (message: string, tone: StatusTone) => void,
): boolean {
  if (target.status === 'blocked') {
    setConfirmedPaneId(null);
    showStatus('Cannot send: that target is blocked.', 'error');
    return false;
  }

  if (target.status === 'working' && confirmedPaneId !== target.paneId) {
    setConfirmedPaneId(target.paneId);
    showStatus('Agent is busy · Send again to queue', 'busy');
    return false;
  }

  if (target.status !== 'working') setConfirmedPaneId(null);
  return true;
}
