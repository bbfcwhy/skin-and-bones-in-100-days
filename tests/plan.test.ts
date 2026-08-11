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

  it("預設不追蹤腰圍時，週日清單沒有量腰圍，但保留 7 天平均體重檢查", () => {
    const ids = getChecklistForDate("2026-08-16").map((task) => task.id);
    expect(ids).not.toContain("weekly-waist");
    expect(ids).toContain("weekly-trend-review");
  });

  it("打開腰圍追蹤後，週日清單才出現量腰圍", () => {
    const ids = getChecklistForDate("2026-08-16", 0, { trackWaist: true }).map((task) => task.id);
    expect(ids).toContain("weekly-waist");
    expect(ids).toContain("weekly-trend-review");
  });

  it("平日不論開關都不會出現量腰圍", () => {
    expect(getChecklistForDate("2026-08-10", 0, { trackWaist: true }).map((task) => task.id)).not.toContain("weekly-waist");
    expect(getChecklistForDate("2026-08-10").map((task) => task.id)).not.toContain("weekly-waist");
  });

  it("有氧項目帶著可計算的目標，肌力動作沒有", () => {
    const fujiRun = getPlanForDate("2026-08-10").exercises.find((exercise) => exercise.id === "fuji-run");
    expect(fujiRun?.target).toEqual({ km: [8, 8] });
    expect(getPlanForDate("2026-08-12").exercises[0].target).toEqual({ km: [7, 7] });
    expect(getPlanForDate("2026-08-13").exercises[0].target).toEqual({ km: [6.1, 6.1] });

    expect(getPlanForDate("2026-08-11").exercises[0].target).toEqual({ minutes: [30, 30] });
    expect(getPlanForDate("2026-08-18").exercises[0].target).toEqual({ km: [5, 7] });
    expect(getPlanForDate("2026-08-20").exercises[0].target).toEqual({ minutes: [30, 30] });
    expect(getPlanForDate("2026-08-22").exercises[0].target).toEqual({ km: [7, 10] });
    expect(getPlanForDate("2026-08-23").exercises[0].target).toEqual({ minutes: [30, 30] });

    getPlanForDate("2026-08-15").exercises.forEach((exercise) => {
      expect(exercise.target).toBeUndefined();
    });
  });
});
