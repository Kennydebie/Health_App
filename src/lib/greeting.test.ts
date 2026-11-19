import { describe, expect, it } from 'vitest';
import { greetingForHour } from './greeting';

describe('greetingForHour', () => {
  it.each([
    [0, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [17, 'Good afternoon'],
    [18, 'Good evening'],
    [23, 'Good evening'],
  ])('returns the appropriate greeting at %i:00', (hour, expected) => {
    expect(greetingForHour(hour)).toBe(expected);
  });
});
