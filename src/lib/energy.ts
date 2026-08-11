import { addDays } from "./plan";
import type {
  DailyRecord,
  DayType,
  ExerciseCategory,
  ExerciseDefinition,
  Profile,
  TargetRange,
} from "./types";

/**
 * MET（代謝當量）估算：這是公開的運動生理學估算表，只用來給一個量級參考，
 * 不是實測值。手錶有實測數字時一律以手錶為準。
 */
export const MET_BY_CATEGORY: Record<ExerciseCategory, number> = {
  walk: 3.5,
  yoga: 2.5,
  run: 9.8,
  hiit: 8,
  strength: 5,
  other: 4,
};

/** [時速 km/h, MET]，跑步同時有時間與距離時用配速選最接近的檔位。 */
const RUN_MET_BY_SPEED: Array<[number, number]> = [
  [8, 8.3],
  [9.7, 9.8],
  [11, 11],
  [12.9, 12.3],
];

/** 只有距離、沒有時間時的粗估係數：kcal ≈ 係數 × 體重 kg × 距離 km。 */
const CALORIES_PER_KG_KM: Partial<Record<ExerciseCategory, number>> = {
  run: 1.036,
  walk: 0.5,
};

const WEIGHT_LOOKBACK_DAYS = 14;

export interface EstimateInput {
  category: ExerciseCategory;
  minutes?: number | null;
  km?: number | null;
  weightKg: number | null;
}

function isPositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function runMetForSpeed(speedKmh: number): number {
  return RUN_MET_BY_SPEED.reduce((closest, entry) => (
    Math.abs(entry[0] - speedKmh) < Math.abs(closest[0] - speedKmh) ? entry : closest
  ))[1];
}

export function estimateExerciseCalories({ category, minutes, km, weightKg }: EstimateInput): number | null {
  if (!isPositive(weightKg)) return null;

  if (isPositive(minutes)) {
    let met = MET_BY_CATEGORY[category];
    if (category === "run" && isPositive(km)) met = runMetForSpeed(km / (minutes / 60));
    return Math.round((met * 3.5 * weightKg) / 200 * minutes);
  }

  if (isPositive(km)) {
    const perKgKm = CALORIES_PER_KG_KM[category];
    if (perKgKm === undefined) return null;
    return Math.round(perKgKm * weightKg * km);
  }

  return null;
}

/**
 * 體重取值順序：當天 → 往前 14 天內最近一次 → 起始體重 → null。
 * 找不到就回 null，不用假數字算出假精準的消耗。
 */
export function resolveWeightKg(
  records: Record<string, DailyRecord>,
  dateKey: string,
  profile: Pick<Profile, "startWeight">,
): number | null {
  for (let offset = 0; offset <= WEIGHT_LOOKBACK_DAYS; offset += 1) {
    const weight = records[addDays(dateKey, -offset)]?.weight;
    if (typeof weight === "number" && Number.isFinite(weight)) return weight;
  }
  return profile.startWeight ?? null;
}

export type TargetStatus = "unset" | "under" | "met" | "over";

export interface TargetComparison {
  status: TargetStatus;
  delta: number;
  label: string;
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 落在區間內就算達標，不標超額；定值目標就是 min 等於 max 的區間。 */
export function compareToTarget(actual: number | null | undefined, range: TargetRange): TargetComparison {
  if (typeof actual !== "number" || !Number.isFinite(actual)) {
    return { status: "unset", delta: 0, label: "" };
  }
  const [min, max] = range;
  if (actual > max) {
    const delta = roundToTenth(actual - max);
    return { status: "over", delta, label: `+${delta}` };
  }
  if (actual < min) {
    const delta = roundToTenth(actual - min);
    return { status: "under", delta, label: String(delta) };
  }
  return { status: "met", delta: 0, label: "達標" };
}

/** 計畫內運動沒有類型欄位，用目標與當日類型推一個估算用的類別。 */
export function categoryForPlannedExercise(exercise: ExerciseDefinition, dayType: DayType): ExerciseCategory {
  if (exercise.target?.km) return "run";
  if (dayType === "run") return "run";
  if (dayType === "recovery") return "yoga";
  return "strength";
}
