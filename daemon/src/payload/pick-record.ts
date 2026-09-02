import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { config } from '../config.ts';
import { err, ok, type Result } from '../result.ts';
import { isFiniteNumber, isRecord, readString } from './parse-primitives.ts';

/** What `pick.json` holds: enough to follow a review after the daemon restarts. */
export interface PickRecord {
  pickId: string;
  paneId: string;
  notePath: string;
  sessionId?: string;
  baseSeq: number;
  followUps: number;
  sentAt: string;
}

const RECORD_FILE = 'pick.json';

/** Ids are directory names; anything else could walk out of the picks folder. */
const PICK_ID_PATTERN = /^[\w-]+$/;

export function isPickId(value: string): boolean {
  return PICK_ID_PATTERN.test(value);
}

/** Write `pick.json` beside the note. */
export async function writePickRecord(
  directory: string,
  record: PickRecord,
): Promise<Result<void>> {
  try {
    await writeFile(join(directory, RECORD_FILE), JSON.stringify(record, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    return ok(undefined);
  } catch (cause) {
    return err(`Could not save the review record in ${directory}: ${describe(cause)}`);
  }
}

/** Read a review's record back; `null` when there is no such review on disk. */
export async function readPickRecord(
  pickId: string,
  picksDirectory: string = config.picksDir,
): Promise<Result<PickRecord | null>> {
  if (!isPickId(pickId)) return err('That review id is not valid.');

  let text: string;
  try {
    text = await readFile(join(picksDirectory, pickId, RECORD_FILE), 'utf8');
  } catch (cause) {
    if (isMissingFileError(cause)) return ok(null);
    return err(`Could not read the record for review ${pickId}: ${describe(cause)}`);
  }

  try {
    const record = parsePickRecord(JSON.parse(text));
    return record === null
      ? err(`The record for review ${pickId} is not in a shape this daemon understands.`)
      : ok(record);
  } catch {
    return err(`The record for review ${pickId} is not valid JSON.`);
  }
}

function parsePickRecord(value: unknown): PickRecord | null {
  if (!isRecord(value)) return null;
  const pickId = readString(value.pickId);
  const paneId = readString(value.paneId);
  const notePath = readString(value.notePath);
  const sentAt = readString(value.sentAt);
  const sessionId = readString(value.sessionId);
  if (pickId === null || paneId === null || notePath === null || sentAt === null) return null;
  if (!isFiniteNumber(value.baseSeq) || !isFiniteNumber(value.followUps)) return null;

  return {
    pickId,
    paneId,
    notePath,
    ...(sessionId === null ? {} : { sessionId }),
    baseSeq: value.baseSeq,
    followUps: value.followUps,
    sentAt,
  };
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function isMissingFileError(cause: unknown): boolean {
  return cause instanceof Error && (cause as NodeJS.ErrnoException).code === 'ENOENT';
}
