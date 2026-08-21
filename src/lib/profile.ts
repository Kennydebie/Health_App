import type { UserProfile } from '../types/models';

export function isProfileDirty(draft: UserProfile, saved: UserProfile): boolean {
  return JSON.stringify(draft) !== JSON.stringify(saved);
}
