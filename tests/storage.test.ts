import { describe, expect, it } from "vitest";
import {
  createInitialState,
  ensureDailyRecord,
  parseImportedState,
  serializeState,
} from "../src/lib/storage";

describe("本機資料與備份", () => {
  it("建立不含個人體重的初始狀態", () => {
    const state = createInitialState();
    expect(state.profile.startWeight).toBeNull();
    expect(state.profile.goalWeight).toBeNull();
    expect(state.records).toEqual({});
  });

  it("每日紀錄預設保留 3 杯水與額外項目空陣列", () => {
    const { record } = ensureDailyRecord(createInitialState(), "2026-08-10");
    expect(record.waterCups).toEqual([false, false, false]);
    expect(record.calorieAdjustment).toBe(0);
    expect(record.additionalFoods).toEqual([]);
    expect(record.additionalExercises).toEqual([]);
  });

  it("匯出後能完整還原", () => {
    const initial = createInitialState();
    const { state, record } = ensureDailyRecord(initial, "2026-08-10");
    record.weight = 74.3;
    record.checks["morning-weight"] = true;
    const restored = parseImportedState(serializeState(state));
    expect(restored).toEqual(state);
  });

  it("可匯入舊版 localStorage 匯出，並把拿鐵轉成額外飲食", () => {
    const legacy = JSON.stringify({
      exportVersion: "daily-checklist-export-v1",
      checklistState: {
        "2026-08-10": {
          "morning-weight": true,
          "water-cup-1": true,
          "optional-latte": true,
        },
      },
      recordState: {
        "2026-08-10": {
          "morning-weight": { weight: "74.3" },
          "calorie-target": { calories: "2050" },
          "protein-total": { protein: "145" },
        },
      },
    });

    const state = parseImportedState(legacy);
    const record = state.records["2026-08-10"];
    expect(record.weight).toBe(74.3);
    expect(record.baseCalories).toBe(2050);
    expect(record.protein).toBe(145);
    expect(record.waterCups[0]).toBe(true);
    expect(record.additionalFoods[0]).toMatchObject({ name: "下午拿鐵", calories: 150, protein: 7 });
  });

  it("拒絕無法辨識的備份", () => {
    expect(() => parseImportedState('{"hello":"world"}')).toThrow("無法辨識");
  });

  it("載入沒有 trackWaist 的舊備份時，一筆資料都不會少", () => {
    const oldBackup = JSON.stringify({
      version: 1,
      profile: {
        challengeStart: "2026-08-10",
        startWeight: 78.5,
        goalWeight: 70,
        fastingStart: "20:00",
        cupSizeMl: 700,
      },
      records: {
        "2026-08-10": {
          dateKey: "2026-08-10",
          checks: { "morning-weight": true, "weekly-waist": true },
          weight: 78.2,
          waist: 92.5,
          sleepHours: 7.5,
          steps: 9200,
          baseCalories: 2050,
          calorieAdjustment: 0,
          protein: 145,
          waterCups: [true, true, false],
          exerciseResults: { "fuji-run": { load: "", result: "8 km 完成" } },
          additionalFoods: [
            { id: "food-1", name: "布丁", calories: 150, protein: 3, note: "手掌大", createdAt: "2026-08-10T15:00:00.000Z" },
          ],
          additionalExercises: [
            {
              id: "exercise-1",
              name: "晚上散步",
              category: "walk",
              minutes: 25,
              distance: 2.1,
              intensity: "low",
              area: "lower",
              activeCalories: 90,
              note: "飯後",
              createdAt: "2026-08-10T20:00:00.000Z",
            },
          ],
          note: "第一天",
        },
        "2026-08-11": {
          dateKey: "2026-08-11",
          checks: {},
          weight: 77.9,
          waist: null,
          sleepHours: null,
          steps: null,
          baseCalories: null,
          calorieAdjustment: -100,
          protein: null,
          waterCups: [true, false, false],
          exerciseResults: {},
          additionalFoods: [],
          additionalExercises: [],
          note: "",
        },
      },
    });

    const state = parseImportedState(oldBackup);

    expect(state.profile.trackWaist).toBe(false);
    expect(state.profile.startWeight).toBe(78.5);
    expect(state.profile.goalWeight).toBe(70);
    expect(state.profile.cupSizeMl).toBe(700);
    expect(state.profile.fastingStart).toBe("20:00");
    expect(Object.keys(state.records)).toHaveLength(2);

    const first = state.records["2026-08-10"];
    expect(first.weight).toBe(78.2);
    expect(first.waist).toBe(92.5);
    expect(first.sleepHours).toBe(7.5);
    expect(first.steps).toBe(9200);
    expect(first.baseCalories).toBe(2050);
    expect(first.protein).toBe(145);
    expect(first.note).toBe("第一天");
    expect(first.checks).toEqual({ "morning-weight": true, "weekly-waist": true });
    expect(first.waterCups).toEqual([true, true, false]);
    expect(first.exerciseResults["fuji-run"]).toEqual({ load: "", result: "8 km 完成" });
    expect(first.additionalFoods).toHaveLength(1);
    expect(first.additionalFoods[0]).toMatchObject({ name: "布丁", calories: 150, protein: 3, note: "手掌大" });
    expect(first.additionalExercises).toHaveLength(1);
    expect(first.additionalExercises[0]).toMatchObject({
      name: "晚上散步",
      category: "walk",
      minutes: 25,
      distance: 2.1,
      intensity: "low",
      area: "lower",
      activeCalories: 90,
      note: "飯後",
    });

    const second = state.records["2026-08-11"];
    expect(second.weight).toBe(77.9);
    expect(second.calorieAdjustment).toBe(-100);
    expect(second.waterCups).toEqual([true, false, false]);
  });

  it("舊紀錄缺少後來才加的欄位時補預設值，不丟掉已填的資料", () => {
    const partialBackup = JSON.stringify({
      version: 1,
      profile: { challengeStart: "2026-08-10", startWeight: 78.5, goalWeight: 70, fastingStart: "20:00", cupSizeMl: 700 },
      records: {
        "2026-08-10": {
          dateKey: "2026-08-10",
          checks: { "morning-weight": true },
          weight: 78.2,
          note: "只有早上量了體重",
        },
      },
    });

    const state = parseImportedState(partialBackup);
    const record = state.records["2026-08-10"];

    expect(record.weight).toBe(78.2);
    expect(record.note).toBe("只有早上量了體重");
    expect(record.checks).toEqual({ "morning-weight": true });
    expect(record.waterCups).toEqual([false, false, false]);
    expect(record.exerciseResults).toEqual({});
    expect(record.additionalFoods).toEqual([]);
    expect(record.additionalExercises).toEqual([]);
    expect(record.calorieAdjustment).toBe(0);
    expect(record.waist).toBeNull();
  });

  it("新的初始狀態預設不追蹤腰圍", () => {
    expect(createInitialState().profile.trackWaist).toBe(false);
  });
});
