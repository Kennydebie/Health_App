import { withDetectedOutliers } from './bodyMeasurements';
import { emptyMeasurementValues } from './appDataMigration';
import type { AppData, BodyMeasurement, BodyMeasurementDraft } from '../types/models';

export interface SaveMeasurementOptions {
  id: string;
  now: string;
  replaceId?: string;
}

/** Applies a reviewed body measurement as one state transaction. */
export function applyBodyMeasurement(data: AppData, draft: BodyMeasurementDraft, options: SaveMeasurementOptions): AppData {
  const id = options.replaceId ?? options.id;
  const measurement: BodyMeasurement = { ...emptyMeasurementValues, ...draft, id, createdAt: options.now };
  const genuine = data.measurements.filter((item) => !item.isDemo);
  const measurements = options.replaceId
    ? genuine.map((item) => item.id === options.replaceId ? measurement : item)
    : [...genuine, measurement];
  return {
    ...data,
    measurements: withDetectedOutliers(measurements),
    bodyGoals: {
      ...data.bodyGoals,
      fatFreeMassTargetKg: data.bodyGoals.fatFreeMassTargetKg ?? draft.fatFreeMassKg,
      muscleMassTargetKg: data.bodyGoals.muscleMassTargetKg ?? draft.muscleMassKg,
    },
  };
}
