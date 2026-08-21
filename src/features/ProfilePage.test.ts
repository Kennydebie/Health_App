import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { isProfileDirty } from '../lib/profile';

describe('profile dirty state', () => {
  it('only reports changes that differ from the last saved profile', () => {
    const profile = createSeedData().profile;
    expect(isProfileDirty(structuredClone(profile), profile)).toBe(false);
    expect(isProfileDirty({ ...profile, calorieTarget: profile.calorieTarget + 50 }, profile)).toBe(true);
  });

  it('returns to clean after the changed draft is saved', () => {
    const profile = createSeedData().profile;
    const draft = { ...profile, name: 'Updated name' };
    expect(isProfileDirty(draft, draft)).toBe(false);
  });
});
