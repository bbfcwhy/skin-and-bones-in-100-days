import { PROTEIN_TARGET_BY_SLOT, effectiveBaseCalories, effectiveProtein, mealTotalsBySlot } from "./meals";
import type { ChecklistTask, DailyRecord, DayPlan, MealSlot } from "./types";

/**
 * Checklist 的自動判定。
 *
 * 為什麼需要這一層：正餐、體重、睡眠、步數、運動成績都已經逐筆記錄了，
 * 再要求使用者回到清單手動勾一次「第一餐蛋白質有沒有到」是重複勞動——
 * **記錄本身就是證明**。
 *
 * 三條語意規則，違反哪一條都不要做：
 * 1. 判得了就自動：資料足以回答「有沒有做到」時，使用者不必也不能手動勾。
 * 2. 判不了就退回手動：資料不足一律回 `{ auto: false }`，維持原本的勾選框。
 *    絕不用「大概有吧」去猜——半吊子的自動判定比沒有更糟。
 * 3. 舊勾不清除：某項今天變成自動判定時只是顯示上蓋過 `checks[id]`，
 *    資料本身原封不動（明細哪天被刪光，就會退回手動並拿回舊勾）。
 *
 * ⚠️ 蔬菜與澱粉刻意不自動判定：正餐明細記的是「雞胸肉 150 g」這種項目，
 * 自訂外食（雞腿便當 850 kcal）根本沒有內容物欄位，算不出蔬菜幾克、澱粉幾克。
 * 水杯、餐後走路、補充品、停食時間同理——App 沒有這些事件的記錄來源。
 * 硬要猜就是違反規則 2，所以這些項目永遠留給使用者自己勾。
 */

/** 全天蛋白質下限。對齊 plan.ts 的 proteinTarget 文案「140 到 150 g」，tests/auto-check.test.ts 會比對兩邊。 */
export const DAILY_PROTEIN_MINIMUM = 140;

/**
 * 熱量容差。減脂場景下「吃比目標少」不是失敗，所以只設上限：
 * 有效熱量 <= 當日目標（含已套用的分散調整）+ 容差才算達標。
 * 對齊 checklist 文案「允許約 ±100 kcal 的日常波動」。
 */
export const CALORIE_TOLERANCE = 100;

/** 睡眠下限，對齊 checklist 文案「睡眠至少 7 小時」。 */
export const MINIMUM_SLEEP_HOURS = 7;

/** 步數下限，對齊 checklist 文案「至少 8,000 步」。 */
export const MINIMUM_STEPS = 8000;

export type AutoCheckStatus =
  | {
      auto: true;
      done: boolean;
      /** 目前值本身，例：「46.5 g」「1,464 kcal」。達標時顯示這個就夠了。 */
      current: string;
      /** 帶目標的對照，例：「46.5 / ≥55 g」。未達標時顯示這個，讓人知道還差多少。 */
      progress: string;
    }
  | { auto: false };

const MANUAL: AutoCheckStatus = { auto: false };

/** 分餐蛋白質的清單項目對應哪一格。key 是 plan.ts 寫死的 task id。 */
const SLOT_BY_TASK_ID: Record<string, MealSlot> = {
  "first-protein": "first",
  "protein-snack": "snack",
  "dinner-protein": "dinner",
};

function thousands(value: number): string {
  return value.toLocaleString("en-US");
}

function atLeast(
  value: number,
  minimum: number,
  unit: string,
  format: (value: number) => string = String,
): AutoCheckStatus {
  return {
    auto: true,
    done: value >= minimum,
    current: `${format(value)} ${unit}`,
    progress: `${format(value)} / ≥${format(minimum)} ${unit}`,
  };
}

/** 某一餐有沒有任何一筆填了蛋白質。沒有＝這一餐的蛋白質判不了。 */
function hasSlotProtein(record: DailyRecord, slot: MealSlot): boolean {
  return (record.meals ?? []).some((meal) => meal.slot === slot && meal.protein !== null);
}

/** 計畫運動有沒有留下任何成績。空字串與 null 都不算——點開表單又清空不代表做了。 */
function hasWorkoutResult(record: DailyRecord): boolean {
  return Object.values(record.exerciseResults ?? {}).some((entry) => {
    if (!entry) return false;
    if (typeof entry.actualKm === "number" || typeof entry.actualMinutes === "number") return true;
    return entry.load.trim() !== "" || entry.result.trim() !== "";
  });
}

/**
 * 這個清單項目能不能從當日記錄推導出來。
 *
 * ⚠️ `plan` 一律傳 `getPlanForDate(dateKey)` 的**原始**計畫。
 * 不要傳已經把 `calorieAdjustment` 加進 `targetCalories` 的版本——
 * 熱量上限在這裡會再加一次 `record.calorieAdjustment`，傳錯會重複計算。
 */
export function autoCheckStatus(taskId: string, record: DailyRecord, plan: DayPlan): AutoCheckStatus {
  const slot = SLOT_BY_TASK_ID[taskId];
  if (slot) {
    if (!hasSlotProtein(record, slot)) return MANUAL;
    const minimum = PROTEIN_TARGET_BY_SLOT[slot]?.[0];
    // 上限（65 / 30 / 60）是配置參考不是失敗線，吃超過不該被標成沒做到。
    if (minimum === undefined) return MANUAL;
    return atLeast(mealTotalsBySlot(record)[slot].protein, minimum, "g");
  }

  switch (taskId) {
    case "protein-total": {
      const protein = effectiveProtein(record);
      if (protein === null) return MANUAL;
      return atLeast(protein, DAILY_PROTEIN_MINIMUM, "g");
    }
    case "calorie-target": {
      const calories = effectiveBaseCalories(record);
      if (calories === null) return MANUAL;
      const limit = plan.targetCalories + record.calorieAdjustment + CALORIE_TOLERANCE;
      return {
        auto: true,
        done: calories <= limit,
        current: `${thousands(calories)} kcal`,
        progress: `${thousands(calories)} / ≤${thousands(limit)} kcal`,
      };
    }
    case "morning-weight": {
      // 量了就算做到——這項要求的是「有沒有量」，不是體重數字要多少。
      if (typeof record.weight !== "number") return MANUAL;
      const current = `${record.weight} kg`;
      return { auto: true, done: true, current, progress: current };
    }
    case "sleep-total": {
      if (typeof record.sleepHours !== "number") return MANUAL;
      return atLeast(record.sleepHours, MINIMUM_SLEEP_HOURS, "小時");
    }
    case "daily-steps": {
      if (typeof record.steps !== "number") return MANUAL;
      return atLeast(record.steps, MINIMUM_STEPS, "步", thousands);
    }
    case "planned-workout": {
      // 同樣是「有沒有做」而不是「做得夠不夠」：成績表填了東西就代表練過了。
      if (!hasWorkoutResult(record)) return MANUAL;
      return { auto: true, done: true, current: "已記錄成績", progress: "已記錄成績" };
    }
    default:
      return MANUAL;
  }
}

/**
 * 這個項目算不算完成：自動項目看記錄、手動項目看勾選。
 * 完成度計數與畫面顯示都要走這個函式，不要各算各的。
 */
export function isChecklistTaskDone(
  taskId: string,
  record: DailyRecord | undefined,
  plan: DayPlan,
): boolean {
  if (!record) return false;
  const status = autoCheckStatus(taskId, record, plan);
  return status.auto ? status.done : Boolean(record.checks[taskId]);
}

/** 一天完成幾項。今日頁的「N / 21 完成」與本週檢視共用這一條。 */
export function countCompletedTasks(
  tasks: ChecklistTask[],
  record: DailyRecord | undefined,
  plan: DayPlan,
): number {
  return tasks.filter((task) => isChecklistTaskDone(task.id, record, plan)).length;
}
