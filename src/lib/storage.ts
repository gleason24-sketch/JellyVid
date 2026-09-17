/**
 * Output durability.
 *
 * Provider URLs are retained for about seven days. A share link that dies in a
 * week is not a share link, so every completed output is mirrored into our own
 * store and served from /api/media/[key].
 *
 * Netlify Blobs is used in production; a temp-dir driver stands in locally and
 * under test. If neither is reachable we keep the provider URL and say so
 * rather than pretending the copy happened.
 */
import 'server-only';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const STORE_NAME = 'jellyvid-outputs';

export interface StoredObject {
  bytes: Uint8Array;
  contentType: string;
}

function localDir(): string {
  return process.env.JELLYVID_BLOB_DIR ?? join(tmpdir(), 'jellyvid-blobs');
}

async function netlifyStore() {
  // Netlify injects the blobs context at runtime; off-platform this throws and
  // we fall through to the local driver.
  try {
    const { getStore } = await import('@netlify/blobs');
    return getStore({ name: STORE_NAME, consistency: 'strong' });
  } catch {
    return null;
  }
}

export async function putObject(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<boolean> {
  const store = await netlifyStore();
  if (store) {
    try {
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      await store.set(key, buffer, { metadata: { contentType } });
      return true;
    } catch {
      /* fall through to the local driver */
    }
  }
  try {
    const dir = localDir();
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, key), bytes);
    await writeFile(join(dir, `${key}.type`), contentType, 'utf8');
    return true;
  } catch {
    return false;
  }
}

export async function getObject(key: string): Promise<StoredObject | null> {
  const store = await netlifyStore();
  if (store) {
    try {
      const result = await store.getWithMetadata(key, { type: 'arrayBuffer' });
      if (result?.data) {
        const contentType =
          typeof result.metadata?.contentType === 'string'
            ? result.metadata.contentType
            : 'application/octet-stream';
        return { bytes: new Uint8Array(result.data as ArrayBuffer), contentType };
      }
    } catch {
      /* fall through to the local driver */
    }
  }
  try {
    const dir = localDir();
    const bytes = await readFile(join(dir, key));
    let contentType = 'application/octet-stream';
    try {
      contentType = await readFile(join(dir, `${key}.type`), 'utf8');
    } catch {
      /* default is fine */
    }
    return { bytes: new Uint8Array(bytes), contentType };
  } catch {
    return null;
  }
}

export function extensionFor(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('gif')) return 'gif';
  if (contentType.includes('mp4')) return 'mp4';
  if (contentType.includes('quicktime') || contentType.includes('mov')) return 'mov';
  if (contentType.includes('mpeg') || contentType.includes('mp3')) return 'mp3';
  if (contentType.includes('wav')) return 'wav';
  return 'jpg';
}

export function storageKey(jobId: string, contentType: string): string {
  return `${jobId}.${extensionFor(contentType)}`;
}
