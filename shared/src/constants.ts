/** Minimum time between automatic history snapshots for the same chart, to bound history size. */
export const SNAPSHOT_MIN_INTERVAL_MS = 5 * 60 * 1000;
/** Snapshots kept per chart before the oldest is pruned. */
export const MAX_HISTORY_SNAPSHOTS = 30;

/** Maximum accepted photo upload size in bytes. */
export const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

/** Whole-install backup archive format (layout mirrors the data directory exactly). */
export const BACKUP_MANIFEST_FILE = 'orgchartr-backup.json';
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_SECTIONS = ['charts', 'sponsors', 'photos'];

export interface BackupManifest {
  formatVersion: number;
  createdAt: string;
  sections: string[];
}

export function buildBackupManifest(): BackupManifest {
  return { formatVersion: BACKUP_FORMAT_VERSION, createdAt: new Date().toISOString(), sections: BACKUP_SECTIONS };
}
