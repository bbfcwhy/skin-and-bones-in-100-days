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
  baseCalories: number | null;
  calorieAdjustment: number;
  protein: number | null;
  waterCups: boolean[];
  exerciseResults: Record<string, ExerciseResult>;
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
