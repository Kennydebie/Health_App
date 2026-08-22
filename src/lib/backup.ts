import { createInitialData } from '../data/initialData';
import { migrateAppData } from './appDataMigration';
import { mergeAppData, summarizeAppData, validateAppData, type DataSummary } from './appDataIntegrity';
import type { AppData, FoodItem } from '../types/models';

export const BACKUP_SCHEMA_VERSION = 1;

export interface Project75Backup {
  schemaVersion: number;
  exportedAt: string;
  appDataVersion: number;
  profile: AppData['profile'];
  settings: Pick<AppData, 'nutritionSettings' | 'bodyGoals' | 'weeklyCardioTarget' | 'squatProgression' | 'exerciseRestPreferences'>;
  nutritionEntries: AppData['foodLog'];
  nutritionTargetHistory: AppData['nutritionTargetHistory'];
  nutritionDayRecords: AppData['nutritionDayRecords'];
  customFoods: FoodItem[];
  favorites: string[];
  recentFoodIds: string[];
  savedMeals: AppData['savedMeals'];
  workouts: AppData['sessions'];
  workoutTemplates: AppData['program'];
  trainingPlanner: AppData['trainingPlanner'];
  bodyMeasurements: AppData['measurements'];
  weightLossPlans: AppData['weightLossPlans'];
  habits: AppData['habits'];
  cardioLog: AppData['cardioLog'];
  progressionPlans: AppData['progressionPlans'];
}

export interface BackupPreview extends DataSummary {
  schemaVersion: number;
  duplicateCount: number;
  conflictCount: number;
  invalidRecordCount: number;
  backup: Project75Backup | null;
  errors: string[];
}

export function createBackup(data: AppData, now = new Date().toISOString()): Project75Backup {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now,
    appDataVersion: data.version,
    profile: data.profile,
    settings: {
      nutritionSettings: data.nutritionSettings,
      bodyGoals: data.bodyGoals,
      weeklyCardioTarget: data.weeklyCardioTarget,
      squatProgression: data.squatProgression,
      exerciseRestPreferences: data.exerciseRestPreferences,
    },
    nutritionEntries: data.foodLog,
    nutritionTargetHistory: data.nutritionTargetHistory,
    nutritionDayRecords: data.nutritionDayRecords,
    customFoods: data.foodLibrary,
    favorites: data.favorites,
    recentFoodIds: data.recentFoodIds,
    savedMeals: data.savedMeals,
    workouts: data.sessions,
    workoutTemplates: data.program,
    trainingPlanner: data.trainingPlanner,
    bodyMeasurements: data.measurements,
    weightLossPlans: data.weightLossPlans,
    habits: data.habits,
    cardioLog: data.cardioLog,
    progressionPlans: data.progressionPlans,
  };
}

export function backupToAppData(backup: Project75Backup): AppData {
  const initial = createInitialData();
  return migrateAppData({
    ...initial,
    version: backup.appDataVersion,
    profile: backup.profile,
    nutritionSettings: backup.settings.nutritionSettings,
    bodyGoals: backup.settings.bodyGoals,
    weeklyCardioTarget: backup.settings.weeklyCardioTarget,
    squatProgression: backup.settings.squatProgression,
    exerciseRestPreferences: backup.settings.exerciseRestPreferences ?? {},
    foodLog: backup.nutritionEntries,
    nutritionTargetHistory: backup.nutritionTargetHistory,
    nutritionDayRecords: backup.nutritionDayRecords,
    favorites: backup.favorites,
    recentFoodIds: backup.recentFoodIds,
    savedMeals: backup.savedMeals,
    foodLibrary: backup.customFoods ?? [],
    sessions: backup.workouts,
    program: backup.workoutTemplates,
    trainingPlanner: backup.trainingPlanner,
    measurements: backup.bodyMeasurements,
    weightLossPlans: backup.weightLossPlans,
    habits: backup.habits,
    cardioLog: backup.cardioLog,
    progressionPlans: backup.progressionPlans,
  });
}

export function inspectBackup(raw: string, current: AppData): BackupPreview {
  const empty: BackupPreview = { ...summarizeAppData(createInitialData()), schemaVersion: 0, duplicateCount: 0, conflictCount: 0, invalidRecordCount: 0, backup: null, errors: [] };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { ...empty, invalidRecordCount: 1, errors: ['This file is not valid JSON.'] }; }
  if (!parsed || typeof parsed !== 'object') return { ...empty, invalidRecordCount: 1, errors: ['This file is not a Project 75 backup.'] };
  const backup = parsed as Project75Backup;
  if (backup.schemaVersion !== BACKUP_SCHEMA_VERSION) return { ...empty, schemaVersion: Number(backup.schemaVersion) || 0, invalidRecordCount: 1, errors: ['This backup version is not supported.'] };
  try {
    const imported = backupToAppData(backup);
    const validation = validateAppData(imported);
    if (!validation.valid) return { ...empty, schemaVersion: backup.schemaVersion, invalidRecordCount: validation.errors.length, errors: validation.errors };
    const merged = mergeAppData(current, imported);
    return { ...summarizeAppData(imported), schemaVersion: backup.schemaVersion, duplicateCount: merged.duplicates, conflictCount: merged.conflicts, invalidRecordCount: 0, backup, errors: [] };
  } catch {
    return { ...empty, schemaVersion: backup.schemaVersion, invalidRecordCount: 1, errors: ['The backup is incomplete or contains invalid records.'] };
  }
}
