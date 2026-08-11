import type { AppState, DailyRecord } from "./types";

export const STORAGE_KEY = "skin-and-bones-100-state-v1";

function defaultRecord(dateKey: string): DailyRecord {
  return {
    dateKey,
    checks: {},
    weight: null,
    waist: null,
    sleepHours: null,
    steps: null,
    baseCalories: null,
    calorieAdjustment: 0,
    protein: null,
    waterCups: [false, false, false],
    exerciseResults: {},
    additionalFoods: [],
    additionalExercises: [],
    note: "",
  };
}

export function createInitialState(): AppState {
  return {
    version: 1,
    profile: {
      challengeStart: "2026-08-10",
      startWeight: null,
      goalWeight: null,
      fastingStart: "20:00",
      cupSizeMl: 700,
      trackWaist: false,
    },
    records: {},
  };
}

/**
 * 只補值、不刪值：舊備份缺少後來才加的欄位時填上預設值，
 * 已經存在的資料一律原封不動保留。加新欄位時只要改
 * createInitialState 與 defaultRecord，這裡就會自動接住舊資料。
 */
export function normalizeState(input: AppState): AppState {
  const fallback = createInitialState();
  const state = structuredClone(input);
  const records: AppState["records"] = {};

  Object.entries(state.records ?? {}).forEach(([dateKey, saved]) => {
    const record = (saved ?? {}) as Partial<DailyRecord>;
    records[dateKey] = { ...defaultRecord(record.dateKey ?? dateKey), ...record };
  });

  return {
    ...fallback,
    ...state,
    profile: { ...fallback.profile, ...state.profile },
    records,
  };
}

export function ensureDailyRecord(input: AppState, dateKey: string): { state: AppState; record: DailyRecord } {
  const state = structuredClone(input);
  if (!state.records[dateKey]) state.records[dateKey] = defaultRecord(dateKey);
  return { state, record: state.records[dateKey] };
}

export function serializeState(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

function numeric(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function importLegacyState(input: Record<string, unknown>): AppState {
  const state = createInitialState();
  const checklistState = (input.checklistState ?? {}) as Record<string, Record<string, boolean>>;
  const recordState = (input.recordState ?? {}) as Record<string, Record<string, Record<string, unknown>>>;
  const dateKeys = new Set([...Object.keys(checklistState), ...Object.keys(recordState)]);

  dateKeys.forEach((dateKey) => {
    const ensured = ensureDailyRecord(state, dateKey);
    Object.assign(state, ensured.state);
    const record = state.records[dateKey];
    const legacyChecks = checklistState[dateKey] ?? {};
    record.checks = Object.fromEntries(
      Object.entries(legacyChecks).filter(([taskId]) => taskId !== "optional-latte"),
    );
    record.waterCups = [1, 2, 3].map((cup) => Boolean(legacyChecks[`water-cup-${cup}`]));

    const legacyRecords = recordState[dateKey] ?? {};
    record.weight = numeric(legacyRecords["morning-weight"]?.weight);
    record.sleepHours = numeric(legacyRecords["sleep-total"]?.hours);
    record.steps = numeric(legacyRecords["daily-steps"]?.steps);
    record.baseCalories = numeric(legacyRecords["calorie-target"]?.calories);
    record.protein = numeric(legacyRecords["protein-total"]?.protein);
    const waist1 = numeric(legacyRecords["weekly-waist"]?.waist1);
    const waist2 = numeric(legacyRecords["weekly-waist"]?.waist2);
    record.waist = waist1 !== null && waist2 !== null ? (waist1 + waist2) / 2 : waist1 ?? waist2;

    if (legacyChecks["optional-latte"]) {
      record.additionalFoods.push({
        id: `legacy-latte-${dateKey}`,
        name: "下午拿鐵",
        calories: 150,
        protein: 7,
        note: "從舊版 Checklist 匯入",
        createdAt: `${dateKey}T15:00:00.000+08:00`,
      });
    }

    Object.entries(legacyRecords)
      .filter(([taskId, values]) => taskId.startsWith("workout-") && (values.load || values.result))
      .forEach(([taskId, values]) => {
        record.exerciseResults[taskId.replace(/^workout-/, "")] = {
          load: String(values.load ?? ""),
          result: String(values.result ?? ""),
        };
      });
  });

  return state;
}

function isCurrentState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AppState>;
  return candidate.version === 1
    && typeof candidate.profile === "object"
    && candidate.profile !== null
    && typeof candidate.records === "object"
    && candidate.records !== null;
}

export function parseImportedState(json: string): AppState {
  let input: unknown;
  try {
    input = JSON.parse(json);
  } catch {
    throw new Error("無法辨識這份備份，檔案不是有效 JSON。");
  }

  if (isCurrentState(input)) return normalizeState(input);
  if (
    input
    && typeof input === "object"
    && (input as Record<string, unknown>).exportVersion === "daily-checklist-export-v1"
  ) {
    return normalizeState(importLegacyState(input as Record<string, unknown>));
  }
  throw new Error("無法辨識這份備份的版本。");
}

export function loadState(): AppState {
  if (typeof window === "undefined") return createInitialState();
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) return createInitialState();
  try {
    return parseImportedState(saved);
  } catch {
    return createInitialState();
  }
}

export function saveState(state: AppState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, serializeState(state));
}
