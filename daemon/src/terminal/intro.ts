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
  extensionCommand: string,
  target: Screen = screen,
): Promise<void> {
  if (!target.interactive) {
    printPlainPairing(token, extensionCommand);
    return;
  }

  const release = target.hold();
  try {
    // Drops npm's "> nudge-daemon@… dev" echo above the banner.
    target.clear();
    await playBanner(target, { version });
    const card = renderPairingCard(token, target.paint, target.columns(), extensionCommand);
    target.raw(`${card.join('\n')}\n\n`);
  } finally {
    release();
  }
}

function printPlainPairing(token: string, extensionCommand: string): void {
  log.info('────────────────────────────────────────────────────────────────');
  log.info(`Pairing code: ${token}  (paste this into the extension popup)`);
  log.info(`Next: run \`${extensionCommand}\` for the folder to load in chrome://extensions,`);
  log.info('      then paste this code into the extension popup.');
  log.info('────────────────────────────────────────────────────────────────');
}
