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
      weightKg: null,
    });

    const summary = buildConsultationSummary({ dateKey, plan, record, impact });
    expect(summary).toContain("當日目標：2,050 kcal");
    expect(summary).toContain("額外布丁：熱量待估");
    expect(summary).toContain("額外 HIIT：30 分鐘");
    expect(summary).toContain("高強度");
    expect(summary).toContain("不會把運動熱量 1 比 1 抵消飲食");
  });

  it("新版運動記錄沒有強度欄位時，摘要不標示強度", () => {
    const dateKey = "2026-08-18";
    const plan = getPlanForDate(dateKey);
    const { record } = ensureDailyRecord(createInitialState(), dateKey);
    record.additionalExercises.push({
      id: "exercise-2",
      name: "跑步",
      category: "run",
      minutes: 40,
      distance: 6,
      activeCalories: 320,
      note: "",
      createdAt: "2026-08-18T18:00:00.000Z",
    });
    const impact = analyzeImpact({
      plan,
      baseCalories: null,
      additionalFoods: [],
      additionalExercises: record.additionalExercises,
      previousWeekDeviation: 0,
      futurePlans: [],
      weightKg: null,
    });

    const summary = buildConsultationSummary({ dateKey, plan, record, impact });
    expect(summary).toContain("跑步：40 分鐘，6 km");
    expect(summary).not.toContain("強度");
  });

  it("有正餐逐筆記錄時，摘要列出分餐明細與加總，空的餐別不佔版面", () => {
    const dateKey = "2026-08-10";
    const plan = getPlanForDate(dateKey);
    const { record } = ensureDailyRecord(createInitialState(), dateKey);
    record.baseCalories = 1800;
    record.meals = [
      { id: "meal-1", slot: "first", name: "雞胸肉", grams: 150, calories: 248, protein: 46.5, note: "", createdAt: "2026-08-10T12:00:00.000+08:00" },
      { id: "meal-2", slot: "first", name: "白飯", grams: 200, calories: 366, protein: 7.4, note: "", createdAt: "2026-08-10T12:05:00.000+08:00" },
      { id: "meal-3", slot: "dinner", name: "雞腿便當", grams: null, calories: 850, protein: null, note: "外食", createdAt: "2026-08-10T19:00:00.000+08:00" },
    ];
    const impact = analyzeImpact({
      plan,
      baseCalories: 1464,
      additionalFoods: [],
      additionalExercises: [],
      previousWeekDeviation: 0,
      futurePlans: [],
      weightKg: null,
    });

    const summary = buildConsultationSummary({ dateKey, plan, record, impact });
    expect(summary).toContain("正常餐點熱量：1,464 kcal");
    expect(summary).toContain("第一餐");
    expect(summary).toContain("雞胸肉 150 g：248 kcal，蛋白質 46.5 g");
    expect(summary).toContain("雞腿便當：850 kcal");
    expect(summary).not.toContain("蛋白質補位");
    expect(summary).toContain("全天蛋白質：53.9 g");
  });

  it("沒有正餐逐筆記錄時，摘要不塞空的正餐段落", () => {
    const dateKey = "2026-08-10";
    const plan = getPlanForDate(dateKey);
    const { record } = ensureDailyRecord(createInitialState(), dateKey);
    record.baseCalories = 1800;
    const impact = analyzeImpact({
      plan,
      baseCalories: 1800,
      additionalFoods: [],
      additionalExercises: [],
      previousWeekDeviation: 0,
      futurePlans: [],
      weightKg: null,
    });

    const summary = buildConsultationSummary({ dateKey, plan, record, impact });
    expect(summary).toContain("正常餐點熱量：1,800 kcal");
    expect(summary).not.toContain("正餐逐筆記錄");
  });
});
