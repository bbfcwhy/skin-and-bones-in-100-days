import { describe, expect, it } from "vitest";
import { analyzeImpact, calculateWeekDeviation } from "../src/lib/impact";
import { addDays, getPlanForDate } from "../src/lib/plan";
import type { AdditionalExercise, AdditionalFood } from "../src/lib/types";
import { createInitialState, ensureDailyRecord } from "../src/lib/storage";

const food = (calories: number | null): AdditionalFood => ({
  id: "food-1",
  name: "臨時點心",
  calories,
  protein: null,
  note: "",
  createdAt: "2026-08-10T12:00:00.000Z",
});

const exercise = (overrides: Partial<AdditionalExercise> = {}): AdditionalExercise => ({
  id: "exercise-1",
  name: "額外 HIIT",
  category: "hiit",
  minutes: 30,
  distance: null,
  intensity: "high",
  area: "full",
  activeCalories: 500,
  note: "",
  createdAt: "2026-08-10T12:00:00.000Z",
  ...overrides,
});

describe("額外飲食與運動影響", () => {
  it("少量額外飲食只記錄，不急著改後面計畫", () => {
    const result = analyzeImpact({
      plan: getPlanForDate("2026-08-10"),
      baseCalories: null,
      additionalFoods: [food(120)],
      additionalExercises: [],
      previousWeekDeviation: 0,
      futurePlans: [getPlanForDate("2026-08-11")],
    });

    expect(result.status).toBe("steady");
    expect(result.intakeDeviation).toBe(120);
    expect(result.usedTargetAsBase).toBe(true);
    expect(result.proposedAdjustments).toEqual([]);
  });

  it("有未知熱量時先標記待估算，不給假精準調整", () => {
    const result = analyzeImpact({
      plan: getPlanForDate("2026-08-10"),
      baseCalories: 2050,
      additionalFoods: [food(null)],
      additionalExercises: [],
      previousWeekDeviation: 0,
      futurePlans: [],
    });

    expect(result.status).toBe("needs-estimate");
    expect(result.hasUnknownFood).toBe(true);
    expect(result.proposedAdjustments).toEqual([]);
  });

  it("累積偏高時只提案分散到恢復與肌力日，不動跑步日", () => {
    const dateKey = "2026-08-13";
    const futurePlans = Array.from({ length: 5 }, (_, index) => getPlanForDate(addDays(dateKey, index + 1)));
    const result = analyzeImpact({
      plan: getPlanForDate(dateKey),
      baseCalories: 2050,
      additionalFoods: [food(500)],
      additionalExercises: [],
      previousWeekDeviation: 100,
      futurePlans,
    });

    expect(result.status).toBe("adjust");
    expect(result.proposedAdjustments.length).toBeGreaterThan(0);
    expect(result.proposedAdjustments.every((item) => item.caloriesDelta >= -150)).toBe(true);
    expect(result.proposedAdjustments.every((item) => getPlanForDate(item.dateKey).dayType !== "run")).toBe(true);
    expect(result.unallocatedCalories).toBeGreaterThanOrEqual(0);
  });

  it("額外運動熱量不會 1 比 1 抵消飲食，高負荷另外給恢復提醒", () => {
    const result = analyzeImpact({
      plan: getPlanForDate("2026-08-10"),
      baseCalories: 2050,
      additionalFoods: [food(400)],
      additionalExercises: [exercise()],
      previousWeekDeviation: 0,
      futurePlans: [getPlanForDate("2026-08-11")],
    });

    expect(result.intakeDeviation).toBe(400);
    expect(result.reportedExerciseCalories).toBe(500);
    expect(result.recoveryWarning).toContain("24 到 48 小時");
  });

  it("本週偏差只計算有記錄的日子，並包含已套用的熱量調整", () => {
    const first = ensureDailyRecord(createInitialState(), "2026-08-10");
    first.record.baseCalories = 2050;
    first.record.additionalFoods = [food(120)];
    const second = ensureDailyRecord(first.state, "2026-08-11");
    second.record.baseCalories = 1750;
    second.record.calorieAdjustment = -100;

    const result = calculateWeekDeviation(second.state.records, "2026-08-12");
    expect(result.deviation).toBe(120);
    expect(result.hasUnknownFood).toBe(false);
  });
});
