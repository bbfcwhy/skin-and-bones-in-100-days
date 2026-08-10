export type DayType = "run" | "strength" | "recovery";

export type ExerciseIntensity = "low" | "moderate" | "high";

export type ExerciseArea = "lower" | "upper" | "full";

export interface ExerciseDefinition {
  id: string;
  name: string;
  prescription: string;
  note?: string;
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

export interface AdditionalExercise {
  id: string;
  name: string;
  category: "walk" | "yoga" | "run" | "hiit" | "strength" | "other";
  minutes: number;
  distance: number | null;
  intensity: ExerciseIntensity;
  area: ExerciseArea;
  activeCalories: number | null;
  note: string;
  createdAt: string;
}

export interface ExerciseResult {
  load: string;
  result: string;
}

export interface DailyRecord {
  dateKey: string;
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
  challengeStart: string;
  startWeight: number | null;
  goalWeight: number | null;
  fastingStart: string;
  cupSizeMl: number;
}

export interface AppState {
  version: 1;
  profile: Profile;
  records: Record<string, DailyRecord>;
}
