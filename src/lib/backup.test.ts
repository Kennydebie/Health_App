import { describe, expect, it } from 'vitest';
import { createInitialData } from '../data/initialData';
import { backupToAppData, createBackup, inspectBackup } from './backup';

describe('Project 75 backups', () => {
  it('exports every core data category and reconstructs valid application data', () => {
    const data = createInitialData();
    data.habits = [{ date: '2026-08-21', water: true, walk: false, sleep: true }];
    data.cardioLog = [{ id: 'walk-1', date: '2026-08-21', minutes: 35, activity: 'Brisk walk' }];
    const backup = createBackup(data, '2026-08-21T12:00:00Z');
    const restored = backupToAppData(backup);

    expect(backup).toMatchObject({ schemaVersion: 1, exportedAt: '2026-08-21T12:00:00Z' });
    expect(restored.habits).toEqual(data.habits);
    expect(restored.cardioLog).toEqual(data.cardioLog);
  });

  it('previews duplicates and rejects malformed or unsupported files before import', () => {
    const data = createInitialData();
    data.habits = [{ date: '2026-08-21', water: true, walk: true, sleep: true }];
    const valid = inspectBackup(JSON.stringify(createBackup(data)), data);
    expect(valid.backup).not.toBeNull();
    expect(valid.duplicateCount).toBeGreaterThan(0);
    expect(inspectBackup('{broken', data).invalidRecordCount).toBe(1);
    expect(inspectBackup(JSON.stringify({ schemaVersion: 99 }), data).errors[0]).toContain('not supported');
  });
});
