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
});
