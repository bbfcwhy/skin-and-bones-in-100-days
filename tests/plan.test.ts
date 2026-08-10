import { describe, expect, it } from "vitest";
import {
  getChallengeProgress,
  getChecklistForDate,
  getPlanForDate,
} from "../src/lib/plan";

describe("100 天計畫", () => {
  it("依運動類型切換熱量與熟重澱粉", () => {
    expect(getPlanForDate("2026-08-10")).toMatchObject({
      dayType: "run",
      targetCalories: 2050,
      firstStarch: "200 到 250 g",
      dinnerStarch: "150 到 200 g",
    });
    expect(getPlanForDate("2026-08-11")).toMatchObject({
      dayType: "recovery",
      targetCalories: 1850,
      firstStarch: "100 到 150 g",
      dinnerStarch: "80 到 120 g",
    });
    expect(getPlanForDate("2026-08-15")).toMatchObject({
      dayType: "strength",
      targetCalories: 1950,
      firstStarch: "150 到 200 g",
      dinnerStarch: "120 到 150 g",
    });
  });

  it("正確處理第 1 天、第 100 天與結束後", () => {
    expect(getChallengeProgress("2026-08-10")).toMatchObject({ day: 1, status: "active" });
    expect(getChallengeProgress("2026-11-17")).toMatchObject({ day: 100, status: "active" });
    expect(getChallengeProgress("2026-11-18")).toMatchObject({ day: 100, status: "complete" });
  });

  it("每日清單保留 3 杯水與營養目標", () => {
    const tasks = getChecklistForDate("2026-08-10");
    expect(tasks.filter((task) => task.id.startsWith("water-cup"))).toHaveLength(3);
    expect(tasks.map((task) => task.id)).toEqual(expect.arrayContaining([
      "protein-total",
      "calorie-target",
      "daily-steps",
      "sleep-total",
    ]));
  });

  it("套用未來熱量調整後，當日清單同步顯示有效目標", () => {
    const tasks = getChecklistForDate("2026-08-11", -100);
    expect(tasks.find((task) => task.id === "calorie-target")?.label).toBe("全天熱量 1,750 kcal");
  });
});
