import { describe, expect, it } from "vitest";
import {
  PROTEIN_TARGET_BY_SLOT,
  defaultSlotForHour,
  effectiveBaseCalories,
  effectiveProtein,
  mealTotalsBySlot,
  mealsWithCalories,
  mealsWithProtein,
} from "../src/lib/meals";
import { getChecklistForDate } from "../src/lib/plan";
import { createInitialState, ensureDailyRecord, parseImportedState } from "../src/lib/storage";
import type { DailyRecord, MealEntry } from "../src/lib/types";

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
  ...ensureDailyRecord(createInitialState(), "2026-08-11").record,
  ...overrides,
});

describe("正餐明細與手填總數的取捨", () => {
  it("沒有逐筆記錄時，沿用使用者手填的總數（舊資料照常有效）", () => {
    const record = recordWith({ baseCalories: 1800, protein: 132 });
    expect(effectiveBaseCalories(record)).toBe(1800);
    expect(effectiveProtein(record)).toBe(132);
  });

  it("兩者都沒有時回 null，不硬湊數字", () => {
    const record = recordWith();
    expect(effectiveBaseCalories(record)).toBeNull();
    expect(effectiveProtein(record)).toBeNull();
  });

  it("有明細就以明細加總為準，手填的總數不再參與計算", () => {
    const record = recordWith({
      baseCalories: 1800,
      protein: 132,
      meals: [
        meal({ id: "meal-1", name: "雞胸肉", grams: 150, calories: 248, protein: 46.5 }),
        meal({ id: "meal-2", name: "白飯", grams: 200, calories: 366, protein: 7.4 }),
      ],
    });

    expect(effectiveBaseCalories(record)).toBe(614);
    expect(effectiveProtein(record)).toBe(53.9);
  });

  it("蛋白質加總留一位小數，不出現浮點數尾巴", () => {
    const record = recordWith({
      meals: [
        meal({ id: "meal-1", protein: 46.5, calories: null }),
        meal({ id: "meal-2", protein: 7.4, calories: null }),
        meal({ id: "meal-3", protein: 0.1, calories: null }),
      ],
    });
    expect(effectiveProtein(record)).toBe(54);
  });

  it("明細只填了名稱沒填數字時，該欄位仍然沿用手填總數", () => {
    const record = recordWith({
      baseCalories: 1800,
      protein: 132,
      meals: [meal({ calories: null, protein: null })],
    });
    expect(effectiveBaseCalories(record)).toBe(1800);
    expect(effectiveProtein(record)).toBe(132);
  });

  it("熱量與蛋白質分開判斷：只填熱量的自訂項目不會把蛋白質歸零", () => {
    const record = recordWith({
      baseCalories: 1800,
      protein: 132,
      meals: [meal({ name: "雞腿便當", grams: null, calories: 850, protein: null })],
    });
    expect(effectiveBaseCalories(record)).toBe(850);
    expect(effectiveProtein(record)).toBe(132);
    expect(mealsWithCalories(record)).toHaveLength(1);
    expect(mealsWithProtein(record)).toHaveLength(0);
  });

  it("舊資料完全沒有 meals 欄位時不會炸掉", () => {
    const legacy = { ...recordWith({ baseCalories: 1500 }) } as DailyRecord;
    delete (legacy as Partial<DailyRecord>).meals;
    expect(effectiveBaseCalories(legacy)).toBe(1500);
    expect(mealsWithCalories(legacy)).toEqual([]);
  });

  it("匯入舊備份後補上空的 meals，手填的數字原封不動", () => {
    const state = parseImportedState(JSON.stringify({
      version: 1,
      profile: { challengeStart: "2026-08-10", startWeight: 78.5, goalWeight: 70, fastingStart: "20:00", cupSizeMl: 700 },
      records: {
        "2026-08-10": { dateKey: "2026-08-10", checks: {}, baseCalories: 1950, protein: 128, note: "" },
      },
    }));
    const record = state.records["2026-08-10"];

    expect(record.meals).toEqual([]);
    expect(effectiveBaseCalories(record)).toBe(1950);
    expect(effectiveProtein(record)).toBe(128);
  });
});

describe("分餐加總", () => {
  it("依餐別分組加總，沒記錄的餐別是 0 而不是 undefined", () => {
    const record = recordWith({
      meals: [
        meal({ id: "meal-1", slot: "first", calories: 248, protein: 46.5 }),
        meal({ id: "meal-2", slot: "first", calories: 366, protein: 7.4 }),
        meal({ id: "meal-3", slot: "dinner", name: "鮭魚", calories: 300, protein: 30 }),
      ],
    });

    const totals = mealTotalsBySlot(record);
    expect(totals.first).toEqual({ calories: 614, protein: 53.9 });
    expect(totals.dinner).toEqual({ calories: 300, protein: 30 });
    expect(totals.snack).toEqual({ calories: 0, protein: 0 });
    expect(totals.other).toEqual({ calories: 0, protein: 0 });
  });
});

describe("分餐蛋白質目標", () => {
  it("三個分餐的目標區間跟 checklist 文案一致", () => {
    const tasks = getChecklistForDate("2026-08-11", 0, { trackWaist: false });
    const label = (taskId: string) => tasks.find((task) => task.id === taskId)?.label ?? "";

    expect(label("first-protein")).toContain(
      `${PROTEIN_TARGET_BY_SLOT.first?.[0]} 到 ${PROTEIN_TARGET_BY_SLOT.first?.[1]}`,
    );
    expect(label("protein-snack")).toContain(
      `${PROTEIN_TARGET_BY_SLOT.snack?.[0]} 到 ${PROTEIN_TARGET_BY_SLOT.snack?.[1]}`,
    );
    expect(label("dinner-protein")).toContain(
      `${PROTEIN_TARGET_BY_SLOT.dinner?.[0]} 到 ${PROTEIN_TARGET_BY_SLOT.dinner?.[1]}`,
    );
  });

  it("其他餐別沒有目標區間，不假裝有標準", () => {
    expect(PROTEIN_TARGET_BY_SLOT.other).toBeNull();
  });
});

describe("依時間猜預設餐別", () => {
  it("中午前後算第一餐", () => {
    expect(defaultSlotForHour(0)).toBe("first");
    expect(defaultSlotForHour(12)).toBe("first");
    expect(defaultSlotForHour(13)).toBe("first");
  });

  it("下午 14 到 16 點算蛋白質補位", () => {
    expect(defaultSlotForHour(14)).toBe("snack");
    expect(defaultSlotForHour(16)).toBe("snack");
  });

  it("17 點之後算晚餐", () => {
    expect(defaultSlotForHour(17)).toBe("dinner");
    expect(defaultSlotForHour(23)).toBe("dinner");
  });
});
