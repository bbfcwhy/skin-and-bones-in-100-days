import { describe, expect, it } from "vitest";
import { analyzeImpact } from "../src/lib/impact";
import { getPlanForDate } from "../src/lib/plan";
import { buildConsultationSummary } from "../src/lib/summary";
import { createInitialState, ensureDailyRecord } from "../src/lib/storage";

describe("複製回 session 詢問的摘要", () => {
  it("包含當日目標、未知飲食、額外運動與當前建議", () => {
    const dateKey = "2026-08-10";
    const plan = getPlanForDate(dateKey);
    const { record } = ensureDailyRecord(createInitialState(), dateKey);
    record.additionalFoods.push({
      id: "food-1",
      name: "額外布丁",
      calories: null,
      protein: null,
      note: "手掌大小",
      createdAt: "2026-08-10T12:00:00.000Z",
    });
    record.additionalExercises.push({
      id: "exercise-1",
      name: "額外 HIIT",
      category: "hiit",
      minutes: 30,
      distance: null,
      intensity: "high",
      area: "full",
      activeCalories: null,
      note: "",
      createdAt: "2026-08-10T12:00:00.000Z",
    });
    const impact = analyzeImpact({
      plan,
      baseCalories: record.baseCalories,
      additionalFoods: record.additionalFoods,
      additionalExercises: record.additionalExercises,
      previousWeekDeviation: 0,
      futurePlans: [],
    });

    const summary = buildConsultationSummary({ dateKey, plan, record, impact });
    expect(summary).toContain("當日目標：2,050 kcal");
    expect(summary).toContain("額外布丁：熱量待估");
    expect(summary).toContain("額外 HIIT：30 分鐘");
    expect(summary).toContain("不會把運動熱量 1 比 1 抵消飲食");
  });
});
