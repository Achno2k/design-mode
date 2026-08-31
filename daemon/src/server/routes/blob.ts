import { writeBlob } from '../../payload/blob-store.ts';
import { isPng } from '../../payload/png.ts';
import { json, type RouteContext, type RouteResult } from '../router.ts';

const MAX_BLOB_BYTES = 16 * 1024 * 1024;

interface BlobDependencies {
  writeBlob: typeof writeBlob;
}

/** Accept one validated PNG into the temporary blob store. */
export function createBlobHandler(dependencies: BlobDependencies = { writeBlob }) {
  return async function handleBlob({ readBody }: RouteContext): Promise<RouteResult> {
    const body = await readBody(MAX_BLOB_BYTES);
    if (!body.ok) {
      const status = body.error.startsWith('The request body is larger than') ? 413 : 400;
      return json(status, { error: body.error });
    }
    if (!isPng(body.value)) {
      return json(400, { error: 'That screenshot was not a valid PNG.' });
    }

    const written = await dependencies.writeBlob(body.value);
    return written.ok
      ? json(200, { blobId: written.value })
      : json(500, { error: written.error });
  };
}

export const handleBlob = createBlobHandler();
