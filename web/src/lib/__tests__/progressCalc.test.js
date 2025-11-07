// web/src/lib/__tests__/progressCalc.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateProgress } from '../progressCalc';

// Mock dependencies
vi.mock('../scheduleEngine', () => ({
  getSchedule: vi.fn(),
}));

vi.mock('../activityLog', () => ({
  getTotalMinutesForDate: vi.fn(),
  getTotalMinutesAllTime: vi.fn(),
}));

import { getSchedule } from '../scheduleEngine';
import { getTotalMinutesForDate, getTotalMinutesAllTime } from '../activityLog';

describe('progressCalc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should calculate progress correctly with all tasks done', async () => {
    // Mock schedule with 4 tasks, all done
    getSchedule.mockResolvedValue({
      date: '2025-11-07',
      tasks: [
        { id: 't1', status: 'done', duration: 30 },
        { id: 't2', status: 'done', duration: 20 },
        { id: 't3', status: 'done', duration: 25 },
        { id: 't4', status: 'done', duration: 25 },
      ],
      total_minutes: 100,
    });

    getTotalMinutesForDate.mockResolvedValue(100);
    getTotalMinutesAllTime.mockResolvedValue(500);

    const result = await calculateProgress('test-uid');

    expect(result.today.total_tasks).toBe(4);
    expect(result.today.done).toBe(4);
    expect(result.today.completion_percentage).toBe(100);
    expect(result.today.minutes_studied).toBe(100);
    expect(result.all_time.minutes_studied).toBe(500);
  });

  it('should calculate progress correctly with mixed statuses', async () => {
    getSchedule.mockResolvedValue({
      date: '2025-11-07',
      tasks: [
        { id: 't1', status: 'done', duration: 30 },
        { id: 't2', status: 'failed', duration: 20 },
        { id: 't3', status: 'pending', duration: 25 },
        { id: 't4', status: 'skipped', duration: 25 },
      ],
      total_minutes: 100,
    });

    getTotalMinutesForDate.mockResolvedValue(30);
    getTotalMinutesAllTime.mockResolvedValue(150);

    const result = await calculateProgress('test-uid');

    expect(result.today.total_tasks).toBe(4);
    expect(result.today.done).toBe(1);
    expect(result.today.failed).toBe(1);
    expect(result.today.skipped).toBe(1);
    expect(result.today.pending).toBe(1);
    expect(result.today.completion_percentage).toBe(75); // 3 of 4 completed
  });

  it('should handle empty schedule', async () => {
    getSchedule.mockResolvedValue({
      date: '2025-11-07',
      tasks: [],
      total_minutes: 0,
    });

    getTotalMinutesForDate.mockResolvedValue(0);
    getTotalMinutesAllTime.mockResolvedValue(0);

    const result = await calculateProgress('test-uid');

    expect(result.today.total_tasks).toBe(0);
    expect(result.today.completion_percentage).toBe(0);
  });

  it('should handle errors gracefully', async () => {
    getSchedule.mockRejectedValue(new Error('Network error'));

    const result = await calculateProgress('test-uid');

    expect(result.today.total_tasks).toBe(0);
    expect(result.today.completion_percentage).toBe(0);
  });
});

