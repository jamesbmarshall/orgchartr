/**
 * Low-level helpers over a FileSystemDirectoryHandle, mirroring the server's dataStore file
 * layout so a picked folder is byte-for-byte interchangeable with a Docker DATA_DIR.
 * FSA writables write to a swap file and commit atomically on close(), which stands in for the
 * server's temp-file+rename pattern.
 */

import { MAX_JSON_FILE_SIZE } from '@orgchartr/shared';

export function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

const DATA_FOLDER_MARKER = '.orgchartr-data.json';
const DATA_FOLDER_FORMAT_VERSION = 1;
const IGNORED_EMPTY_FOLDER_FILES = new Set(['.DS_Store', 'desktop.ini', 'Thumbs.db']);

export type DataFolderKind = 'empty' | 'marked' | 'legacy' | 'unrecognised';

/** Classifies a picked folder without changing it. */
export async function inspectDataFolder(root: FileSystemDirectoryHandle): Promise<DataFolderKind> {
  try {
    const markerFile = await (await root.getFileHandle(DATA_FOLDER_MARKER)).getFile();
    if (markerFile.size > 4096) throw new Error('The orgchartr folder marker is invalid.');
    let marker: unknown;
    try {
      marker = JSON.parse(await markerFile.text()) as unknown;
    } catch {
      throw new Error('The orgchartr folder marker is invalid.');
    }
    if (
      typeof marker !== 'object'
      || marker === null
      || (marker as { type?: unknown }).type !== 'orgchartr-data'
      || (marker as { formatVersion?: unknown }).formatVersion !== DATA_FOLDER_FORMAT_VERSION
    ) {
      throw new Error('The orgchartr folder marker is invalid.');
    }
    return 'marked';
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }

  const entries: string[] = [];
  for await (const [name] of root.entries()) {
    if (!IGNORED_EMPTY_FOLDER_FILES.has(name)) entries.push(name);
  }
  if (entries.length === 0) return 'empty';

  const charts = await getDir(root, ['charts']);
  if (charts && (await fileExists(charts, 'index.json')) && (await fileExists(root, 'sponsors.json'))) {
    return 'legacy';
  }
  return 'unrecognised';
}

export async function markDataFolder(root: FileSystemDirectoryHandle): Promise<void> {
  await writeJson(root, DATA_FOLDER_MARKER, {
    type: 'orgchartr-data',
    formatVersion: DATA_FOLDER_FORMAT_VERSION,
  });
}

export async function getDir(
  root: FileSystemDirectoryHandle,
  segments: string[],
  options?: { create?: boolean },
): Promise<FileSystemDirectoryHandle | null> {
  let dir = root;
  for (const segment of segments) {
    try {
      dir = await dir.getDirectoryHandle(segment, { create: options?.create ?? false });
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }
  return dir;
}

export async function readFileBytes(
  dir: FileSystemDirectoryHandle,
  name: string,
  maxBytes = MAX_JSON_FILE_SIZE,
): Promise<Uint8Array | null> {
  try {
    const handle = await dir.getFileHandle(name);
    const file = await handle.getFile();
    if (file.size > maxBytes) throw new Error(`${name} is larger than the ${Math.floor(maxBytes / 1024 / 1024)} MB limit.`);
    return new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function readJson<T>(dir: FileSystemDirectoryHandle, name: string, fallback: T): Promise<T> {
  try {
    const handle = await dir.getFileHandle(name);
    const file = await handle.getFile();
    if (file.size > MAX_JSON_FILE_SIZE) {
      throw new Error(`${name} is larger than the ${MAX_JSON_FILE_SIZE / 1024 / 1024} MB JSON limit.`);
    }
    const raw = await file.text();
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    if (isNotFoundError(error)) return fallback;
    throw error;
  }
}

export async function writeBytes(dir: FileSystemDirectoryHandle, name: string, data: Uint8Array | Blob): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  // BufferSource typing in lib.dom rejects Uint8Array<ArrayBufferLike>; normalise via Blob.
  await writable.write(data instanceof Blob ? data : new Blob([data as BlobPart]));
  await writable.close();
}

export async function writeJson(dir: FileSystemDirectoryHandle, name: string, data: unknown): Promise<void> {
  // Match the server's format exactly (2-space indent + trailing newline) so files round-trip
  // cleanly between local-folder mode and the Docker server.
  await writeBytes(dir, name, new TextEncoder().encode(`${JSON.stringify(data, null, 2)}\n`));
}

export async function fileExists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

export async function removeEntry(
  dir: FileSystemDirectoryHandle,
  name: string,
  options?: { recursive?: boolean },
): Promise<boolean> {
  try {
    await dir.removeEntry(name, { recursive: options?.recursive ?? false });
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

/** Names of the files (not directories) directly inside `dir`. */
export async function listFiles(dir: FileSystemDirectoryHandle): Promise<string[]> {
  const names: string[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file') names.push(name);
  }
  return names;
}

/** Scaffolds the standard data layout in a freshly-picked folder (mirrors the server's ensureDataDirs). */
export async function ensureDataDirs(root: FileSystemDirectoryHandle): Promise<void> {
  const charts = await getDir(root, ['charts'], { create: true });
  await getDir(root, ['assets', 'photos'], { create: true });
  if (charts) {
    if (!(await fileExists(charts, 'index.json'))) await writeJson(charts, 'index.json', []);
  }
  if (!(await fileExists(root, 'sponsors.json'))) await writeJson(root, 'sponsors.json', []);
}
