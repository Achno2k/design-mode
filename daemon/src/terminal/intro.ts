import { log } from '../logger.ts';
import { playBanner } from './banner.ts';
import { renderPairingCard } from './pairing-card.ts';
import { screen, type Screen } from './screen.ts';

/**
 * What the daemon shows on start: the animated wordmark, then the pairing card.
 * Log lines that arrive meanwhile (the listen message, early rebuilds) wait
 * until the card is drawn, so the animation never tears. Off a terminal it is
 * the plain prefixed lines a log file wants.
 */
export async function showIntro(
  token: string,
  version: string | undefined,
  extensionDir: string,
  target: Screen = screen,
): Promise<void> {
  if (!target.interactive) {
    printPlainPairing(token, extensionDir);
    return;
  }

  const release = target.hold();
  try {
    // Drops npm's "> nudge-daemon@… dev" echo above the banner.
    target.clear();
    await playBanner(target, { version });
    const card = renderPairingCard(token, target.paint, target.columns(), extensionDir);
    target.raw(`${card.join('\n')}\n\n`);
  } finally {
    release();
  }
}

function printPlainPairing(token: string, extensionDir: string): void {
  log.info('────────────────────────────────────────────────────────────────');
  log.info(`Pairing code: ${token}  (paste this into the extension popup)`);
  log.info(`Extension folder: ${extensionDir}`);
  log.info('      Load unpacked that folder in chrome://extensions, then paste the code into the popup.');
  log.info('────────────────────────────────────────────────────────────────');
}
