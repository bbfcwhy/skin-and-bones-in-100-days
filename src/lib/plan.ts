import type { ChecklistTask, DayPlan, DayType, ExerciseDefinition } from "./types";

export const CHALLENGE_START = "2026-08-10";
export const CHALLENGE_LAST_DAY = "2026-11-17";
export const FINAL_MEASUREMENT_DAY = "2026-11-18";

const strengthA: ExerciseDefinition[] = [
  { id: "goblet-squat", name: "高腳杯深蹲", prescription: "4 組 × 8 到 12 下", note: "第 1 到 2 週先做 3 組" },
  { id: "floor-press", name: "啞鈴地板臥推", prescription: "4 組 × 8 到 12 下", note: "第 1 到 2 週先做 3 組" },
  { id: "one-arm-row", name: "單手啞鈴划船", prescription: "4 組 × 每側 10 到 15 下" },
  { id: "romanian-deadlift", name: "啞鈴羅馬尼亞硬舉", prescription: "3 組 × 8 到 12 下" },
  { id: "shoulder-press", name: "啞鈴肩推", prescription: "3 組 × 8 到 12 下" },
  { id: "plank", name: "平板撐", prescription: "3 組 × 30 到 60 秒" },
  { id: "pullup-progression", name: "單槓進階", prescription: "2 組", note: "懸垂、肩胛引體或離心引體" },
];

const strengthB: ExerciseDefinition[] = [
  { id: "split-squat", name: "保加利亞分腿蹲", prescription: "4 組 × 每側 8 到 12 下", note: "第 1 到 2 週先做 3 組" },
  { id: "glute-bridge", name: "啞鈴臀橋", prescription: "3 組 × 10 到 15 下" },
  { id: "pushup", name: "伏地挺身", prescription: "4 組 × 8 到 15 下" },
  { id: "bent-row", name: "俯身雙手啞鈴划船", prescription: "4 組 × 10 到 15 下" },
  { id: "kettlebell-deadlift", name: "壺鈴硬舉", prescription: "2 組 × 10 到 15 下" },
  { id: "side-plank", name: "側平板", prescription: "3 組 × 每側 20 到 45 秒" },
  { id: "pullup-progression", name: "單槓進階", prescription: "2 組", note: "懸垂、肩胛引體或離心引體" },
];

const specialWeek: Record<string, Pick<DayPlan, "dayType" | "workoutName" | "workoutNote" | "exercises">> = {
  "2026-08-10": {
    dayType: "run",
    workoutName: "富士山半馬累積跑 8 km",
    workoutNote: "輕鬆配速，完成後確認 TATTA 入帳",
    exercises: [{ id: "fuji-run", name: "輕鬆跑", prescription: "8 km", target: { km: [8, 8] } }],
  },
  "2026-08-11": {
    dayType: "recovery",
    workoutName: "跑後恢復瑜伽",
    workoutNote: "30 分鐘低強度恢復",
    exercises: [{ id: "recovery-yoga", name: "Gentle、Hatha 或 Yin yoga", prescription: "30 分鐘", target: { minutes: [30, 30] } }],
  },
  "2026-08-12": {
    dayType: "run",
    workoutName: "富士山半馬累積跑 7 km",
    workoutNote: "輕鬆配速，完成後確認 TATTA 入帳",
    exercises: [{ id: "fuji-run", name: "輕鬆跑", prescription: "7 km", target: { km: [7, 7] } }],
  },
  "2026-08-13": {
    dayType: "run",
    workoutName: "富士山半馬累積跑 6.1 km",
    workoutNote: "目標提前完成 21.0975 km",
    exercises: [{ id: "fuji-run", name: "輕鬆跑", prescription: "6.1 km", target: { km: [6.1, 6.1] } }],
  },
  "2026-08-14": {
    dayType: "recovery",
    workoutName: "半馬里程完成後恢復",
    workoutNote: "瑜伽 30 分鐘，不追求高心率",
    exercises: [{ id: "recovery-yoga", name: "恢復瑜伽", prescription: "30 分鐘", target: { minutes: [30, 30] } }],
  },
  "2026-08-15": {
    dayType: "strength",
    workoutName: "肌力 A 降載版",
    workoutNote: "本週所有動作先做 3 組",
    exercises: strengthA,
  },
  "2026-08-16": {
    dayType: "recovery",
    workoutName: "週末恢復瑜伽",
    workoutNote: "30 分鐘低強度恢復",
    exercises: [{ id: "recovery-yoga", name: "恢復瑜伽", prescription: "30 分鐘", target: { minutes: [30, 30] } }],
  },
};

const nutritionByType: Record<DayType, Pick<DayPlan, "targetCalories" | "proteinTarget" | "vegetableTarget" | "firstStarch" | "dinnerStarch">> = {
  run: {
    targetCalories: 2050,
    proteinTarget: "140 到 150 g",
    vegetableTarget: "450 到 600 g",
    firstStarch: "200 到 250 g",
    dinnerStarch: "150 到 200 g",
  },
  strength: {
    targetCalories: 1950,
    proteinTarget: "140 到 150 g",
    vegetableTarget: "450 到 600 g",
    firstStarch: "150 到 200 g",
    dinnerStarch: "120 到 150 g",
  },
  recovery: {
    targetCalories: 1850,
    proteinTarget: "140 到 150 g",
    vegetableTarget: "450 到 600 g",
    firstStarch: "100 到 150 g",
    dinnerStarch: "80 到 120 g",
  },
};

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function calendarDayDifference(dateKey: string, startKey: string): number {
  return Math.round((parseDateKey(dateKey).getTime() - parseDateKey(startKey).getTime()) / 86400000);
}

function standardWorkout(dateKey: string): Pick<DayPlan, "dayType" | "workoutName" | "workoutNote" | "exercises"> {
  const date = parseDateKey(dateKey);
  const mondayIndex = (date.getUTCDay() + 6) % 7;
  const weekNumber = Math.floor(calendarDayDifference(dateKey, CHALLENGE_START) / 7);
  const fridayPlan = weekNumber % 2 === 0 ? strengthA : strengthB;
  const fridayName = weekNumber % 2 === 0 ? "肌力 A" : "肌力 B";

  const workouts: Array<Pick<DayPlan, "dayType" | "workoutName" | "workoutNote" | "exercises">> = [
    { dayType: "strength", workoutName: "肌力 A", workoutNote: "50 到 60 分鐘，保留 1 到 2 下餘力", exercises: strengthA },
    { dayType: "run", workoutName: "輕鬆跑", workoutNote: "5 到 7 km，維持可講完整句子的速度", exercises: [{ id: "easy-run", name: "輕鬆跑", prescription: "5 到 7 km", target: { km: [5, 7] } }] },
    { dayType: "strength", workoutName: "肌力 B", workoutNote: "50 到 60 分鐘，保留 1 到 2 下餘力", exercises: strengthB },
    { dayType: "recovery", workoutName: "恢復瑜伽", workoutNote: "30 分鐘低強度恢復", exercises: [{ id: "recovery-yoga", name: "Gentle、Hatha 或 Yin yoga", prescription: "30 分鐘", target: { minutes: [30, 30] } }] },
    { dayType: "strength", workoutName: fridayName, workoutNote: "50 到 60 分鐘，A / B 每週交替", exercises: fridayPlan },
    { dayType: "run", workoutName: "長跑或 HIIT", workoutNote: "輕鬆跑 7 到 10 km，或隔週 HIIT 20 到 30 分鐘", exercises: [{ id: "long-run-or-hiit", name: "長跑或 HIIT", prescription: "二選一", target: { km: [7, 10] } }] },
    { dayType: "recovery", workoutName: "恢復瑜伽或散步", workoutNote: "瑜伽 20 分鐘加散步 10 分鐘也可以", exercises: [{ id: "recovery-session", name: "恢復活動", prescription: "30 分鐘", target: { minutes: [30, 30] } }] },
  ];

  return workouts[mondayIndex];
}

export function getPlanForDate(dateKey: string): DayPlan {
  const workout = specialWeek[dateKey] ?? standardWorkout(dateKey);
  return {
    dateKey,
    ...workout,
    ...nutritionByType[workout.dayType],
  };
}

export function getChallengeProgress(dateKey: string): { day: number; status: "upcoming" | "active" | "complete" } {
  const difference = calendarDayDifference(dateKey, CHALLENGE_START);
  if (difference < 0) return { day: 0, status: "upcoming" };
  if (dateKey > CHALLENGE_LAST_DAY) return { day: 100, status: "complete" };
  return { day: Math.min(difference + 1, 100), status: "active" };
}

export interface ChecklistOptions {
  trackWaist?: boolean;
}

export function getChecklistForDate(
  dateKey: string,
  calorieAdjustment = 0,
  options: ChecklistOptions = {},
): ChecklistTask[] {
  const plan = getPlanForDate(dateKey);
  const effectiveCalories = plan.targetCalories + calorieAdjustment;
  const tasks: ChecklistTask[] = [
    { id: "morning-weight", group: "早晨", label: "起床後量體重", detail: "上完廁所、進食喝水前量測" },
    { id: "sleep-total", group: "早晨", label: "睡眠至少 7 小時", detail: "記錄昨晚實際睡眠時數" },
    { id: "water-cup-1", group: "早晨", label: "喝完第 1 杯水", detail: "700 ml，累積 700 ml" },
    { id: "first-protein", group: "12:00 第一餐", label: "蛋白質 55 到 65 g", detail: "雞胸、魚、蛋、豆腐或乳清搭配" },
    { id: "first-vegetables", group: "12:00 第一餐", label: "蔬菜約 200 g", detail: "高麗菜可保留，補上深綠、菇類或彩色蔬菜" },
    { id: "first-starch", group: "12:00 第一餐", label: `熟重澱粉 ${plan.firstStarch}`, detail: "地瓜、飯、馬鈴薯或燕麥擇一" },
    { id: "vitamins-b-c", group: "12:00 第一餐", label: "餐後 B 群與維他命 C", detail: "不空腹吃" },
    { id: "first-walk", group: "12:00 第一餐", label: "餐後走路 10 到 15 分鐘", detail: "輕鬆走即可" },
    { id: "water-cup-2", group: "12:00 第一餐", label: "喝完第 2 杯水", detail: "700 ml，累積 1.4 L" },
    { id: "protein-snack", group: "15:00 蛋白質補位", label: "確認補足蛋白質 20 到 30 g", detail: "乳清、無糖豆漿或高蛋白優格" },
    { id: "planned-workout", group: "16:00 今日運動", label: plan.workoutName, detail: plan.workoutNote },
    { id: "dinner-protein", group: "晚餐", label: "蛋白質 50 到 60 g", detail: "與第一餐和補位共同達成全天目標" },
    { id: "dinner-vegetables", group: "晚餐", label: "蔬菜約 250 g", detail: "全天目標 450 到 600 g" },
    { id: "dinner-starch", group: "晚餐", label: `熟重澱粉 ${plan.dinnerStarch}`, detail: "跑步日不把恢復用澱粉全部拿掉" },
    { id: "evening-supplements", group: "晚餐", label: "餐後魚油、葉黃素與肌酸", detail: "肌酸 3 到 5 g，每天固定補充" },
    { id: "dinner-walk", group: "晚餐", label: "餐後走路 10 到 15 分鐘", detail: "當成低負擔日常活動" },
    { id: "protein-total", group: "全天收尾", label: `全天蛋白質 ${plan.proteinTarget}`, detail: "不足用無糖豆漿、優格或乳清補齊" },
    { id: "calorie-target", group: "全天收尾", label: `全天熱量 ${effectiveCalories.toLocaleString("en-US")} kcal`, detail: calorieAdjustment === 0 ? "允許約 ±100 kcal 的日常波動" : `已確認套用 ${calorieAdjustment} kcal 的分散調整` },
    { id: "daily-steps", group: "全天收尾", label: "至少 8,000 步", detail: "用飯後散步與零碎走動補足" },
    { id: "water-cup-3", group: "全天收尾", label: "喝完第 3 杯水", detail: "700 ml，全天累積 2.1 L" },
    { id: "fasting-start", group: "全天收尾", label: "20:00 前停止進食", detail: "開始 16:8 空腹時段" },
  ];

  if (parseDateKey(dateKey).getUTCDay() === 0) {
    const sundayTasks: ChecklistTask[] = [];
    if (options.trackWaist) {
      sundayTasks.push({ id: "weekly-waist", group: "早晨", label: "量腰圍 2 次並取平均", detail: "正常吐氣結束時量測" });
    }
    sundayTasks.push({ id: "weekly-trend-review", group: "早晨", label: "檢查 7 天平均體重", detail: "連續 2 週後才決定是否以 150 kcal 為單位調整" });
    tasks.splice(1, 0, ...sundayTasks);
  }

  return tasks;
}

export function addDays(dateKey: string, amount: number): string {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function getMondayKey(dateKey: string): string {
  const date = parseDateKey(dateKey);
  const offset = (date.getUTCDay() + 6) % 7;
  return addDays(dateKey, -offset);
}
