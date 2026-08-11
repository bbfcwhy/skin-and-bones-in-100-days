import type { DailyRecord, MealEntry, MealSlot, TargetRange } from "./types";

/**
 * 正餐逐筆記錄的加總規則。
 *
 * 為什麼需要這一層：以前「正常餐點熱量」與「全天蛋白質」要自己查表加總再填一個數字，
 * 使用者根本無從確認自己吃了多少。改成逐筆記錄之後，總數由明細算出來。
 *
 * 語意規則：**明細是唯一真相**。某個欄位只要有任何一筆明細填了值，
 * 手填的總數就完全不參與計算（不相加、不取大值）；一筆都沒填才回退到手填總數。
 * 熱量與蛋白質分開判斷——外食只知道熱量（雞腿便當 850）不該把蛋白質歸零。
 */

/** 分餐順序。UI 與摘要都照這個順序列，不要各排各的。 */
export const MEAL_SLOTS: MealSlot[] = ["first", "snack", "dinner", "other"];

export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  first: "第一餐",
  snack: "蛋白質補位",
  dinner: "晚餐",
  other: "其他",
};

/**
 * 各分餐的蛋白質目標區間。
 *
 * ⚠️ 與 plan.ts 的 checklist 文案對齊：first-protein「蛋白質 55 到 65 g」、
 * protein-snack「20 到 30 g」、dinner-protein「50 到 60 g」。改一邊要改兩邊，
 * tests/meals.test.ts 有一條測試會比對兩邊，改單邊會紅。
 * other 沒有目標——臨時多出來的一餐不該假裝有標準。
 */
export const PROTEIN_TARGET_BY_SLOT: Record<MealSlot, TargetRange | null> = {
  first: [55, 65],
  snack: [20, 30],
  dinner: [50, 60],
  other: null,
};

/** 估算不是實驗室數據，蛋白質一律留一位小數，避免浮點加總跑出 53.900000000000006。 */
function roundProtein(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 舊資料可能完全沒有 meals 欄位（同步或備份來的），一律當成空陣列。 */
function mealList(record: DailyRecord): MealEntry[] {
  return record.meals ?? [];
}

/** 有填熱量的明細。長度為 0 代表熱量還是由手填總數決定。 */
export function mealsWithCalories(record: DailyRecord): MealEntry[] {
  return mealList(record).filter((meal) => meal.calories !== null);
}

/** 有填蛋白質的明細。長度為 0 代表蛋白質還是由手填總數決定。 */
export function mealsWithProtein(record: DailyRecord): MealEntry[] {
  return mealList(record).filter((meal) => meal.protein !== null);
}

/** 這天實際的正常餐點熱量：有明細用明細加總，沒有就用手填的總數。 */
export function effectiveBaseCalories(record: DailyRecord): number | null {
  const detailed = mealsWithCalories(record);
  if (detailed.length === 0) return record.baseCalories;
  return detailed.reduce((total, meal) => total + (meal.calories ?? 0), 0);
}

/** 這天實際的全天蛋白質。只算正餐明細，臨時加餐的蛋白質不混進來。 */
export function effectiveProtein(record: DailyRecord): number | null {
  const detailed = mealsWithProtein(record);
  if (detailed.length === 0) return record.protein;
  return roundProtein(detailed.reduce((total, meal) => total + (meal.protein ?? 0), 0));
}

/** 分餐加總。沒記錄的餐別回 0，UI 不必再處理 undefined。 */
export function mealTotalsBySlot(record: DailyRecord): Record<MealSlot, { calories: number; protein: number }> {
  const totals = {
    first: { calories: 0, protein: 0 },
    snack: { calories: 0, protein: 0 },
    dinner: { calories: 0, protein: 0 },
    other: { calories: 0, protein: 0 },
  } satisfies Record<MealSlot, { calories: number; protein: number }>;

  mealList(record).forEach((meal) => {
    const slot = totals[meal.slot] ?? totals.other;
    slot.calories += meal.calories ?? 0;
    slot.protein += meal.protein ?? 0;
  });

  MEAL_SLOTS.forEach((slot) => {
    totals[slot].protein = roundProtein(totals[slot].protein);
  });

  return totals;
}

/** 取出某一餐的明細，順序照記錄的先後。 */
export function mealsInSlot(record: DailyRecord, slot: MealSlot): MealEntry[] {
  return mealList(record).filter((meal) => meal.slot === slot);
}

/**
 * 依現在幾點猜這筆要記到哪一餐（只是預設值，使用者可以自己改）。
 * 對齊 checklist 的時間：12:00 第一餐、15:00 蛋白質補位、傍晚以後晚餐。
 */
export function defaultSlotForHour(hour: number): MealSlot {
  if (hour < 14) return "first";
  if (hour < 17) return "snack";
  return "dinner";
}

/** 蛋白質是否落在該餐的目標區間內。沒有目標區間（其他）一律回 false，不亂發獎。 */
export function isProteinOnTarget(slot: MealSlot, protein: number): boolean {
  const target = PROTEIN_TARGET_BY_SLOT[slot];
  if (!target) return false;
  return protein >= target[0] && protein <= target[1];
}
