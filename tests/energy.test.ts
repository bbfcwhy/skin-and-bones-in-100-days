import { describe, expect, it } from "vitest";
import {
  compareToTarget,
  categoryForPlannedExercise,
  estimateExerciseCalories,
  resolveWeightKg,
} from "../src/lib/energy";
import { getPlanForDate } from "../src/lib/plan";
import { createInitialState, ensureDailyRecord } from "../src/lib/storage";

describe("運動消耗估算", () => {
  it("沒有體重就不假裝算得出來", () => {
    expect(estimateExerciseCalories({ category: "run", minutes: 40, km: 6, weightKg: null })).toBeNull();
  });

  it("散步 30 分鐘用 MET 3.5 估算", () => {
    expect(estimateExerciseCalories({ category: "walk", minutes: 30, km: null, weightKg: 74 })).toBe(136);
  });

  it("HIIT 30 分鐘用 MET 8 估算", () => {
    expect(estimateExerciseCalories({ category: "hiit", minutes: 30, km: null, weightKg: 74 })).toBe(311);
  });

  it("跑步同時有時間與距離時，用配速選 MET 檔位", () => {
    const slow = estimateExerciseCalories({ category: "run", minutes: 60, km: 8, weightKg: 74 });
    const medium = estimateExerciseCalories({ category: "run", minutes: 60, km: 10, weightKg: 74 });
    const fast = estimateExerciseCalories({ category: "run", minutes: 60, km: 13, weightKg: 74 });

    expect(slow).toBe(645);
    expect(medium).toBe(761);
    expect(fast).toBe(956);
  });

  it("只有距離時，跑步與走路各有換算，其他類別回 null", () => {
    expect(estimateExerciseCalories({ category: "run", minutes: null, km: 12, weightKg: 70 })).toBe(870);
    expect(estimateExerciseCalories({ category: "walk", minutes: null, km: 5, weightKg: 70 })).toBe(175);
    expect(estimateExerciseCalories({ category: "strength", minutes: null, km: 5, weightKg: 70 })).toBeNull();
  });

  it("時間與距離都沒有就回 null", () => {
    expect(estimateExerciseCalories({ category: "run", minutes: null, km: null, weightKg: 70 })).toBeNull();
  });
});

describe("體重取值順序", () => {
  const stateWith = (entries: Array<[string, number]>) => {
    let state = createInitialState();
    entries.forEach(([dateKey, weight]) => {
      const ensured = ensureDailyRecord(state, dateKey);
      ensured.record.weight = weight;
      state = ensured.state;
    });
    return state;
  };

  it("優先用當天體重", () => {
    const state = stateWith([["2026-08-10", 78.2], ["2026-08-12", 77.6]]);
    expect(resolveWeightKg(state.records, "2026-08-12", state.profile)).toBe(77.6);
  });

  it("當天沒有就往前找 14 天內最近一次", () => {
    const state = stateWith([["2026-08-10", 78.2], ["2026-08-09", 79]]);
    expect(resolveWeightKg(state.records, "2026-08-13", state.profile)).toBe(78.2);
  });

  it("14 天內都沒有就退回起始體重", () => {
    const state = stateWith([["2026-07-01", 80]]);
    state.profile.startWeight = 79.4;
    expect(resolveWeightKg(state.records, "2026-08-13", state.profile)).toBe(79.4);
  });

  it("完全沒有資料回 null", () => {
    const state = createInitialState();
    expect(resolveWeightKg(state.records, "2026-08-13", state.profile)).toBeNull();
  });
});

describe("實際量與目標的比較", () => {
  it("超過定值目標標成加號", () => {
    expect(compareToTarget(10, [8, 8])).toMatchObject({ status: "over", delta: 2, label: "+2" });
  });

  it("落在區間內就算達標，不標超額", () => {
    expect(compareToTarget(6, [5, 7])).toMatchObject({ status: "met", delta: 0, label: "達標" });
    expect(compareToTarget(7, [5, 7])).toMatchObject({ status: "met", label: "達標" });
  });

  it("低於區間下限標成負數", () => {
    expect(compareToTarget(4, [5, 7])).toMatchObject({ status: "under", delta: -1, label: "-1" });
  });

  it("還沒填就沒有標記", () => {
    expect(compareToTarget(null, [8, 8])).toMatchObject({ status: "unset", label: "" });
    expect(compareToTarget(undefined, [8, 8])).toMatchObject({ status: "unset", label: "" });
  });

  it("小數差額只留一位，不出現浮點雜訊", () => {
    expect(compareToTarget(10, [6.1, 6.1]).label).toBe("+3.9");
  });
});

describe("計畫內運動的估算類別", () => {
  it("有距離目標的當跑步，恢復日當瑜伽，肌力日當肌力", () => {
    const runPlan = getPlanForDate("2026-08-10");
    const recoveryPlan = getPlanForDate("2026-08-11");
    const strengthPlan = getPlanForDate("2026-08-15");

    expect(categoryForPlannedExercise(runPlan.exercises[0], runPlan.dayType)).toBe("run");
    expect(categoryForPlannedExercise(recoveryPlan.exercises[0], recoveryPlan.dayType)).toBe("yoga");
    expect(categoryForPlannedExercise(strengthPlan.exercises[0], strengthPlan.dayType)).toBe("strength");
  });
});

describe("富士山累積跑多跑 2 km 的場景", () => {
  it("計畫是 8 km，實際跑 10 km 65 分鐘，標成 +2 並估得出消耗", () => {
    const plan = getPlanForDate("2026-08-10");
    const fujiRun = plan.exercises.find((exercise) => exercise.id === "fuji-run");

    expect(fujiRun?.target?.km).toEqual([8, 8]);

    const comparison = compareToTarget(10, fujiRun!.target!.km!);
    expect(comparison.status).toBe("over");
    expect(comparison.label).toBe("+2");

    const calories = estimateExerciseCalories({
      category: categoryForPlannedExercise(fujiRun!, plan.dayType),
      minutes: 65,
      km: 10,
      weightKg: 74,
    });
    expect(calories).toBe(825);
  });
});
