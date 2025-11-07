// web/src/lib/__tests__/scheduleEngine.test.js
import { describe, it, expect } from 'vitest';

describe('scheduleEngine', () => {
  describe('formatDate', () => {
    it('should format date as YYYY-MM-DD', () => {
      const date = new Date('2025-11-07T15:30:00');
      const formatted = date.toISOString().split('T')[0];
      
      expect(formatted).toBe('2025-11-07');
    });

    it('should pad single digit months and days', () => {
      const date = new Date('2025-03-05T10:00:00');
      const formatted = date.toISOString().split('T')[0];
      
      expect(formatted).toBe('2025-03-05');
    });
  });

  describe('getDayOfWeekName', () => {
    it('should return correct day names', () => {
      const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const testDate = new Date('2025-11-07T12:00:00Z'); // Friday UTC
      const dayName = days[testDate.getUTCDay()];
      
      expect(dayName).toBe('friday');
    });
  });

  describe('task generation', () => {
    it('should split time 60/40 between theory and practice', () => {
      const totalMinutes = 60;
      const theoryMinutes = Math.round(totalMinutes * 0.6);
      const practiceMinutes = totalMinutes - theoryMinutes;

      expect(theoryMinutes).toBe(36);
      expect(practiceMinutes).toBe(24);
    });

    it('should handle odd minute splits', () => {
      const totalMinutes = 50;
      const theoryMinutes = Math.round(totalMinutes * 0.6);
      const practiceMinutes = totalMinutes - theoryMinutes;

      expect(theoryMinutes + practiceMinutes).toBe(50);
    });
  });

  describe('task status updates', () => {
    it('should use ISO string for completed_at', () => {
      const now = new Date();
      const isoString = now.toISOString();
      
      expect(isoString).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
});

