import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { uid } from '../lib/id';
import { buildProgramTemplate, smartRepTargets, warmupTargets } from '../lib/workout';
import { withDetectedOutliers } from '../lib/bodyMeasurements';
import { dayIdForDate, moveTrainingSession as movePlannerSession, recalculateTrainingWeek, restoreRecommendedWeek as restorePlannerWeek, selectTrainingSession as selectPlannerSession, workoutTemplate } from '../lib/adaptivePlanner';
import { shiftDate, toDateKey } from '../lib/date';
import { createWeightLossPlan } from '../lib/weightLossPlan';
import { detectedTimezone, nutritionTargetFromProfile, upsertTargetSnapshot } from '../lib/nutritionEvaluation';
import { createProject75Repository, RepositoryError, type RemoteSnapshot } from '../repository/project75Repository';
import { appDataFingerprint, hasMeaningfulData, mergeAppData, stripProductionFixtures, summarizeAppData, type DataSummary } from '../lib/appDataIntegrity';
import { createBackup, inspectBackup, backupToAppData, type BackupPreview, type Project75Backup } from '../lib/backup';
import { applyBodyMeasurement } from '../lib/dataTransactions';
import { getNutritionTotals } from '../lib/selectors';
import { emptyMeasurementValues } from '../lib/appDataMigration';
import { createInitialData } from '../data/initialData';
import { createFoodSnapshot, foodCanBeLogged } from '../lib/nutrition';
import { resolveFood } from '../lib/foodCatalog';
import { decideWeeklyCoach } from '../lib/coachingEngine';
import type { AppData, BodyGoalSettings, BodyMeasurement, BodyMeasurementDraft, BodyMetricKey, CalorieReservation, CardioEntry, CoachRecommendation, CoachingSettings, FoodItem, FoodLogEntry, HabitEntry, LoggedSet, MealType, NutritionDayRecord, NutritionEvaluationSettings, PausePeriod, PlannedFoodEntry, ProgressionPlan, ReadinessResponse, RecommendationFeedback, RecommendationStatus, RecoveryFeedback, SavedDayTemplate, SessionTemplateId, SquatProgressionLevel, TrainingDayPlan, TrainingSelectionSource, TrainingTemplate, UserProfile, WeeklyCheckIn, WorkoutDay, WorkoutSession } from '../types/models';

export { migrateAppData } from '../lib/appDataMigration';

const repository = typeof window === 'undefined' ? null : createProject75Repository();

export type SyncStatus = 'checking' | 'auth_required' | 'migration_required' | 'syncing' | 'synced' | 'offline' | 'unavailable' | 'conflict_resolved' | 'local_only';

export interface MigrationPreview {
  local: DataSummary;
  cloud: DataSummary | null;
  duplicates: number;
  conflicts: number;
}

function loadData(): AppData {
  return repository?.loadLocal() ?? createInitialData();
}

function withProductEvent(data: AppData, name: AppData['productEvents'][number]['name']): AppData {
  if (data.productEvents.some((event) => event.name === name)) return data;
  return { ...data, productEvents: [...data.productEvents, { id: uid('event'), name, occurredAt: new Date().toISOString() }] };
}

export function useAppData() {
  const [data, setData] = useState<AppData>(loadData);
  const bootstrapData = useRef(data);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('checking');
  const [lastSuccessfulSync, setLastSuccessfulSync] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState('Checking secure cloud storage…');
  const [account, setAccount] = useState<RemoteSnapshot['account'] | null>(null);
  const [migrationBackupAvailable, setMigrationBackupAvailable] = useState(() => repository?.hasMigrationBackup() ?? false);
  const [migrationRemote, setMigrationRemote] = useState<RemoteSnapshot | null | undefined>(undefined);
  const revisionRef = useRef(0);
  const lastSyncedFingerprint = useRef('');
  const syncEnabled = useRef(false);
  const syncInFlight = useRef(false);
  const queuedData = useRef<AppData | null>(null);

  useEffect(() => {
    repository?.saveLocal(data);
  }, [data]);

  const update = useCallback((recipe: (current: AppData) => AppData) => setData((current) => recipe(current)), []);
  const plannerDate = useRef(toDateKey());

  const syncData = useCallback(async (nextData: AppData) => {
    if (!repository || !syncEnabled.current) return;
    if (syncInFlight.current) {
      queuedData.current = nextData;
      return;
    }
    syncInFlight.current = true;
    let pending: AppData | null = nextData;
    try {
      while (pending) {
        const candidate = pending;
        pending = null;
        queuedData.current = null;
        const fingerprint = appDataFingerprint(candidate);
        if (fingerprint === lastSyncedFingerprint.current) {
          pending = queuedData.current;
          continue;
        }
        setSyncStatus('syncing');
        setSyncMessage('Saving changes securely…');
        try {
          const saved = await repository.saveRemote(candidate, revisionRef.current);
          revisionRef.current = saved.revision;
          lastSyncedFingerprint.current = appDataFingerprint(saved.data ?? candidate);
          setAccount(saved.account);
          setLastSuccessfulSync(saved.updatedAt);
          setSyncStatus('synced');
          setSyncMessage('All changes are synchronized.');
        } catch (error) {
          if (error instanceof RepositoryError && error.code === 'conflict' && error.remote?.data) {
            const merged = mergeAppData(error.remote.data, candidate);
            const saved = await repository.saveRemote(merged.data, error.remote.revision);
            revisionRef.current = saved.revision;
            lastSyncedFingerprint.current = appDataFingerprint(merged.data);
            setData(merged.data);
            setLastSuccessfulSync(saved.updatedAt);
            setSyncStatus('conflict_resolved');
            setSyncMessage(`Newer changes from another device were merged${merged.conflicts ? ` with ${merged.conflicts} flagged conflict${merged.conflicts === 1 ? '' : 's'}` : ''}.`);
          } else if (error instanceof RepositoryError && error.code === 'auth_required') {
            syncEnabled.current = false;
            setSyncStatus('auth_required');
            setSyncMessage('Sign in to protect and synchronize your health data.');
          } else if (error instanceof RepositoryError && error.code === 'persistence_unavailable') {
            setSyncStatus('unavailable');
            setSyncMessage('Cloud storage is temporarily unavailable. Your recoverable local copy is safe.');
          } else {
            setSyncStatus('offline');
            setSyncMessage('Changes are saved on this device and will retry when the connection returns.');
          }
        }
        pending = queuedData.current;
      }
    } finally {
      syncInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!repository) return;
    let cancelled = false;
    const bootstrap = async () => {
      const localData = bootstrapData.current;
      setSyncStatus('checking');
      try {
        const remote = await repository.loadRemote();
        if (cancelled) return;
        setAccount(remote.account);
        revisionRef.current = remote.revision;
        setLastSuccessfulSync(remote.updatedAt);
        const localHasData = hasMeaningfulData(localData);
        const same = Boolean(remote.data && appDataFingerprint(remote.data) === appDataFingerprint(stripProductionFixtures(localData)));
        if (same) {
          repository.markMigrationVerified();
          syncEnabled.current = true;
          lastSyncedFingerprint.current = appDataFingerprint(remote.data!);
          setData(remote.data!);
          setSyncStatus('synced');
          setSyncMessage('All changes are synchronized.');
          return;
        }
        if (localHasData && !repository.migrationVerified()) {
          setMigrationRemote(remote);
          setSyncStatus('migration_required');
          setSyncMessage('Existing browser data is ready to import into your account.');
          return;
        }
        if (remote.data && !localHasData) {
          syncEnabled.current = true;
          lastSyncedFingerprint.current = appDataFingerprint(remote.data);
          setData(remote.data);
          setSyncStatus('synced');
          setSyncMessage('Your synchronized data is available on this device.');
          return;
        }
        if (remote.data && localHasData) {
          const merged = mergeAppData(remote.data, stripProductionFixtures(localData));
          syncEnabled.current = true;
          setData(merged.data);
          void syncData(merged.data);
          return;
        }
        syncEnabled.current = true;
        void syncData(stripProductionFixtures(localData));
      } catch (error) {
        if (cancelled) return;
        if (error instanceof RepositoryError && error.code === 'auth_required') {
          setSyncStatus('auth_required');
          setSyncMessage('Sign in to protect and synchronize your health data.');
        } else if (error instanceof RepositoryError && error.code === 'persistence_unavailable') {
          setSyncStatus('unavailable');
          setSyncMessage('Cloud storage is not connected yet. Your local copy remains available.');
        } else {
          setSyncStatus('offline');
          setSyncMessage('You appear to be offline. Changes remain safe on this device until sync resumes.');
        }
      }
    };
    void bootstrap();
    return () => { cancelled = true; };
  }, [syncData]);

  useEffect(() => {
    if (!syncEnabled.current || migrationRemote !== undefined) return;
    if (appDataFingerprint(data) === lastSyncedFingerprint.current) return;
    const timer = window.setTimeout(() => { void syncData(data); }, 700);
    return () => window.clearTimeout(timer);
  }, [data, migrationRemote, syncData]);

  useEffect(() => {
    const retry = () => { if (syncEnabled.current) void syncData(data); };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [data, syncData]);

  const migrationPreview = useMemo<MigrationPreview | null>(() => {
    if (migrationRemote === undefined) return null;
    const cleaned = stripProductionFixtures(data);
    const merged = migrationRemote?.data ? mergeAppData(migrationRemote.data, cleaned) : { data: cleaned, duplicates: 0, conflicts: 0 };
    return {
      local: summarizeAppData(cleaned),
      cloud: migrationRemote?.data ? summarizeAppData(migrationRemote.data) : null,
      duplicates: merged.duplicates,
      conflicts: merged.conflicts,
    };
  }, [data, migrationRemote]);

  const migrateLocalData = useCallback(async () => {
    if (!repository || migrationRemote === undefined) return false;
    const cleaned = stripProductionFixtures(data);
    const merged = migrationRemote?.data ? mergeAppData(migrationRemote.data, cleaned) : { data: cleaned, duplicates: 0, conflicts: 0 };
    repository.keepMigrationBackup(data);
    setMigrationBackupAvailable(true);
    setSyncStatus('syncing');
    setSyncMessage('Importing existing records into your account…');
    try {
      const saved = await repository.saveRemote(merged.data, migrationRemote?.revision ?? 0);
      repository.markMigrationVerified();
      repository.saveLocal(merged.data);
      revisionRef.current = saved.revision;
      lastSyncedFingerprint.current = appDataFingerprint(merged.data);
      syncEnabled.current = true;
      setAccount(saved.account);
      setLastSuccessfulSync(saved.updatedAt);
      setData(merged.data);
      setMigrationRemote(undefined);
      setSyncStatus('synced');
      setSyncMessage('Existing records were imported and verified. A recoverable local copy was kept.');
      return true;
    } catch (error) {
      setSyncStatus(error instanceof RepositoryError && error.code === 'offline' ? 'offline' : 'unavailable');
      setSyncMessage('The import did not complete. Nothing was removed and your local data is still safe.');
      return false;
    }
  }, [data, migrationRemote]);

  const keepLocalOnly = useCallback(() => {
    syncEnabled.current = false;
    setMigrationRemote(undefined);
    setSyncStatus('local_only');
    setSyncMessage('Cloud import was postponed. This device copy remains available.');
  }, []);

  const retrySync = useCallback(async () => {
    if (!repository) return;
    try {
      const remote = await repository.loadRemote();
      setAccount(remote.account);
      revisionRef.current = remote.revision;
      if (hasMeaningfulData(data) && !repository.migrationVerified()) {
        setMigrationRemote(remote);
        setSyncStatus('migration_required');
        return;
      }
      syncEnabled.current = true;
      const merged = remote.data ? mergeAppData(remote.data, data).data : data;
      setData(merged);
      await syncData(merged);
    } catch (error) {
      setSyncStatus(error instanceof RepositoryError && error.code === 'auth_required' ? 'auth_required' : 'offline');
    }
  }, [data, syncData]);

  const exportBackup = useCallback((): Project75Backup => createBackup(data), [data]);
  const previewBackup = useCallback((raw: string): BackupPreview => inspectBackup(raw, data), [data]);
  const importBackup = useCallback((backup: Project75Backup) => {
    const imported = backupToAppData(backup);
    const merged = mergeAppData(data, imported);
    setData(merged.data);
    return merged;
  }, [data]);
  const removeLocalMigrationBackup = useCallback(() => {
    repository?.removeMigrationBackup();
    setMigrationBackupAvailable(false);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const currentDate = toDateKey();
      if (currentDate === plannerDate.current) return;
      plannerDate.current = currentDate;
      update((current) => ({ ...current, trainingPlanner: recalculateTrainingWeek(current, currentDate) }));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [update]);

  const addFood = useCallback((entry: Omit<FoodLogEntry, 'id' | 'createdAt' | 'snapshot'>, suppliedFood?: FoodItem) => {
    update((current) => {
      const food = suppliedFood ?? resolveFood(current, entry.foodId);
      if (!food || !foodCanBeLogged(food)) return current;
      const snapshot = createFoodSnapshot(food, entry.servingId, entry.quantity);
      if (!snapshot) return current;
      const target = nutritionTargetFromProfile(current.profile, entry.date, detectedTimezone());
      const hasApplicableTarget = current.nutritionTargetHistory.some((item) => item.date <= entry.date);
      const shouldCache = food.source?.provider !== 'local' && !current.foodLibrary.some((item) => item.id === food.id);
      const next = {
        ...current,
        foodLog: [...current.foodLog, { ...entry, snapshot, id: uid('food'), createdAt: new Date().toISOString() }],
        foodLibrary: shouldCache ? [...current.foodLibrary, { ...food, isCached: true }] : current.foodLibrary,
        recentFoodIds: [entry.foodId, ...current.recentFoodIds.filter((id) => id !== entry.foodId)].slice(0, 8),
        nutritionTargetHistory: hasApplicableTarget ? current.nutritionTargetHistory : upsertTargetSnapshot(current.nutritionTargetHistory, target),
      };
      return withProductEvent(next, 'first_food_logged');
    });
  }, [update]);

  const updateFood = useCallback((id: string, changes: Partial<Pick<FoodLogEntry, 'meal' | 'servingId' | 'quantity'>>) => {
    update((current) => ({ ...current, foodLog: current.foodLog.map((entry) => {
      if (entry.id !== id) return entry;
      const next = { ...entry, ...changes };
      const food = resolveFood(current, entry.foodId);
      const snapshot = food ? createFoodSnapshot(food, next.servingId, next.quantity) : null;
      return snapshot ? { ...next, snapshot } : next;
    }) }));
  }, [update]);

  const saveFoodToLibrary = useCallback((food: FoodItem) => update((current) => ({
    ...current,
    foodLibrary: [...current.foodLibrary.filter((item) => item.id !== food.id), food],
  })), [update]);

  const deleteFood = useCallback((id: string) => update((current) => ({ ...current, foodLog: current.foodLog.filter((entry) => entry.id !== id) })), [update]);

  const duplicateFood = useCallback((id: string) => update((current) => {
    const source = current.foodLog.find((entry) => entry.id === id);
    if (!source) return current;
    return { ...current, foodLog: [...current.foodLog, { ...source, id: uid('food'), createdAt: new Date().toISOString() }] };
  }), [update]);

  const toggleFavorite = useCallback((foodId: string) => update((current) => ({
    ...current,
    favorites: current.favorites.includes(foodId) ? current.favorites.filter((id) => id !== foodId) : [...current.favorites, foodId],
  })), [update]);

  const repeatMeal = useCallback((sourceDate: string, targetDate: string, meal: MealType) => update((current) => {
    const copies = current.foodLog.filter((entry) => entry.date === sourceDate && entry.meal === meal).map((entry) => ({ ...entry, id: uid('food'), date: targetDate, createdAt: new Date().toISOString() }));
    const history = current.nutritionTargetHistory.some((item) => item.date <= targetDate) ? current.nutritionTargetHistory : upsertTargetSnapshot(current.nutritionTargetHistory, nutritionTargetFromProfile(current.profile, targetDate));
    return { ...current, foodLog: [...current.foodLog, ...copies], nutritionTargetHistory: history };
  }), [update]);

  const addSavedMeal = useCallback((savedMealId: string, date: string, meal: MealType, scale = 1) => update((current) => {
    const saved = current.savedMeals.find((item) => item.id === savedMealId);
    if (!saved) return current;
    const entries = saved.items.flatMap((item): FoodLogEntry[] => {
      const food = resolveFood(current, item.foodId);
      const quantity = item.quantity * Math.max(.05, scale);
      const snapshot = food ? createFoodSnapshot(food, item.servingId, quantity) : null;
      return snapshot ? [{ ...item, quantity, snapshot, id: uid('food'), date, meal, createdAt: new Date().toISOString() }] : [];
    });
    const history = current.nutritionTargetHistory.some((item) => item.date <= date) ? current.nutritionTargetHistory : upsertTargetSnapshot(current.nutritionTargetHistory, nutritionTargetFromProfile(current.profile, date));
    return { ...current, foodLog: [...current.foodLog, ...entries], nutritionTargetHistory: history };
  }), [update]);

  const saveMealFromDiary = useCallback((name: string, date: string, meal: MealType) => update((current) => {
    const items = current.foodLog.filter((entry) => entry.date === date && entry.meal === meal).map(({ foodId, servingId, quantity }) => ({ foodId, servingId, quantity }));
    if (!name.trim() || !items.length) return current;
    return { ...current, savedMeals: [...current.savedMeals, { id: uid('meal'), name: name.trim().slice(0, 80), items, createdAt: new Date().toISOString() }] };
  }), [update]);

  const deleteSavedMeal = useCallback((id: string) => update((current) => ({ ...current, savedMeals: current.savedMeals.filter((meal) => meal.id !== id) })), [update]);

  const copyNutritionDay = useCallback((sourceDate: string, targetDate: string) => update((current) => {
    const copies = current.foodLog.filter((entry) => entry.date === sourceDate).map((entry) => ({ ...entry, id: uid('food'), date: targetDate, createdAt: new Date().toISOString() }));
    if (!copies.length) return current;
    const history = current.nutritionTargetHistory.some((item) => item.date <= targetDate) ? current.nutritionTargetHistory : upsertTargetSnapshot(current.nutritionTargetHistory, nutritionTargetFromProfile(current.profile, targetDate));
    return { ...current, foodLog: [...current.foodLog, ...copies], nutritionTargetHistory: history };
  }), [update]);

  const finishNutritionDay = useCallback((date: string) => update((current) => ({
    ...current,
    nutritionDayRecords: [...current.nutritionDayRecords.filter((item) => item.date !== date), { ...current.nutritionDayRecords.find((item) => item.date === date), date, finishedAt: new Date().toISOString(), confirmedAt: new Date().toISOString(), completeness: 'fully_logged', untrackedTreatment: undefined }],
  })), [update]);

  const setNutritionDayCompleteness = useCallback((date: string, completeness: NutritionDayRecord['completeness']) => update((current) => ({
    ...current,
    nutritionDayRecords: [...current.nutritionDayRecords.filter((item) => item.date !== date), {
      ...current.nutritionDayRecords.find((item) => item.date === date), date, completeness,
      confirmedAt: new Date().toISOString(),
      finishedAt: completeness === 'fully_logged' ? new Date().toISOString() : undefined,
      ...(completeness === 'fully_logged' ? { untrackedTreatment: undefined } : {}),
    }],
  })), [update]);

  const planFood = useCallback((entry: Omit<PlannedFoodEntry, 'id' | 'status' | 'createdAt'>) => update((current) => {
    if (!resolveFood(current, entry.foodId)) return current;
    return withProductEvent({
      ...current,
      plannedFoodEntries: [...current.plannedFoodEntries, { ...entry, id: uid('planned_food'), status: 'planned', createdAt: new Date().toISOString() }],
    }, 'planned_day_created');
  }), [update]);

  const updatePlannedFood = useCallback((id: string, changes: Partial<Pick<PlannedFoodEntry, 'meal' | 'servingId' | 'quantity' | 'plannedTime' | 'status' | 'actualQuantity'>>) => update((current) => ({
    ...current,
    plannedFoodEntries: current.plannedFoodEntries.map((item) => item.id === id ? { ...item, ...changes } : item),
  })), [update]);

  const consumePlannedFood = useCallback((id: string, actualQuantity?: number) => update((current) => {
    const planned = current.plannedFoodEntries.find((item) => item.id === id);
    if (!planned || planned.status === 'consumed') return current;
    const food = resolveFood(current, planned.foodId);
    const quantity = Math.max(.05, actualQuantity ?? planned.quantity);
    const snapshot = food ? createFoodSnapshot(food, planned.servingId, quantity) : null;
    if (!food || !snapshot) return current;
    const foodLogId = uid('food');
    const target = nutritionTargetFromProfile(current.profile, planned.date, detectedTimezone());
    const hasApplicableTarget = current.nutritionTargetHistory.some((item) => item.date <= planned.date);
    return withProductEvent({
      ...current,
      foodLog: [...current.foodLog, { id: foodLogId, foodId: planned.foodId, date: planned.date, meal: planned.meal, servingId: planned.servingId, quantity, snapshot, createdAt: new Date().toISOString() }],
      plannedFoodEntries: current.plannedFoodEntries.map((item) => item.id === id ? { ...item, status: quantity === planned.quantity ? 'consumed' : 'changed', actualQuantity: quantity, consumedFoodLogId: foodLogId } : item),
      recentFoodIds: [planned.foodId, ...current.recentFoodIds.filter((foodId) => foodId !== planned.foodId)].slice(0, 8),
      nutritionTargetHistory: hasApplicableTarget ? current.nutritionTargetHistory : upsertTargetSnapshot(current.nutritionTargetHistory, target),
    }, 'first_food_logged');
  }), [update]);

  const deletePlannedFood = useCallback((id: string) => update((current) => ({
    ...current, plannedFoodEntries: current.plannedFoodEntries.filter((item) => item.id !== id),
  })), [update]);

  const copyPlannedDay = useCallback((sourceDate: string, targetDate: string) => update((current) => {
    const copies = current.plannedFoodEntries.filter((item) => item.date === sourceDate && item.status !== 'skipped').map((item) => ({
      ...item, id: uid('planned_food'), date: targetDate, status: 'planned' as const, actualQuantity: undefined, consumedFoodLogId: undefined, createdAt: new Date().toISOString(),
    }));
    const reservations = current.calorieReservations.filter((item) => item.date === sourceDate).map((item) => ({ ...item, id: uid('reservation'), date: targetDate, createdAt: new Date().toISOString() }));
    if (!copies.length && !reservations.length) return current;
    return withProductEvent({ ...current, plannedFoodEntries: [...current.plannedFoodEntries, ...copies], calorieReservations: [...current.calorieReservations, ...reservations] }, 'planned_day_created');
  }), [update]);

  const saveDayTemplate = useCallback((name: string, date: string) => update((current) => {
    const items: SavedDayTemplate['items'] = current.plannedFoodEntries.filter((item) => item.date === date && item.status !== 'skipped').map(({ meal, foodId, servingId, quantity, plannedTime }) => ({ meal, foodId, servingId, quantity, plannedTime }));
    if (!name.trim() || !items.length) return current;
    const now = new Date().toISOString();
    return { ...current, dayTemplates: [...current.dayTemplates, { id: uid('day_template'), name: name.trim().slice(0, 80), items, createdAt: now, updatedAt: now }] };
  }), [update]);

  const applyDayTemplate = useCallback((templateId: string, date: string) => update((current) => {
    const template = current.dayTemplates.find((item) => item.id === templateId);
    if (!template) return current;
    const entries: PlannedFoodEntry[] = template.items.map((item) => ({ ...item, id: uid('planned_food'), date, status: 'planned', templateId, createdAt: new Date().toISOString() }));
    return withProductEvent({ ...current, plannedFoodEntries: [...current.plannedFoodEntries, ...entries] }, 'planned_day_created');
  }), [update]);

  const reserveCalories = useCallback((entry: Omit<CalorieReservation, 'id' | 'createdAt'>) => update((current) => ({
    ...current,
    calorieReservations: [...current.calorieReservations, { ...entry, calories: Math.max(0, Math.round(entry.calories)), id: uid('reservation'), createdAt: new Date().toISOString() }],
  })), [update]);

  const deleteCalorieReservation = useCallback((id: string) => update((current) => ({ ...current, calorieReservations: current.calorieReservations.filter((item) => item.id !== id) })), [update]);

  const setNutritionDayTreatment = useCallback((date: string, treatment?: NutritionDayRecord['untrackedTreatment']) => update((current) => ({
    ...current,
    nutritionDayRecords: treatment
      ? [...current.nutritionDayRecords.filter((item) => item.date !== date), { ...current.nutritionDayRecords.find((item) => item.date === date), date, untrackedTreatment: treatment }]
      : current.nutritionDayRecords.map((item) => item.date === date ? { ...item, untrackedTreatment: undefined } : item),
  })), [update]);

  const updateNutritionSettings = useCallback((settings: NutritionEvaluationSettings) => update((current) => ({ ...current, nutritionSettings: settings })), [update]);

  const saveWeight = useCallback((date: string, weightKg: number, waistCircumferenceCm: number | null = null) => update((current) => {
    const withoutDemo = current.measurements.filter((item) => !item.isDemo);
    const existing = withoutDemo.find((item) => item.measuredAt?.slice(0, 10) === date && item.source === 'manual');
    const measurement: BodyMeasurement = {
      ...emptyMeasurementValues,
      ...(existing ?? {}),
      id: existing?.id ?? uid('measurement'),
      measuredAt: existing?.measuredAt ?? `${date}T12:00:00`,
      weightKg,
      waistCircumferenceCm,
      source: 'manual',
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    const measurements = existing
      ? withoutDemo.map((item) => item.id === existing.id ? measurement : item)
      : [...withoutDemo, measurement];
    return { ...current, measurements: withDetectedOutliers(measurements) };
  }), [update]);

  const saveBodyMeasurement = useCallback((draft: BodyMeasurementDraft, replaceId?: string) => update((current) => applyBodyMeasurement(current, draft, {
    id: uid('measurement'),
    now: new Date().toISOString(),
    replaceId,
  })), [update]);

  const updateBodyGoals = useCallback((bodyGoals: BodyGoalSettings) => update((current) => ({ ...current, bodyGoals })), [update]);

  const saveWeightLossPlan = useCallback((baselineMeasurementId: string, weeklyRatePct: number, planStartDate: string) => update((current) => {
    const baseline = current.measurements.find((measurement) => measurement.id === baselineMeasurementId && !measurement.isDemo && measurement.weightKg != null);
    if (!baseline) return current;
    const now = new Date().toISOString();
    const nextPlan = createWeightLossPlan({
      id: uid('weight_plan'),
      measurement: baseline,
      goalWeightKg: current.profile.goalWeightKg,
      weeklyRatePct,
      planStartDate,
      version: Math.max(0, ...current.weightLossPlans.map((plan) => plan.version)) + 1,
      now,
    });
    return { ...current, weightLossPlans: [...current.weightLossPlans, nextPlan] };
  }), [update]);

  const confirmMeasurementMetric = useCallback((measurementId: string, metric: BodyMetricKey) => update((current) => ({
    ...current,
    measurements: current.measurements.map((measurement) => measurement.id !== measurementId ? measurement : {
      ...measurement,
      excludedFromTrend: (measurement.excludedFromTrend ?? []).filter((item) => item !== metric),
      confirmedOutlierMetrics: [...new Set([...(measurement.confirmedOutlierMetrics ?? []), metric])],
    }),
  })), [update]);

  const updateProfile = useCallback((profile: UserProfile) => update((current) => {
    const targetsChanged = profile.calorieTarget !== current.profile.calorieTarget
      || profile.proteinTarget !== current.profile.proteinTarget
      || profile.carbTarget !== current.profile.carbTarget
      || profile.fatTarget !== current.profile.fatTarget;
    return {
      ...current,
      profile,
      nutritionTargetHistory: targetsChanged
        ? upsertTargetSnapshot(current.nutritionTargetHistory, nutritionTargetFromProfile(profile, toDateKey(), detectedTimezone()))
        : current.nutritionTargetHistory,
    };
  }), [update]);

  const logSteps = useCallback((date: string, steps: number) => update((current) => ({
    ...current,
    activityLog: [...current.activityLog.filter((item) => item.date !== date), { date, steps: Math.max(0, Math.round(steps)), source: 'manual' }],
  })), [update]);

  const saveRecoveryFeedback = useCallback((feedback: Omit<RecoveryFeedback, 'id' | 'createdAt'>) => update((current) => ({
    ...current,
    recoveryFeedback: [...current.recoveryFeedback.filter((item) => item.date !== feedback.date), { ...feedback, id: uid('recovery'), createdAt: new Date().toISOString() }],
  })), [update]);

  const startPause = useCallback((pause: Omit<PausePeriod, 'id' | 'createdAt'>) => update((current) => ({
    ...current,
    activeGoal: { ...current.activeGoal, status: 'paused' },
    pausePeriods: [...current.pausePeriods.map((item) => !item.endDate ? { ...item, endDate: shiftDate(pause.startDate, -1) } : item), { ...pause, id: uid('pause'), createdAt: new Date().toISOString() }],
  })), [update]);

  const resumePlan = useCallback((date = toDateKey()) => update((current) => ({
    ...current,
    activeGoal: { ...current.activeGoal, status: 'active' },
    pausePeriods: current.pausePeriods.map((item) => !item.endDate ? { ...item, endDate: date } : item),
  })), [update]);

  const startMaintenancePhase = useCallback(() => update((current) => ({
    ...current,
    activeGoal: { ...current.activeGoal, phase: 'maintenance', status: 'completed' },
  })), [update]);

  const completeWeeklyCheckIn = useCallback((date: string, recovery?: Omit<RecoveryFeedback, 'id' | 'date' | 'createdAt'>) => {
    let recommendationId = '';
    update((current) => {
      const recoveryFeedback = recovery ? { ...recovery, id: uid('recovery'), date, createdAt: new Date().toISOString() } : null;
      const withRecovery: AppData = recoveryFeedback ? {
        ...current,
        recoveryFeedback: [...current.recoveryFeedback.filter((item) => item.date !== date), recoveryFeedback],
      } : current;
      const decision = decideWeeklyCoach(withRecovery, date);
      const existingCheckIn = withRecovery.weeklyCheckIns.find((item) => item.periodEnd === date);
      const existingRecommendation = existingCheckIn ? withRecovery.coachRecommendations.find((item) => item.id === existingCheckIn.recommendationId) : null;
      recommendationId = existingRecommendation?.id ?? uid('recommendation');
      const recommendation: CoachRecommendation = {
        id: recommendationId,
        periodStart: decision.evidence.length ? shiftDate(date, -6) : date,
        periodEnd: date,
        createdAt: existingRecommendation?.createdAt ?? new Date().toISOString(),
        conclusion: decision.conclusion,
        title: decision.title,
        explanation: decision.explanation,
        confidence: decision.confidence,
        evidence: decision.evidence,
        primaryAction: decision.primaryAction,
        secondaryActions: decision.secondaryActions,
        proposedChange: decision.proposedChange,
        alternativeChange: decision.alternativeChange,
        nextReviewDate: decision.nextReviewDate,
        status: existingRecommendation?.status ?? 'pending',
        responseAt: existingRecommendation?.responseAt,
        feedback: existingRecommendation?.feedback,
      };
      const checkIn: WeeklyCheckIn = {
        id: existingCheckIn?.id ?? uid('check_in'), periodStart: shiftDate(date, -6), periodEnd: date,
        completedAt: new Date().toISOString(), recovery, recommendationId,
      };
      return withProductEvent({
        ...withRecovery,
        coachRecommendations: [...withRecovery.coachRecommendations.filter((item) => item.id !== recommendationId), recommendation],
        weeklyCheckIns: [...withRecovery.weeklyCheckIns.filter((item) => item.periodEnd !== date), checkIn],
      }, 'weekly_check_in_completed');
    });
    return recommendationId;
  }, [update]);

  const respondRecommendation = useCallback((recommendationId: string, status: RecommendationStatus, choice: 'primary' | 'alternative' = 'primary') => update((current) => {
    const recommendation = current.coachRecommendations.find((item) => item.id === recommendationId);
    if (!recommendation) return current;
    const responseAt = new Date().toISOString();
    let next: AppData = {
      ...current,
      coachRecommendations: current.coachRecommendations.map((item) => item.id === recommendationId ? { ...item, status, responseAt } : item),
    };
    if (status !== 'applied') return status === 'rejected' || status === 'kept_current'
      ? withProductEvent(next, 'recommendation_rejected')
      : next;
    const change = choice === 'alternative' ? recommendation.alternativeChange : recommendation.proposedChange;
    if (!change) return next;
    if (change.variable === 'calorie_target' && typeof change.proposedValue === 'number') {
      const profile = { ...next.profile, calorieTarget: change.proposedValue };
      next = { ...next, profile, nutritionTargetHistory: upsertTargetSnapshot(next.nutritionTargetHistory, nutritionTargetFromProfile(profile, toDateKey(), detectedTimezone())) };
    } else if (change.variable === 'daily_steps' && typeof change.proposedValue === 'number') {
      next = { ...next, coachingSettings: { ...next.coachingSettings, dailyStepGoal: change.proposedValue } };
    }
    next = {
      ...next,
      planChanges: [...next.planChanges, {
        id: uid('plan_change'), recommendationId, variable: change.variable, previousValue: change.previousValue,
        newValue: change.proposedValue, reason: recommendation.explanation, appliedAt: responseAt, reviewDate: recommendation.nextReviewDate,
      }],
    };
    return withProductEvent(next, 'recommendation_applied');
  }), [update]);

  const setRecommendationFeedback = useCallback((recommendationId: string, feedback: RecommendationFeedback) => update((current) => ({
    ...current,
    coachRecommendations: current.coachRecommendations.map((item) => item.id === recommendationId ? { ...item, feedback } : item),
  })), [update]);

  const completeOnboarding = useCallback((profile: UserProfile, coachingSettings: CoachingSettings, startingWeightKg?: number) => update((current) => withProductEvent({
    ...current, profile, coachingSettings, onboardingCompleted: true,
    activeGoal: { ...current.activeGoal, startingWeightKg: startingWeightKg ?? current.activeGoal.startingWeightKg ?? null, targetWeightKg: profile.goalWeightKg, targetRangeKg: [profile.goalWeightKg - .5, profile.goalWeightKg + .5] },
  }, 'onboarding_completed')), [update]);

  const updateProgramDay = useCallback((day: WorkoutDay) => update((current) => {
    const next = { ...current, program: current.program.map((item) => item.id === day.id ? day : item) };
    return { ...next, trainingPlanner: recalculateTrainingWeek(next) };
  }), [update]);

  const selectTrainingSession = useCallback((date: string, templateId: SessionTemplateId, source: TrainingSelectionSource = 'user_selected', warningShown = false, readiness?: ReadinessResponse) => update((current) => ({
    ...current,
    trainingPlanner: selectPlannerSession(current, date, templateId, source, warningShown, readiness),
  })), [update]);

  const skipTrainingDay = useCallback((date: string) => update((current) => {
    const plans = current.trainingPlanner.dailyPlans.map((plan) => plan.date === date ? { ...plan, status: 'skipped' as const } : plan);
    const next = { ...current, trainingPlanner: { ...current.trainingPlanner, dailyPlans: plans } };
    return { ...next, trainingPlanner: recalculateTrainingWeek(next, date) };
  }), [update]);

  const moveTrainingSession = useCallback((fromDate: string, toDate: string, swap: boolean) => update((current) => ({
    ...current,
    trainingPlanner: movePlannerSession(current, fromDate, toDate, swap),
  })), [update]);

  const restoreRecommendedWeek = useCallback((date = toDateKey()) => update((current) => ({
    ...current,
    trainingPlanner: restorePlannerWeek(current, date),
  })), [update]);

  const recalculateTrainingPlan = useCallback((date = toDateKey()) => update((current) => ({
    ...current,
    trainingPlanner: recalculateTrainingWeek(current, date),
  })), [update]);

  const keepCurrentTrainingWeek = useCallback((previousPlans: TrainingDayPlan[], selectedDate: string) => update((current) => {
    const previousByDate = new Map(previousPlans.map((plan) => [plan.date, plan]));
    const dailyPlans = current.trainingPlanner.dailyPlans.map((plan) => {
      const previous = previousByDate.get(plan.date);
      if (!previous || plan.date <= selectedDate || plan.status === 'completed') return plan;
      return {
        ...plan,
        selectedSessionTemplateId: previous.selectedSessionTemplateId,
        selectionSource: previous.selectionSource.startsWith('user_') ? previous.selectionSource : 'user_selected' as const,
        status: previous.selectedSessionTemplateId === 'full_rest' ? 'rest' as const : 'selected' as const,
      };
    });
    const next = { ...current, trainingPlanner: { ...current.trainingPlanner, dailyPlans } };
    return { ...next, trainingPlanner: recalculateTrainingWeek(next, selectedDate) };
  }), [update]);

  const addCardio = useCallback((date: string, minutes: number, activity: CardioEntry['activity']) => update((current) => {
    const next = { ...current, cardioLog: [...current.cardioLog, { id: uid('cardio'), date, minutes, activity }] };
    return { ...next, trainingPlanner: recalculateTrainingWeek(next, date) };
  }), [update]);

  const setWeeklyCardioTarget = useCallback((minutes: number) => update((current) => {
    const next = { ...current, weeklyCardioTarget: Math.max(30, Math.min(150, minutes)) };
    return { ...next, trainingPlanner: recalculateTrainingWeek(next) };
  }), [update]);

  const setSquatProgression = useCallback((level: SquatProgressionLevel) => update((current) => ({
    ...current,
    squatProgression: { currentLevel: level, stableSessions: 0, updatedAt: new Date().toISOString() },
    program: current.program.map((day) => ({ ...day, exercises: day.exercises.map((exercise) => exercise.variationGroup === 'squat-progression' ? { ...exercise, exerciseId: level } : exercise) })),
  })), [update]);

  const applyTrainingTemplate = useCallback((template: TrainingTemplate) => update((current) => {
    const program = buildProgramTemplate(template, current.squatProgression.currentLevel);
    const trainingDays = program.filter((day) => !day.isRestDay).map((day) => ({ monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' }[day.id]));
    const next = { ...current, program, profile: { ...current.profile, trainingTemplate: template, trainingDays } };
    return { ...next, trainingPlanner: restorePlannerWeek(next) };
  }), [update]);

  const confirmProgression = useCallback((exerciseId: string, targetWeightKg: number, reason: ProgressionPlan['reason']) => update((current) => ({
    ...current,
    progressionPlans: [...current.progressionPlans.filter((item) => item.exerciseId !== exerciseId), { exerciseId, targetWeightKg, reason, confirmedAt: new Date().toISOString() }],
  })), [update]);

  const startWorkout = useCallback((day: WorkoutDay, date = toDateKey(), mode: 'full' | 'short' = 'full') => {
    if (day.isRestDay || day.exercises.length === 0) return null;
    const lightVersion = data.trainingPlanner.dailyPlans.find((plan) => plan.date === date)?.readinessResponse?.preferredIntensity === 'light';
    const volumeReduction = data.planChanges.some((change) => change.variable === 'training_volume' && change.appliedAt.slice(0, 10) <= date && change.reviewDate >= date);
    const selectedExercises = mode === 'short' ? day.exercises.slice(0, 4) : day.exercises;
    const previousCompleted = data.sessions.filter((session) => session.completedAt).flatMap((session) => session.sets).filter((set) => set.completed && !set.isWarmup);
    const sets: LoggedSet[] = selectedExercises.flatMap((exercise, exerciseIndex) => {
      const previous = previousCompleted.filter((set) => set.exerciseId === exercise.exerciseId).slice(-exercise.sets);
      const confirmedLoad = data.progressionPlans.find((item) => item.exerciseId === exercise.exerciseId)?.targetWeightKg;
      const workingLoad = confirmedLoad ?? previous.at(-1)?.weightKg ?? 0;
      const selectedLoad = lightVersion && workingLoad > 0 ? Math.round(workingLoad * .9 * 2) / 2 : workingLoad;
      const warmupCount = exercise.warmupSets ?? 0;
      const warmupPlan = warmupTargets(selectedLoad, warmupCount, exercise.exerciseId);
      const warmups = Array.from({ length: warmupCount }, (_, index) => ({
        id: uid('set'), exerciseId: exercise.exerciseId, setNumber: index + 1,
        weightKg: warmupPlan[index]?.weightKg ?? 0,
        reps: warmupPlan[index]?.reps ?? 5, completed: false, isWarmup: true,
      }));
      const workingCount = lightVersion || mode === 'short' || volumeReduction && exerciseIndex < 2 ? Math.max(1, exercise.sets - 1) : exercise.sets;
      const repTargets = confirmedLoad && confirmedLoad > (previous.at(-1)?.weightKg ?? 0)
        ? Array.from({ length: workingCount }, () => exercise.repMin)
        : smartRepTargets(previous, exercise, workingCount);
      const working = Array.from({ length: workingCount }, (_, index) => ({
        id: uid('set'), exerciseId: exercise.exerciseId, setNumber: index + 1,
        weightKg: lightVersion ? selectedLoad : confirmedLoad ?? previous[index]?.weightKg ?? previous.at(-1)?.weightKg ?? 0,
        reps: repTargets[index] ?? exercise.repMin, completed: false, isWarmup: false,
      }));
      return [...warmups, ...working];
    });
    if (!day.workoutId) return null;
    const suffix = mode === 'short' ? ' · Short' : lightVersion ? ' · Light' : '';
    const session: WorkoutSession = { id: uid('session'), date, dayId: dayIdForDate(date), workoutId: day.workoutId, title: `${day.title}${suffix}`, startedAt: new Date().toISOString(), durationSeconds: 0, sets };
    const plannedExercises = new Set(selectedExercises.map((exercise) => exercise.exerciseId));
    update((current) => ({ ...current, sessions: [...current.sessions, session], progressionPlans: current.progressionPlans.filter((item) => !plannedExercises.has(item.exerciseId)) }));
    return session.id;
  }, [data.planChanges, data.progressionPlans, data.sessions, data.trainingPlanner.dailyPlans, update]);

  const startWorkoutTemplate = useCallback((templateId: SessionTemplateId, date = toDateKey()) => {
    const template = workoutTemplate(data.program, templateId);
    if (!template) return null;
    return startWorkout(template, date);
  }, [data.program, startWorkout]);

  const startShortWorkoutTemplate = useCallback((templateId: SessionTemplateId, date = toDateKey()) => {
    const template = workoutTemplate(data.program, templateId);
    if (!template) return null;
    return startWorkout(template, date, 'short');
  }, [data.program, startWorkout]);

  const discardWorkout = useCallback((sessionId: string) => update((current) => ({ ...current, sessions: current.sessions.filter((session) => session.id !== sessionId) })), [update]);

  const updateWorkoutSet = useCallback((sessionId: string, setId: string, changes: Partial<Pick<LoggedSet, 'weightKg' | 'reps' | 'completed' | 'rir' | 'skipped'>>) => update((current) => ({
    ...current,
    sessions: current.sessions.map((session) => session.id === sessionId ? { ...session, sets: session.sets.map((set) => set.id === setId ? { ...set, ...changes } : set) } : session),
  })), [update]);

  const updateWorkoutLoad = useCallback((sessionId: string, setId: string, weightKg: number, applyToRemaining = true) => update((current) => ({
    ...current,
    sessions: current.sessions.map((session) => {
      if (session.id !== sessionId) return session;
      const source = session.sets.find((set) => set.id === setId);
      if (!source) return session;
      const warmupPlan = warmupTargets(weightKg, session.sets.filter((set) => set.exerciseId === source.exerciseId && set.isWarmup).length, source.exerciseId);
      return { ...session, sets: session.sets.map((set) => {
        if (set.exerciseId !== source.exerciseId || set.completed || set.skipped) return set;
        if (set.isWarmup) return { ...set, weightKg: warmupPlan[set.setNumber - 1]?.weightKg ?? set.weightKg, reps: warmupPlan[set.setNumber - 1]?.reps ?? set.reps };
        return (set.id === setId || applyToRemaining) ? { ...set, weightKg } : set;
      }) };
    }),
  })), [update]);

  const setExerciseEffort = useCallback((sessionId: string, exerciseId: string, rir?: number) => update((current) => ({
    ...current,
    sessions: current.sessions.map((session) => session.id !== sessionId ? session : { ...session, sets: session.sets.map((set) => set.exerciseId === exerciseId && set.completed && !set.isWarmup ? { ...set, rir } : set) }),
  })), [update]);

  const updateExerciseNote = useCallback((sessionId: string, exerciseId: string, note: string) => update((current) => ({
    ...current,
    sessions: current.sessions.map((session) => session.id !== sessionId ? session : { ...session, exerciseNotes: { ...session.exerciseNotes, [exerciseId]: note.slice(0, 500) } }),
  })), [update]);

  const setExerciseRestPreference = useCallback((exerciseId: string, seconds: number) => update((current) => ({
    ...current,
    exerciseRestPreferences: { ...current.exerciseRestPreferences, [exerciseId]: Math.max(30, Math.min(600, seconds)) },
  })), [update]);

  const finishWorkout = useCallback((sessionId: string, durationSeconds: number) => update((current) => {
    const completedAt = new Date().toISOString();
    const session = current.sessions.find((item) => item.id === sessionId);
    const next = { ...current, sessions: current.sessions.map((item) => item.id === sessionId ? { ...item, completedAt, durationSeconds } : item) };
    const planned = session ? { ...next, trainingPlanner: recalculateTrainingWeek(next, session.date) } : next;
    return withProductEvent(planned, 'first_workout_completed');
  }), [update]);

  const updateHabit = useCallback((date: string, changes: Partial<Omit<HabitEntry, 'date'>>) => update((current) => {
    const existing = current.habits.find((entry) => entry.date === date);
    const habits = existing ? current.habits.map((entry) => entry.date === date ? { ...entry, ...changes } : entry) : [...current.habits, { date, water: false, walk: false, sleep: false, ...changes }];
    return { ...current, habits };
  }), [update]);

  const totalsForDate = useCallback((date: string) => getNutritionTotals(data, date), [data]);

  return useMemo(() => ({
    data, addFood, updateFood, deleteFood, duplicateFood, toggleFavorite, repeatMeal, addSavedMeal, saveMealFromDiary, deleteSavedMeal, saveFoodToLibrary, copyNutritionDay, finishNutritionDay, setNutritionDayTreatment, updateNutritionSettings,
    setNutritionDayCompleteness, planFood, updatePlannedFood, consumePlannedFood, deletePlannedFood, copyPlannedDay, saveDayTemplate, applyDayTemplate, reserveCalories, deleteCalorieReservation,
    saveWeight, saveBodyMeasurement, updateBodyGoals, saveWeightLossPlan, confirmMeasurementMetric, updateProfile, updateProgramDay, selectTrainingSession, skipTrainingDay, moveTrainingSession, restoreRecommendedWeek, recalculateTrainingPlan, keepCurrentTrainingWeek, addCardio, setWeeklyCardioTarget, setSquatProgression, applyTrainingTemplate, confirmProgression,
    logSteps, saveRecoveryFeedback, startPause, resumePlan, startMaintenancePhase, completeWeeklyCheckIn, respondRecommendation, setRecommendationFeedback, completeOnboarding,
    startWorkout, startWorkoutTemplate, startShortWorkoutTemplate, discardWorkout, updateWorkoutSet, updateWorkoutLoad, setExerciseEffort, updateExerciseNote, setExerciseRestPreference, finishWorkout, updateHabit, totalsForDate,
    syncStatus, syncMessage, lastSuccessfulSync, account, migrationPreview, migrationBackupAvailable,
    migrateLocalData, keepLocalOnly, retrySync, exportBackup, previewBackup, importBackup, removeLocalMigrationBackup,
  }), [data, addFood, updateFood, deleteFood, duplicateFood, toggleFavorite, repeatMeal, addSavedMeal, saveMealFromDiary, deleteSavedMeal, saveFoodToLibrary, copyNutritionDay, finishNutritionDay, setNutritionDayTreatment, updateNutritionSettings, setNutritionDayCompleteness, planFood, updatePlannedFood, consumePlannedFood, deletePlannedFood, copyPlannedDay, saveDayTemplate, applyDayTemplate, reserveCalories, deleteCalorieReservation, saveWeight, saveBodyMeasurement, updateBodyGoals, saveWeightLossPlan, confirmMeasurementMetric, updateProfile, logSteps, saveRecoveryFeedback, startPause, resumePlan, startMaintenancePhase, completeWeeklyCheckIn, respondRecommendation, setRecommendationFeedback, completeOnboarding, updateProgramDay, selectTrainingSession, skipTrainingDay, moveTrainingSession, restoreRecommendedWeek, recalculateTrainingPlan, keepCurrentTrainingWeek, addCardio, setWeeklyCardioTarget, setSquatProgression, applyTrainingTemplate, confirmProgression, startWorkout, startWorkoutTemplate, startShortWorkoutTemplate, discardWorkout, updateWorkoutSet, updateWorkoutLoad, setExerciseEffort, updateExerciseNote, setExerciseRestPreference, finishWorkout, updateHabit, totalsForDate, syncStatus, syncMessage, lastSuccessfulSync, account, migrationPreview, migrationBackupAvailable, migrateLocalData, keepLocalOnly, retrySync, exportBackup, previewBackup, importBackup, removeLocalMigrationBackup]);
}

export type AppController = ReturnType<typeof useAppData>;
