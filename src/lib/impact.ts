import { estimateExerciseCalories } from "./energy";
import { effectiveBaseCalories } from "./meals";
import { getMondayKey, getPlanForDate } from "./plan";
import type { AdditionalExercise, AdditionalFood, DailyRecord, DayPlan } from "./types";

export type ImpactStatus = "needs-estimate" | "steady" | "observe" | "adjust" | "under-fueled";

export interface ProposedAdjustment {
  dateKey: string;
  caloriesDelta: number;
  reason: string;
}

export interface ImpactResult {
  status: ImpactStatus;
  message: string;
  hasUnknownFood: boolean;
  usedTargetAsBase: boolean;
  knownAdditionalCalories: number;
  intakeCalories: number;
  intakeDeviation: number;
  weekDeviation: number;
  reportedExerciseCalories: number;
  proposedAdjustments: ProposedAdjustment[];
  unallocatedCalories: number;
  recoveryWarning: string | null;
}

interface AnalyzeImpactInput {
  plan: DayPlan;
  baseCalories: number | null;
  additionalFoods: AdditionalFood[];
  additionalExercises: AdditionalExercise[];
  previousWeekDeviation: number;
  futurePlans: DayPlan[];
  /** 估算活動消耗用；沒有可用體重就傳 null，系統不會硬湊數字。 */
  weightKg: number | null;
}

export function calculateWeekDeviation(
  records: Record<string, DailyRecord>,
  throughDateExclusive: string,
): { deviation: number; hasUnknownFood: boolean } {
  const mondayKey = getMondayKey(throughDateExclusive);
  let deviation = 0;
  let hasUnknownFood = false;

  Object.values(records)
    .filter((record) => record.dateKey >= mondayKey && record.dateKey < throughDateExclusive)
    .forEach((record) => {
      // 正餐逐筆記錄的日子沒有手填總數也算數，所以判斷要看加總後的結果而不是原欄位。
      const recordedBase = effectiveBaseCalories(record);
      if (recordedBase === null && record.additionalFoods.length === 0) return;
      const plan = getPlanForDate(record.dateKey);
      const effectiveTarget = plan.targetCalories + record.calorieAdjustment;
      const baseCalories = recordedBase ?? effectiveTarget;
      const extraCalories = record.additionalFoods.reduce(
        (total, food) => total + (food.calories ?? 0),
        0,
      );
      hasUnknownFood ||= record.additionalFoods.some((food) => food.calories === null);
      deviation += baseCalories + extraCalories - effectiveTarget;
    });

  return { deviation, hasUnknownFood };
}

function buildAdjustments(weekDeviation: number, futurePlans: DayPlan[]): ProposedAdjustment[] {
  if (weekDeviation <= 450) return [];

  const dailyReduction = weekDeviation > 900 ? 150 : 100;
  const eligiblePlans = futurePlans
    .filter((plan) => plan.dayType !== "run")
    .sort((a, b) => {
      const priority = { recovery: 0, strength: 1, run: 2 };
      return priority[a.dayType] - priority[b.dayType];
    })
    .slice(0, 3);

  return eligiblePlans.map((plan) => ({
    dateKey: plan.dateKey,
    caloriesDelta: -dailyReduction,
    reason: plan.dayType === "recovery"
      ? "優先從恢復日小幅調整，不減蛋白質"
      : "肌力日只小幅調整，保留訓練前後澱粉",
  }));
}

function getRecoveryWarning(exercises: AdditionalExercise[]): string | null {
  const hasHighLoad = exercises.some((exercise) => (
    exercise.category === "hiit"
    || exercise.minutes >= 60
    || (exercise.category === "run" && (exercise.distance ?? 0) >= 8)
  ));

  if (!hasHighLoad) return null;
  return "今天有額外高負荷運動。未來 24 到 48 小時先觀察酸痛、疲勞與力量，必要時把下一個高強度課改成恢復瑜伽。";
}

export function analyzeImpact(input: AnalyzeImpactInput): ImpactResult {
  const hasUnknownFood = input.additionalFoods.some((food) => food.calories === null);
  const knownAdditionalCalories = input.additionalFoods.reduce(
    (total, food) => total + (food.calories ?? 0),
    0,
  );
  const usedTargetAsBase = input.baseCalories === null;
  const baseCalories = input.baseCalories ?? input.plan.targetCalories;
  const intakeCalories = baseCalories + knownAdditionalCalories;
  const intakeDeviation = intakeCalories - input.plan.targetCalories;
  const weekDeviation = input.previousWeekDeviation + intakeDeviation;
  const reportedExerciseCalories = input.additionalExercises.reduce(
    (total, exercise) => total + (exercise.activeCalories ?? estimateExerciseCalories({
      category: exercise.category,
      minutes: exercise.minutes,
      km: exercise.distance,
      weightKg: input.weightKg,
    }) ?? 0),
    0,
  );
  const proposedAdjustments = hasUnknownFood ? [] : buildAdjustments(weekDeviation, input.futurePlans);
  const allocatedCalories = proposedAdjustments.reduce(
    (total, adjustment) => total + Math.abs(adjustment.caloriesDelta),
    0,
  );

  let status: ImpactStatus = "observe";
  let message = "先保持原計畫，看完本週累積與 7 天平均體重再決定。";

  if (hasUnknownFood) {
    status = "needs-estimate";
    message = "有臨時飲食尚未估算熱量，先完成估算，系統不會用假精準數字改後面計畫。";
  } else if (weekDeviation > 450) {
    status = "adjust";
    message = "本週累積高於計畫較多，可考慮分散到未來的恢復日或肌力日，但不必一次追平。";
  } else if (weekDeviation < -450) {
    status = "under-fueled";
    message = "本週攝取低於計畫較多，不要再向下調整，跑步與肌力日要把恢復用熱量補回。";
  } else if (Math.abs(weekDeviation) <= 150) {
    status = "steady";
    message = "這屬於可接受的日常波動，記錄就好，後面天數繼續原計畫。";
  }

  return {
    status,
    message,
    hasUnknownFood,
    usedTargetAsBase,
    knownAdditionalCalories,
    intakeCalories,
    intakeDeviation,
    weekDeviation,
    reportedExerciseCalories,
    proposedAdjustments,
    unallocatedCalories: Math.max(weekDeviation - allocatedCalories, 0),
    recoveryWarning: getRecoveryWarning(input.additionalExercises),
  };
}
