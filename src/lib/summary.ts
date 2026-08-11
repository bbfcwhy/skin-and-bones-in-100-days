import type { ImpactResult } from "./impact";
import {
  MEAL_SLOTS,
  MEAL_SLOT_LABEL,
  effectiveBaseCalories,
  effectiveProtein,
  mealTotalsBySlot,
  mealsInSlot,
} from "./meals";
import type { DailyRecord, DayPlan } from "./types";

interface SummaryInput {
  dateKey: string;
  plan: DayPlan;
  record: DailyRecord;
  impact: ImpactResult;
}

/** 正餐分餐明細。沒記錄的餐別不列，免得摘要塞滿「沒有」。 */
function mealSection(record: DailyRecord): string {
  const totals = mealTotalsBySlot(record);
  const blocks = MEAL_SLOTS.flatMap((slot) => {
    const entries = mealsInSlot(record, slot);
    if (!entries.length) return [];
    const header = `${MEAL_SLOT_LABEL[slot]}（${totals[slot].calories} kcal，蛋白質 ${totals[slot].protein} g）`;
    const lines = entries.map((meal) => {
      const portion = meal.grams === null ? "" : ` ${meal.grams} g`;
      const calories = meal.calories === null ? "熱量待估" : `${meal.calories} kcal`;
      const protein = meal.protein === null ? "" : `，蛋白質 ${meal.protein} g`;
      const note = meal.note ? `，備註：${meal.note}` : "";
      return `- ${meal.name}${portion}：${calories}${protein}${note}`;
    });
    return [`${header}\n${lines.join("\n")}`];
  });

  if (!blocks.length) return "";
  return `\n正餐逐筆記錄：\n${blocks.join("\n")}\n`;
}

function foodLines(record: DailyRecord): string {
  if (!record.additionalFoods.length) return "- 沒有記錄額外飲食";
  return record.additionalFoods.map((food) => {
    const calories = food.calories === null ? "熱量待估" : `${food.calories} kcal`;
    const protein = food.protein === null ? "" : `，蛋白質 ${food.protein} g`;
    const note = food.note ? `，備註：${food.note}` : "";
    return `- ${food.name}：${calories}${protein}${note}`;
  }).join("\n");
}

function exerciseLines(record: DailyRecord): string {
  if (!record.additionalExercises.length) return "- 沒有記錄額外運動";
  return record.additionalExercises.map((exercise) => {
    const distance = exercise.distance === null ? "" : `，${exercise.distance} km`;
    const calories = exercise.activeCalories === null ? "" : `，裝置顯示 ${exercise.activeCalories} kcal`;
    const intensity = exercise.intensity
      ? `，${exercise.intensity === "high" ? "高" : exercise.intensity === "moderate" ? "中" : "低"}強度`
      : "";
    return `- ${exercise.name}：${exercise.minutes} 分鐘${distance}${intensity}${calories}`;
  }).join("\n");
}

export function buildConsultationSummary({ dateKey, plan, record, impact }: SummaryInput): string {
  const recordedBase = effectiveBaseCalories(record);
  const baseCalories = recordedBase === null
    ? `未填，目前先以目標 ${plan.targetCalories.toLocaleString("en-US")} kcal 估算`
    : `${recordedBase.toLocaleString("en-US")} kcal`;
  const recordedProtein = effectiveProtein(record);
  const protein = recordedProtein === null ? "未填" : `${recordedProtein} g`;
  const deviation = impact.intakeDeviation >= 0
    ? `+${impact.intakeDeviation}`
    : String(impact.intakeDeviation);

  return `我想詢問 Skin & Bones in 100 Days 計畫的調整建議。

日期：${dateKey}
原定運動：${plan.workoutName}
當日目標：${plan.targetCalories.toLocaleString("en-US")} kcal，蛋白質 ${plan.proteinTarget}
正常餐點熱量：${baseCalories}
全天蛋白質：${protein}
${mealSection(record)}
額外飲食：
${foodLines(record)}

額外運動：
${exerciseLines(record)}

系統目前計算：
- 已知當日攝取與目標差：${deviation} kcal
- 本週累積與計畫差：${impact.weekDeviation >= 0 ? "+" : ""}${impact.weekDeviation} kcal
- 建議：${impact.message}
${impact.recoveryWarning ? `- 恢復提醒：${impact.recoveryWarning}\n` : ""}- 這個系統不會把運動熱量 1 比 1 抵消飲食。

請幫我判斷：需不需要修改未來幾天的飲食或運動？如果需要，請告訴我具體改哪一天。`;
}
