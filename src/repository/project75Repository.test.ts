import { describe, expect, it, vi } from 'vitest';
import { createInitialData } from '../data/initialData';
import { createProject75Repository, LOCAL_DATA_KEY, LOCAL_MIGRATION_BACKUP_KEY } from './project75Repository';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    values,
  };
}

describe('Project 75 repository', () => {
  it('keeps the legacy browser key and a recoverable migration copy', () => {
    const storage = memoryStorage();
    const repository = createProject75Repository(storage, vi.fn() as never);
    const data = createInitialData();
    data.profile.name = 'Existing user';
    repository.saveLocal(data);
    repository.keepMigrationBackup(data);
    repository.keepMigrationBackup({ ...data, profile: { ...data.profile, name: 'Replacement' } });

    expect(repository.loadLocal().profile.name).toBe('Existing user');
    expect(storage.values.has(LOCAL_DATA_KEY)).toBe(true);
    expect(JSON.parse(storage.values.get(LOCAL_MIGRATION_BACKUP_KEY)!).profile.name).toBe('Existing user');
  });

  it('reads and writes only through the account data endpoint with a revision', async () => {
    const data = createInitialData();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data, revision: 4, updatedAt: '2026-08-21T12:00:00Z', account: { id: 'user-1', email: 'kenny@example.com' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data, revision: 5, updatedAt: '2026-08-21T12:01:00Z', account: { id: 'user-1', email: 'kenny@example.com' } }), { status: 200 }));
    const repository = createProject75Repository(memoryStorage(), fetcher as typeof fetch);

    expect((await repository.loadRemote()).revision).toBe(4);
    expect((await repository.saveRemote(data, 4)).revision).toBe(5);
    expect(fetcher.mock.calls[1][0]).toBe('/api/data');
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ baseRevision: 4, data: { version: 12 } });
  });

  it('surfaces authentication failures instead of pretending synchronization succeeded', async () => {
    const repository = createProject75Repository(memoryStorage(), vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'auth_required' }), { status: 401 })) as typeof fetch);
    await expect(repository.loadRemote()).rejects.toMatchObject({ code: 'auth_required' });
  });
});
