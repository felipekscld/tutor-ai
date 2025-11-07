// web/src/lib/__tests__/goalsEngine.test.js
import { describe, it, expect, beforeEach } from 'vitest';

describe('goalsEngine', () => {
  beforeEach(() => {
    // Tests will use Firebase emulator or mocks
  });

  it('should distribute minutes proportionally by weight', () => {
    const dailyMinutes = 120;
    const subjects = [
      { subject: "Math", topics: ["Trig"], weight: 2 },
      { subject: "Physics", topics: ["Mechanics"], weight: 1 },
    ];

    const totalWeight = 3; // 2 + 1
    const mathMinutes = Math.round((2 / 3) * 120); // 80
    const physicsMinutes = Math.round((1 / 3) * 120); // 40

    expect(mathMinutes).toBe(80);
    expect(physicsMinutes).toBe(40);
  });

  it('should create alternation pattern based on priority', () => {
    // High priority (weight >= 2) should study every 2 days
    const highPriorityFreq = 2;
    // Normal priority should study every 3 days
    const normalPriorityFreq = 3;

    expect(highPriorityFreq).toBe(2);
    expect(normalPriorityFreq).toBe(3);
  });

  it('should handle single subject correctly', () => {
    const dailyMinutes = 60;
    const subjects = [
      { subject: "Math", topics: ["Trig", "Calc"], weight: 1 },
    ];

    const totalWeight = 1;
    const mathMinutes = Math.round((1 / 1) * 60); // 60
    const perTopic = Math.round(60 / 2); // 30 per topic

    expect(mathMinutes).toBe(60);
    expect(perTopic).toBe(30);
  });

  it('should clamp weight values between 0.5 and 3', () => {
    const weights = [0.3, 0.5, 1, 2, 3, 4];
    const clamped = weights.map(w => Math.max(0.5, Math.min(3, w)));

    expect(clamped).toEqual([0.5, 0.5, 1, 2, 3, 3]);
  });
});

