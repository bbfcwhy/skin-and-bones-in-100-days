export type DayType = "run" | "strength" | "recovery";

export type ExerciseIntensity = "low" | "moderate" | "high";

export type ExerciseArea = "lower" | "upper" | "full";

export type TargetRange = [number, number];

export interface ExerciseTarget {
  km?: TargetRange;
  minutes?: TargetRange;
}

export interface ExerciseDefinition {
  id: string;
  name: string;
  prescription: string;
  note?: string;
  target?: ExerciseTarget;
}

export interface DayPlan {
  dateKey: string;
  dayType: DayType;
  workoutName: string;
  workoutNote: string;
  exercises: ExerciseDefinition[];
  targetCalories: number;
  proteinTarget: string;
  vegetableTarget: string;
  firstStarch: string;
  dinnerStarch: string;
}

export interface ChecklistTask {
  id: string;
  group: string;
  label: string;
  detail: string;
}

export interface AdditionalFood {
  id: string;
  name: string;
  calories: number | null;
  protein: number | null;
  note: string;
  createdAt: string;
}

/** 正餐的分餐格子。跟 checklist 的「12:00 第一餐／15:00 蛋白質補位／晚餐」對應。 */
export type MealSlot = "first" | "snack" | "dinner" | "other";

/**
 * 正餐吃的一筆東西。
 *
 * 跟 AdditionalFood（臨時加餐）分開放：正餐是計畫內的，加總後就是「正常餐點熱量」；
 * 臨時加餐是計畫外的，在影響分析裡另外算，兩者混在一起就看不出今天是不是照計畫吃。
 */
export interface MealEntry {
  id: string;
  slot: MealSlot;
  name: string;
  /** 用食物資料庫換算時會有克數；自訂項目（例：雞腿便當 850）沒有就是 null。 */
  grams: number | null;
  calories: number | null;
  protein: number | null;
  note: string;
  createdAt: string;
}

export type ExerciseCategory = "walk" | "yoga" | "run" | "hiit" | "strength" | "other";

export interface AdditionalExercise {
  id: string;
  /** 新記錄一律寫入類型中文名，舊資料可能是自訂名稱。 */
  name?: string;
  category: ExerciseCategory;
  minutes: number;
  distance: number | null;
  /** 舊資料保留，新記錄不再寫入，也不再參與任何判斷。 */
  intensity?: ExerciseIntensity;
  /** 舊資料保留，新記錄不再寫入，也不再參與任何判斷。 */
  area?: ExerciseArea;
  activeCalories: number | null;
  note: string;
  createdAt: string;
}

export interface ExerciseResult {
  load: string;
  result: string;
  actualMinutes?: number | null;
  actualKm?: number | null;
}

export interface DailyRecord {
  dateKey: string;
  /**
   * 這筆紀錄最後一次被修改的 ISO 時間（跨瀏覽器同步用）。
   * 舊資料沒有這個欄位，一律視為「最舊」，同步時會被有時間戳的版本蓋過。
   */
  updatedAt?: string;
  checks: Record<string, boolean>;
  weight: number | null;
  waist: number | null;
  sleepHours: number | null;
  steps: number | null;
  /**
   * 手填的正常餐點熱量總數。meals 有明細時就不再參與計算（明細是唯一真相），
   * 但保留原值：把明細刪光就會回到這個數字。
   */
  baseCalories: number | null;
  calorieAdjustment: number;
  /** 手填的全天蛋白質總數。與 baseCalories 同樣的「有明細就讓位」規則。 */
  protein: number | null;
  waterCups: boolean[];
  exerciseResults: Record<string, ExerciseResult>;
  /** 正餐逐筆記錄。空陣列＝這天還是用 baseCalories／protein 的手填總數。 */
  meals: MealEntry[];
  additionalFoods: AdditionalFood[];
  additionalExercises: AdditionalExercise[];
  note: string;
}

export interface Profile {
  /**
   * 個人設定最後一次被修改的 ISO 時間（跨瀏覽器同步用）。
   * 舊資料沒有這個欄位，一律視為「最舊」，同步時會被有時間戳的版本蓋過。
   */
  updatedAt?: string;
  challengeStart: string;
  startWeight: number | null;
  goalWeight: number | null;
  fastingStart: string;
  cupSizeMl: number;
  trackWaist: boolean;
}

export interface AppState {
  version: 1;
  profile: Profile;
  records: Record<string, DailyRecord>;
}
