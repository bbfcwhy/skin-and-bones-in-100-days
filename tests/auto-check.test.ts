import { describe, expect, it } from "vitest";
import {
  CALORIE_TOLERANCE,
  DAILY_PROTEIN_MINIMUM,
  MINIMUM_SLEEP_HOURS,
  MINIMUM_STEPS,
  autoCheckStatus,
  countCompletedTasks,
  isChecklistTaskDone,
} from "../src/lib/auto-check";
import { PROTEIN_TARGET_BY_SLOT } from "../src/lib/meals";
import { getChecklistForDate, getPlanForDate } from "../src/lib/plan";
import { createInitialState, ensureDailyRecord } from "../src/lib/storage";
import type { DailyRecord, MealEntry } from "../src/lib/types";

const DATE = "2026-08-11";
const plan = getPlanForDate(DATE);

const meal = (overrides: Partial<MealEntry> = {}): MealEntry => ({
  id: "meal-1",
  slot: "first",
  name: "雞胸肉",
  grams: 150,
  calories: 248,
  protein: 46.5,
  note: "",
  createdAt: "2026-08-11T12:00:00.000+08:00",
  ...overrides,
});

const recordWith = (overrides: Partial<DailyRecord> = {}): DailyRecord => ({
  ...ensureDailyRecord(createInitialState(), DATE).record,
  ...overrides,
});

/** 只有 auto 分支才有 done／current，測試裡反覆取，包一層省得每條都寫 narrowing。 */
function expectAuto(taskId: string, record: DailyRecord) {
  const status = autoCheckStatus(taskId, record, plan);
  if (!status.auto) throw new Error(`${taskId} 應該要自動判定，實際是手動`);
  return status;
}

describe("分餐蛋白質自動判定", () => {
  it("沒有明細蛋白質時退回手動勾選", () => {
    expect(autoCheckStatus("first-protein", recordWith(), plan)).toEqual({ auto: false });
    expect(autoCheckStatus("protein-snack", recordWith(), plan)).toEqual({ auto: false });
    expect(autoCheckStatus("dinner-protein", recordWith(), plan)).toEqual({ auto: false });
  });

  it("只填熱量沒填蛋白質的外食，蛋白質項目仍然是手動", () => {
    const record = recordWith({ meals: [meal({ name: "雞腿便當", grams: null, calories: 850, protein: null })] });
    expect(autoCheckStatus("first-protein", record, plan)).toEqual({ auto: false });
  });

  it("記了明細就自動判定：未達下限顯示現值與目標", () => {
    const record = recordWith({ meals: [meal({ protein: 46.5 })] });
    const status = expectAuto("first-protein", record);

    expect(status.done).toBe(false);
    expect(status.current).toBe("46.5 g");
    expect(status.progress).toBe("46.5 / ≥55 g");
  });

  it("達到下限就算完成，上限只是參考不是失敗線", () => {
    const overUpper = recordWith({ meals: [meal({ protein: 80 })] });
    expect(expectAuto("first-protein", overUpper).done).toBe(true);

    const exactLower = recordWith({ meals: [meal({ protein: 55 })] });
    expect(expectAuto("first-protein", exactLower).done).toBe(true);
  });

  it("每一餐只看自己那一餐的明細，不會被別餐的蛋白質灌進來", () => {
    const record = recordWith({
      meals: [
        meal({ id: "m1", slot: "first", protein: 60 }),
        meal({ id: "m2", slot: "dinner", protein: 12 }),
      ],
    });

    expect(expectAuto("first-protein", record).done).toBe(true);
    expect(expectAuto("dinner-protein", record).done).toBe(false);
    expect(expectAuto("dinner-protein", record).progress).toBe("12 / ≥50 g");
    expect(autoCheckStatus("protein-snack", record, plan)).toEqual({ auto: false });
  });

  it("補位餐的下限是 20 g", () => {
    const record = recordWith({ meals: [meal({ id: "m1", slot: "snack", name: "乳清", protein: 24 })] });
    const status = expectAuto("protein-snack", record);
    expect(status.done).toBe(true);
    expect(status.current).toBe("24 g");
  });

  it("下限直接取自 meals.ts 的目標區間，兩邊不會各改各的", () => {
    expect(PROTEIN_TARGET_BY_SLOT.first?.[0]).toBe(55);
    expect(PROTEIN_TARGET_BY_SLOT.snack?.[0]).toBe(20);
    expect(PROTEIN_TARGET_BY_SLOT.dinner?.[0]).toBe(50);
  });
});

describe("全天蛋白質自動判定", () => {
  it("手填總數也算資料，一樣自動判定", () => {
    const record = recordWith({ protein: 142 });
    const status = expectAuto("protein-total", record);
    expect(status.done).toBe(true);
    expect(status.current).toBe("142 g");
  });

  it("有明細時以明細加總為準", () => {
    const record = recordWith({
      protein: 150,
      meals: [meal({ id: "m1", protein: 46.5 }), meal({ id: "m2", slot: "dinner", protein: 52 })],
    });
    const status = expectAuto("protein-total", record);
    expect(status.done).toBe(false);
    expect(status.progress).toBe("98.5 / ≥140 g");
  });

  it("完全沒資料時退回手動", () => {
    expect(autoCheckStatus("protein-total", recordWith(), plan)).toEqual({ auto: false });
  });

  it("全天下限跟計畫文案的第一個數字一致", () => {
    expect(plan.proteinTarget.startsWith(String(DAILY_PROTEIN_MINIMUM))).toBe(true);
  });
});

describe("熱量自動判定", () => {
  it("低於目標不算失敗（減脂場景）", () => {
    const record = recordWith({ baseCalories: 1464 });
    const status = expectAuto("calorie-target", record);
    expect(status.done).toBe(true);
    expect(status.current).toBe("1,464 kcal");
  });

  it("剛好落在容差內算達標，超過容差才未達成", () => {
    const inside = recordWith({ baseCalories: plan.targetCalories + CALORIE_TOLERANCE });
    expect(expectAuto("calorie-target", inside).done).toBe(true);

    const outside = recordWith({ baseCalories: plan.targetCalories + CALORIE_TOLERANCE + 1 });
    expect(expectAuto("calorie-target", outside).done).toBe(false);
  });

  it("套用過的熱量調整會加進上限", () => {
    const record = recordWith({ baseCalories: plan.targetCalories + 200, calorieAdjustment: 150 });
    expect(expectAuto("calorie-target", record).done).toBe(true);
    expect(expectAuto("calorie-target", record).progress).toBe(
      `${(plan.targetCalories + 200).toLocaleString("en-US")} / ≤${(plan.targetCalories + 250).toLocaleString("en-US")} kcal`,
    );
  });

  it("沒填也沒明細時退回手動", () => {
    expect(autoCheckStatus("calorie-target", recordWith(), plan)).toEqual({ auto: false });
  });
});

describe("量測類自動判定", () => {
  it("量了體重就算做到，不比大小", () => {
    const status = expectAuto("morning-weight", recordWith({ weight: 74 }));
    expect(status.done).toBe(true);
    expect(status.current).toBe("74 kg");
    expect(autoCheckStatus("morning-weight", recordWith(), plan)).toEqual({ auto: false });
  });

  it("睡眠不足 7 小時顯示差距", () => {
    const status = expectAuto("sleep-total", recordWith({ sleepHours: 6.5 }));
    expect(status.done).toBe(false);
    expect(status.current).toBe("6.5 小時");
    expect(status.progress).toBe("6.5 / ≥7 小時");
    expect(expectAuto("sleep-total", recordWith({ sleepHours: MINIMUM_SLEEP_HOURS })).done).toBe(true);
    expect(autoCheckStatus("sleep-total", recordWith(), plan)).toEqual({ auto: false });
  });

  it("步數達到 8,000 才算完成，數字有千分位", () => {
    const short = expectAuto("daily-steps", recordWith({ steps: 5200 }));
    expect(short.done).toBe(false);
    expect(short.progress).toBe("5,200 / ≥8,000 步");
    expect(expectAuto("daily-steps", recordWith({ steps: MINIMUM_STEPS })).done).toBe(true);
    expect(autoCheckStatus("daily-steps", recordWith(), plan)).toEqual({ auto: false });
  });
});

describe("計畫運動自動判定", () => {
  it("填了實際距離或時間就算做到", () => {
    const km = recordWith({ exerciseResults: { "fuji-run": { load: "", result: "", actualKm: 8 } } });
    expect(expectAuto("planned-workout", km).done).toBe(true);

    const minutes = recordWith({ exerciseResults: { "recovery-yoga": { load: "", result: "", actualMinutes: 30 } } });
    expect(expectAuto("planned-workout", minutes).done).toBe(true);
  });

  it("只填了重量或成績文字也算做到", () => {
    const record = recordWith({ exerciseResults: { "goblet-squat": { load: "16 kg", result: "" } } });
    expect(expectAuto("planned-workout", record).done).toBe(true);
  });

  it("欄位存在但全是空的（點過又刪掉）不算做到，退回手動", () => {
    const record = recordWith({
      exerciseResults: {
        "goblet-squat": { load: "", result: "", actualKm: null, actualMinutes: null },
      },
    });
    expect(autoCheckStatus("planned-workout", record, plan)).toEqual({ auto: false });
    expect(autoCheckStatus("planned-workout", recordWith(), plan)).toEqual({ auto: false });
  });
});

describe("刻意維持手動的項目", () => {
  it("蔬菜、澱粉、水杯、走路、補充品、停食一律不自動判定", () => {
    const record = recordWith({
      weight: 74,
      steps: 12000,
      sleepHours: 8,
      waterCups: [true, true, true],
      meals: [meal({ protein: 60, calories: 800 })],
    });

    [
      "first-vegetables",
      "dinner-vegetables",
      "first-starch",
      "dinner-starch",
      "water-cup-1",
      "water-cup-2",
      "water-cup-3",
      "first-walk",
      "dinner-walk",
      "vitamins-b-c",
      "evening-supplements",
      "fasting-start",
      "weekly-waist",
      "weekly-trend-review",
    ].forEach((taskId) => {
      expect(autoCheckStatus(taskId, record, plan), taskId).toEqual({ auto: false });
    });
  });
});

describe("完成度計數：自動與手動混合", () => {
  it("自動項目看記錄、手動項目看勾選，兩者相加", () => {
    const tasks = getChecklistForDate(DATE, 0, { trackWaist: false });
    const record = recordWith({
      weight: 74,
      steps: 9000,
      checks: { "first-vegetables": true, "water-cup-1": true },
    });

    // 自動達標 2 項（體重、步數）＋ 手動勾 2 項。
    expect(countCompletedTasks(tasks, record, plan)).toBe(4);
  });

  it("自動項目未達標時不計入，即使使用者手上沒得勾", () => {
    const tasks = getChecklistForDate(DATE, 0, { trackWaist: false });
    const record = recordWith({ steps: 500 });
    expect(countCompletedTasks(tasks, record, plan)).toBe(0);
  });

  it("沒有任何紀錄的日子是 0，不會炸掉", () => {
    const tasks = getChecklistForDate(DATE, 0, { trackWaist: false });
    expect(countCompletedTasks(tasks, undefined, plan)).toBe(0);
  });

  it("歷史遺留的舊勾：資料不足時照舊生效，資料補上後以自動判定為準", () => {
    const legacy = recordWith({ checks: { "daily-steps": true, "first-protein": true } });
    expect(isChecklistTaskDone("daily-steps", legacy, plan)).toBe(true);
    expect(isChecklistTaskDone("first-protein", legacy, plan)).toBe(true);

    const measured = recordWith({
      checks: { "daily-steps": true, "first-protein": true },
      steps: 3000,
      meals: [meal({ protein: 20 })],
    });
    expect(isChecklistTaskDone("daily-steps", measured, plan)).toBe(false);
    expect(isChecklistTaskDone("first-protein", measured, plan)).toBe(false);
    // 舊勾只是被蓋過顯示，資料本身不動——哪天明細刪光還要靠它。
    expect(measured.checks["daily-steps"]).toBe(true);
    expect(measured.checks["first-protein"]).toBe(true);
  });
});
