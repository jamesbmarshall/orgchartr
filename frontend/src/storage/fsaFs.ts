/**
 * Low-level helpers over a FileSystemDirectoryHandle, mirroring the server's dataStore file
 * layout so a picked folder is byte-for-byte interchangeable with a Docker DATA_DIR.
 * FSA writables write to a swap file and commit atomically on close(), which stands in for the
 * server's temp-file+rename pattern.
 */

export function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
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

export async function readFileBytes(dir: FileSystemDirectoryHandle, name: string): Promise<Uint8Array | null> {
  try {
    const handle = await dir.getFileHandle(name);
    const file = await handle.getFile();
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
