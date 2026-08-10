import type { ImpactResult } from "./impact";
import type { DailyRecord, DayPlan } from "./types";

interface SummaryInput {
  dateKey: string;
  plan: DayPlan;
  record: DailyRecord;
  impact: ImpactResult;
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
    return `- ${exercise.name}：${exercise.minutes} 分鐘${distance}，${exercise.intensity === "high" ? "高" : exercise.intensity === "moderate" ? "中" : "低"}強度${calories}`;
  }).join("\n");
}

export function buildConsultationSummary({ dateKey, plan, record, impact }: SummaryInput): string {
  const baseCalories = record.baseCalories === null
    ? `未填，目前先以目標 ${plan.targetCalories.toLocaleString("en-US")} kcal 估算`
    : `${record.baseCalories.toLocaleString("en-US")} kcal`;
  const deviation = impact.intakeDeviation >= 0
    ? `+${impact.intakeDeviation}`
    : String(impact.intakeDeviation);

  return `我想詢問 Skin & Bones in 100 Days 計畫的調整建議。

日期：${dateKey}
原定運動：${plan.workoutName}
當日目標：${plan.targetCalories.toLocaleString("en-US")} kcal，蛋白質 ${plan.proteinTarget}
正常餐點熱量：${baseCalories}

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
