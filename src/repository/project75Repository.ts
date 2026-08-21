import { createInitialData } from '../data/initialData';
import { migrateAppData, type LegacyAppData } from '../lib/appDataMigration';
import { validateAppData } from '../lib/appDataIntegrity';
import type { AppData } from '../types/models';

export const LOCAL_DATA_KEY = 'cut-forward-data-v1';
export const LOCAL_MIGRATION_BACKUP_KEY = 'project75-local-migration-backup-v1';
export const LOCAL_MIGRATION_VERIFIED_KEY = 'project75-migration-verified-v1';

export interface RemoteSnapshot {
  data: AppData | null;
  revision: number;
  updatedAt: string | null;
  account: { id: string; email: string | null };
}

export type RepositoryErrorCode = 'auth_required' | 'offline' | 'conflict' | 'invalid_data' | 'persistence_unavailable';

export class RepositoryError extends Error {
  constructor(public code: RepositoryErrorCode, message: string, public remote?: RemoteSnapshot) {
    super(message);
  }
}

export interface Project75Repository {
  loadLocal(): AppData;
  saveLocal(data: AppData): void;
  loadRemote(): Promise<RemoteSnapshot>;
  saveRemote(data: AppData, baseRevision: number): Promise<RemoteSnapshot>;
  keepMigrationBackup(data: AppData): void;
  hasMigrationBackup(): boolean;
  removeMigrationBackup(): void;
  migrationVerified(): boolean;
  markMigrationVerified(): void;
}

function parseRemoteSnapshot(payload: unknown): RemoteSnapshot {
  if (!payload || typeof payload !== 'object') throw new RepositoryError('invalid_data', 'The server returned an invalid response.');
  const raw = payload as { data?: unknown; revision?: unknown; updatedAt?: unknown; account?: { id?: unknown; email?: unknown } };
  if (!raw.account || typeof raw.account.id !== 'string') throw new RepositoryError('invalid_data', 'The server did not identify the signed-in account.');
  if (raw.data != null) {
    const validation = validateAppData(raw.data);
    if (!validation.valid) throw new RepositoryError('invalid_data', 'The synchronized data did not pass validation.');
  }
  return {
    data: raw.data == null ? null : migrateAppData(raw.data as AppData | LegacyAppData),
    revision: typeof raw.revision === 'number' ? raw.revision : 0,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    account: { id: raw.account.id, email: typeof raw.account.email === 'string' ? raw.account.email : null },
  };
}

function requestFailure(status: number, payload: unknown) {
  const code = payload && typeof payload === 'object' && 'code' in payload ? String((payload as { code: unknown }).code) : '';
  if (status === 401) return new RepositoryError('auth_required', 'Sign in to synchronize your data.');
  if (status === 409) {
    const remote = payload && typeof payload === 'object' && 'remote' in payload ? parseRemoteSnapshot((payload as { remote: unknown }).remote) : undefined;
    return new RepositoryError('conflict', 'Newer data exists on another device.', remote);
  }
  if (status === 503 || code === 'persistence_unavailable') return new RepositoryError('persistence_unavailable', 'Cloud storage is temporarily unavailable.');
  if (status >= 400 && status < 500) return new RepositoryError('invalid_data', 'The server rejected the data.');
  return new RepositoryError('offline', 'The server could not be reached.');
}

export function createProject75Repository(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = window.localStorage,
  fetcher: typeof fetch = window.fetch.bind(window),
): Project75Repository {
  return {
    loadLocal() {
      try {
        const raw = storage.getItem(LOCAL_DATA_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as AppData | LegacyAppData;
          const validation = validateAppData(parsed);
          if (validation.valid || parsed && typeof parsed === 'object' && 'version' in parsed) return migrateAppData(parsed);
        }
      } catch {
        // A corrupted local copy must never replace the safe empty state.
      }
      return migrateAppData(createInitialData());
    },
    saveLocal(data) {
      storage.setItem(LOCAL_DATA_KEY, JSON.stringify(data));
    },
    async loadRemote() {
      let response: Response;
      try { response = await fetcher('/api/data', { headers: { Accept: 'application/json' }, cache: 'no-store' }); }
      catch { throw new RepositoryError('offline', 'The server could not be reached.'); }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw requestFailure(response.status, payload);
      return parseRemoteSnapshot(payload);
    },
    async saveRemote(data, baseRevision) {
      const validation = validateAppData(data);
      if (!validation.valid) throw new RepositoryError('invalid_data', validation.errors[0] ?? 'Data validation failed.');
      let response: Response;
      try {
        response = await fetcher('/api/data', {
          method: 'PUT',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, baseRevision, clientMutationId: crypto.randomUUID() }),
        });
      } catch {
        throw new RepositoryError('offline', 'The server could not be reached.');
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw requestFailure(response.status, payload);
      return parseRemoteSnapshot(payload);
    },
    keepMigrationBackup(data) {
      if (!storage.getItem(LOCAL_MIGRATION_BACKUP_KEY)) storage.setItem(LOCAL_MIGRATION_BACKUP_KEY, JSON.stringify(data));
    },
    hasMigrationBackup() {
      return Boolean(storage.getItem(LOCAL_MIGRATION_BACKUP_KEY));
    },
    removeMigrationBackup() {
      storage.removeItem(LOCAL_MIGRATION_BACKUP_KEY);
    },
    migrationVerified() {
      return storage.getItem(LOCAL_MIGRATION_VERIFIED_KEY) === 'verified';
    },
    markMigrationVerified() {
      storage.setItem(LOCAL_MIGRATION_VERIFIED_KEY, 'verified');
    },
  };
}
