"use client";

import {
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  categoryForPlannedExercise,
  compareToTarget,
  estimateExerciseCalories,
  resolveWeightKg,
} from "@/src/lib/energy";
import {
  analyzeImpact,
  calculateWeekDeviation,
  type ImpactResult,
} from "@/src/lib/impact";
import {
  addDays,
  CHALLENGE_START,
  getChallengeProgress,
  getChecklistForDate,
  getMondayKey,
  getPlanForDate,
} from "@/src/lib/plan";
import { buildConsultationSummary } from "@/src/lib/summary";
import {
  createInitialState,
  ensureDailyRecord,
  loadState,
  parseImportedState,
  saveState,
  serializeState,
} from "@/src/lib/storage";
import type {
  AdditionalExercise,
  AdditionalFood,
  AppState,
  DailyRecord,
  DayPlan,
  ExerciseCategory,
  ExerciseDefinition,
  TargetRange,
} from "@/src/lib/types";

type Tab = "today" | "week" | "trend" | "settings";

const categoryLabel: Record<ExerciseCategory, string> = {
  walk: "散步",
  yoga: "瑜伽",
  run: "跑步",
  hiit: "HIIT",
  strength: "肌力",
  other: "其他運動",
};

function formatRange(range: TargetRange, unit: string): string {
  return range[0] === range[1] ? `${range[0]} ${unit}` : `${range[0]}–${range[1]} ${unit}`;
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function todayInTaipei(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function dateLabel(dateKey: string, long = false): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("zh-TW", {
    year: long ? "numeric" : undefined,
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function optionalNumber(value: FormDataEntryValue | null): number | null {
  if (value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function randomId(prefix: string): string {
  return `${prefix}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now()}`;
}

function completionForDate(state: AppState, dateKey: string): { completed: number; total: number; percent: number } {
  const tasks = getChecklistForDate(dateKey, 0, { trackWaist: state.profile.trackWaist });
  const record = state.records[dateKey];
  const completed = tasks.filter((task) => record?.checks[task.id]).length;
  return {
    completed,
    total: tasks.length,
    percent: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
  };
}

function groupChecklist<T extends { group: string }>(items: T[]): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  items.forEach((item) => groups.set(item.group, [...(groups.get(item.group) ?? []), item]));
  return Array.from(groups.entries());
}

function effectivePlan(state: AppState, dateKey: string): DayPlan {
  const plan = getPlanForDate(dateKey);
  return {
    ...plan,
    targetCalories: plan.targetCalories + (state.records[dateKey]?.calorieAdjustment ?? 0),
  };
}

const statusLabel: Record<ImpactResult["status"], string> = {
  "needs-estimate": "待估算",
  steady: "不用調整",
  observe: "先觀察",
  adjust: "可分散調整",
  "under-fueled": "不要再減",
};

export default function TrackerApp() {
  const [state, setState] = useState<AppState>(() => createInitialState());
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [dateKey, setDateKey] = useState(CHALLENGE_START);
  const [toast, setToast] = useState("");
  const [exerciseCategory, setExerciseCategory] = useState<ExerciseCategory>("walk");

  useEffect(() => {
    setState(loadState());
    setDateKey(todayInTaipei());
    setHydrated(true);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${basePath}/sw.js`).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (hydrated) saveState(state);
  }, [hydrated, state]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };

  const updateRecord = (updater: (record: DailyRecord) => void) => {
    setState((current) => {
      const ensured = ensureDailyRecord(current, dateKey);
      updater(ensured.record);
      return ensured.state;
    });
  };

  const record = useMemo(
    () => state.records[dateKey] ?? ensureDailyRecord(state, dateKey).record,
    [dateKey, state],
  );
  const plan = useMemo(() => effectivePlan(state, dateKey), [dateKey, state]);
  const checklist = useMemo(
    () => getChecklistForDate(dateKey, record.calorieAdjustment, { trackWaist: state.profile.trackWaist }),
    [dateKey, record.calorieAdjustment, state.profile.trackWaist],
  );
  const weightKg = useMemo(
    () => resolveWeightKg(state.records, dateKey, state.profile),
    [dateKey, state.profile, state.records],
  );
  const completion = useMemo(() => completionForDate(state, dateKey), [dateKey, state]);
  const progress = useMemo(() => getChallengeProgress(dateKey), [dateKey]);
  const previousWeek = useMemo(() => calculateWeekDeviation(state.records, dateKey), [dateKey, state.records]);
  const futurePlans = useMemo(
    () => Array.from({ length: 5 }, (_, index) => effectivePlan(state, addDays(dateKey, index + 1))),
    [dateKey, state],
  );
  const impact = useMemo(() => analyzeImpact({
    plan,
    baseCalories: record.baseCalories,
    additionalFoods: record.additionalFoods,
    additionalExercises: record.additionalExercises,
    previousWeekDeviation: previousWeek.deviation,
    futurePlans,
    weightKg,
  }), [futurePlans, plan, previousWeek.deviation, record, weightKg]);

  const updateProfileNumber = (key: "startWeight" | "goalWeight", value: string) => {
    setState((current) => ({
      ...current,
      profile: { ...current.profile, [key]: value === "" ? null : Number(value) },
    }));
  };

  const toggleTask = (taskId: string) => {
    updateRecord((current) => {
      const nextValue = !current.checks[taskId];
      current.checks[taskId] = nextValue;
      const waterMatch = taskId.match(/^water-cup-(\d)$/);
      if (waterMatch) current.waterCups[Number(waterMatch[1]) - 1] = nextValue;
    });
  };

  const setMetric = (key: "weight" | "waist" | "sleepHours" | "steps" | "baseCalories" | "protein", value: string) => {
    updateRecord((current) => {
      current[key] = value === "" ? null : Number(value);
    });
  };

  const setExerciseResult = (exerciseId: string, key: "load" | "result", value: string) => {
    updateRecord((current) => {
      if (!current.exerciseResults[exerciseId]) current.exerciseResults[exerciseId] = { load: "", result: "" };
      current.exerciseResults[exerciseId][key] = value;
    });
  };

  const setExerciseActual = (exerciseId: string, key: "actualKm" | "actualMinutes", value: string) => {
    updateRecord((current) => {
      if (!current.exerciseResults[exerciseId]) current.exerciseResults[exerciseId] = { load: "", result: "" };
      current.exerciseResults[exerciseId][key] = value === "" ? null : Number(value);
    });
  };

  const addFood = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const name = String(values.get("name") ?? "").trim();
    if (!name) return;
    const food: AdditionalFood = {
      id: randomId("food"),
      name,
      calories: optionalNumber(values.get("calories")),
      protein: optionalNumber(values.get("protein")),
      note: String(values.get("note") ?? "").trim(),
      createdAt: new Date().toISOString(),
    };
    updateRecord((current) => current.additionalFoods.push(food));
    form.reset();
    showToast("額外飲食已加入影響計算");
  };

  const addExercise = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const minutes = Number(values.get("minutes"));
    if (!minutes) return;
    const category = String(values.get("category")) as ExerciseCategory;
    const exercise: AdditionalExercise = {
      id: randomId("exercise"),
      name: categoryLabel[category],
      category,
      minutes,
      distance: optionalNumber(values.get("distance")),
      activeCalories: optionalNumber(values.get("activeCalories")),
      note: String(values.get("note") ?? "").trim(),
      createdAt: new Date().toISOString(),
    };
    updateRecord((current) => current.additionalExercises.push(exercise));
    form.reset();
    setExerciseCategory("walk");
    showToast("額外運動已加入負荷判斷");
  };

  const removeFood = (foodId: string) => {
    if (!window.confirm("移除這筆額外飲食紀錄？")) return;
    updateRecord((current) => {
      current.additionalFoods = current.additionalFoods.filter((food) => food.id !== foodId);
    });
  };

  const removeExercise = (exerciseId: string) => {
    if (!window.confirm("移除這筆額外運動紀錄？")) return;
    updateRecord((current) => {
      current.additionalExercises = current.additionalExercises.filter((exercise) => exercise.id !== exerciseId);
    });
  };

  const applyAdjustments = () => {
    if (!impact.proposedAdjustments.length) return;
    setState((current) => {
      let next = structuredClone(current);
      impact.proposedAdjustments.forEach((adjustment) => {
        const ensured = ensureDailyRecord(next, adjustment.dateKey);
        ensured.record.calorieAdjustment = adjustment.caloriesDelta;
        next = ensured.state;
      });
      return next;
    });
    showToast("已套用到未來日期，可在本週頁取消");
  };

  const copySummary = async () => {
    const summary = buildConsultationSummary({ dateKey, plan, record, impact });
    try {
      await navigator.clipboard.writeText(summary);
      showToast("摘要已複製，回到這個 session 貼上就可以問我");
    } catch {
      window.prompt("複製下面這段文字", summary);
    }
  };

  const downloadBackup = (prefix = "skin-and-bones-100") => {
    const blob = new Blob([serializeState(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${prefix}-${todayInTaipei()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = parseImportedState(await file.text());
      if (!window.confirm("匯入會取代這台裝置目前的紀錄。系統會先自動下載現有備份，確認繼續？")) return;
      downloadBackup("before-import");
      setState(imported);
      showToast("備份已匯入");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "匯入失敗");
    } finally {
      event.target.value = "";
    }
  };

  const selectDate = (nextDateKey: string) => {
    setDateKey(nextDateKey);
    setTab("today");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const renderPlannedExercise = (exercise: ExerciseDefinition) => {
    const results = record.exerciseResults[exercise.id];
    const target = exercise.target;

    if (!target) {
      return (
        <article className="exercise-row" key={exercise.id}>
          <div><strong>{exercise.name}</strong><small>{exercise.prescription}{exercise.note ? `，${exercise.note}` : ""}</small></div>
          <div className="exercise-inputs">
            <input aria-label={`${exercise.name} 重量`} placeholder="重量 kg" value={results?.load ?? ""} onChange={(event) => setExerciseResult(exercise.id, "load", event.target.value)} />
            <input aria-label={`${exercise.name} 實做`} placeholder="實做，例 3×10" value={results?.result ?? ""} onChange={(event) => setExerciseResult(exercise.id, "result", event.target.value)} />
          </div>
        </article>
      );
    }

    const actualKm = results?.actualKm ?? null;
    const actualMinutes = results?.actualMinutes ?? null;
    const estimated = estimateExerciseCalories({
      category: categoryForPlannedExercise(exercise, plan.dayType),
      minutes: actualMinutes,
      km: actualKm,
      weightKg,
    });

    const facts: string[] = [];
    if (target.km) {
      const comparison = compareToTarget(actualKm, target.km);
      facts.push(`目標 ${formatRange(target.km, "km")}${comparison.label ? `，${comparison.label}` : ""}`);
    }
    if (target.minutes) {
      const comparison = compareToTarget(actualMinutes, target.minutes);
      facts.push(`目標 ${formatRange(target.minutes, "分鐘")}${comparison.label ? `，${comparison.label}` : ""}`);
    }
    if (estimated !== null) facts.push(`約 ${estimated} kcal`);

    return (
      <article className="exercise-row" key={exercise.id}>
        <div>
          <strong>{exercise.name}</strong>
          <small>{exercise.prescription}{exercise.note ? `，${exercise.note}` : ""}</small>
          <small>{facts.join(" · ")}</small>
        </div>
        <div className="exercise-inputs">
          {target.km && (
            <input type="number" inputMode="decimal" step="0.1" min="0" aria-label={`${exercise.name} 實際距離`} placeholder="實際 km" value={actualKm ?? ""} onChange={(event) => setExerciseActual(exercise.id, "actualKm", event.target.value)} />
          )}
          <input type="number" inputMode="numeric" step="1" min="0" aria-label={`${exercise.name} 實際分鐘`} placeholder="實際分鐘" value={actualMinutes ?? ""} onChange={(event) => setExerciseActual(exercise.id, "actualMinutes", event.target.value)} />
        </div>
      </article>
    );
  };

  const renderToday = () => (
    <>
      {(state.profile.startWeight === null || state.profile.goalWeight === null) && (
        <section className="setup-card">
          <div>
            <p className="section-kicker">第一次使用</p>
            <h2>先把目標存在這支手機</h2>
            <p>這兩個數字只存在你的瀏覽器，不會進 GitHub。</p>
          </div>
          <div className="setup-fields">
            <label>起始體重 kg<input inputMode="decimal" type="number" step="0.1" value={state.profile.startWeight ?? ""} onChange={(event) => updateProfileNumber("startWeight", event.target.value)} /></label>
            <label>目標體重 kg<input inputMode="decimal" type="number" step="0.1" value={state.profile.goalWeight ?? ""} onChange={(event) => updateProfileNumber("goalWeight", event.target.value)} /></label>
          </div>
        </section>
      )}

      <section className="day-panel">
        <div className="date-switcher">
          <button type="button" onClick={() => setDateKey(addDays(dateKey, -1))} aria-label="前一天">←</button>
          <label>
            <span>{dateLabel(dateKey, true)}</span>
            <input type="date" value={dateKey} onChange={(event) => setDateKey(event.target.value)} />
          </label>
          <button type="button" onClick={() => setDateKey(addDays(dateKey, 1))} aria-label="後一天">→</button>
        </div>

        <div className="target-grid">
          <article><small>今日類型</small><strong>{plan.dayType === "run" ? "跑步／HIIT" : plan.dayType === "strength" ? "肌力" : "恢復"}</strong></article>
          <article><small>熱量目標</small><strong>{plan.targetCalories.toLocaleString("en-US")} kcal</strong>{record.calorieAdjustment !== 0 && <em>已調整 {record.calorieAdjustment} kcal</em>}</article>
          <article><small>蛋白質</small><strong>{plan.proteinTarget}</strong></article>
          <article><small>澱粉熟重</small><strong>{plan.firstStarch} / {plan.dinnerStarch}</strong></article>
        </div>
      </section>

      <section>
        <div className="section-heading split-heading">
          <div><p className="section-kicker">今日數字</p><h2>需要記錄的都有輸入欄位</h2></div>
          <span className="privacy-chip">只存在此裝置</span>
        </div>
        <div className="metric-form-grid">
          <label>晨重<input type="number" inputMode="decimal" step="0.1" placeholder="kg" value={record.weight ?? ""} onChange={(event) => setMetric("weight", event.target.value)} /></label>
          <label>睡眠<input type="number" inputMode="decimal" step="0.1" placeholder="小時" value={record.sleepHours ?? ""} onChange={(event) => setMetric("sleepHours", event.target.value)} /></label>
          <label>正常餐點熱量<input type="number" inputMode="numeric" step="10" placeholder={`不含臨時加餐，目標 ${plan.targetCalories}`} value={record.baseCalories ?? ""} onChange={(event) => setMetric("baseCalories", event.target.value)} /></label>
          <label>全天蛋白質<input type="number" inputMode="numeric" step="1" placeholder="g" value={record.protein ?? ""} onChange={(event) => setMetric("protein", event.target.value)} /></label>
          <label>步數<input type="number" inputMode="numeric" step="100" placeholder="步" value={record.steps ?? ""} onChange={(event) => setMetric("steps", event.target.value)} /></label>
          {state.profile.trackWaist && (
            <label>腰圍<input type="number" inputMode="decimal" step="0.1" placeholder="cm，週日量" value={record.waist ?? ""} onChange={(event) => setMetric("waist", event.target.value)} /></label>
          )}
        </div>
      </section>

      <section>
        <div className="section-heading split-heading">
          <div><p className="section-kicker">Daily checklist</p><h2>今天要做的事</h2></div>
          <div className="completion-ring" style={{ "--progress": `${completion.percent * 3.6}deg` } as CSSProperties}><strong>{completion.percent}%</strong></div>
        </div>
        <div className="progress-line"><i style={{ width: `${completion.percent}%` }} /></div>
        <p className="completion-copy">{completion.completed} / {completion.total} 完成</p>
        <div className="checklist-groups">
          {groupChecklist(checklist).map(([group, tasks]) => (
            <div className="checklist-group" key={group}>
              <h3>{group}</h3>
              {tasks.map((task) => (
                <label className={`check-row ${record.checks[task.id] ? "done" : ""}`} key={task.id}>
                  <input type="checkbox" checked={Boolean(record.checks[task.id])} onChange={() => toggleTask(task.id)} />
                  <span><strong>{task.label}</strong><small>{task.detail}</small></span>
                </label>
              ))}
            </div>
          ))}
        </div>

        <details className="workout-details" open={plan.dayType === "strength"}>
          <summary><span>今日運動內容</span><strong>{plan.workoutName}</strong></summary>
          {plan.dayType === "strength" && (
            <img src={`${basePath}/movements/${plan.workoutName.includes("B") ? "strength-b" : "strength-a"}.png`} alt={`${plan.workoutName} 動作圖解`} />
          )}
          <div className="exercise-list">
            {plan.exercises.map((exercise) => renderPlannedExercise(exercise))}
          </div>
          {plan.dayType === "strength" && (
            <a className="movement-link" href={`${basePath}/movements/pull-up-progression.png`} target="_blank" rel="noreferrer">開啟單槓進階圖解</a>
          )}
        </details>
      </section>

      <section id="additional">
        <div className="section-heading"><p className="section-kicker">臨時變動</p><h2>今天還多吃或多做了什麼？</h2><p>額外項目會改變影響分析，但不會自動篡改你後面的計畫。</p></div>
        <div className="addition-grid">
          <div className="addition-card food-card">
            <h3>加一筆額外飲食</h3>
            <form onSubmit={addFood}>
              <label className="wide">吃了什麼<input name="name" required placeholder="例：布丁、鹽酥雞或半根香蕉" /></label>
              <label>熱量<input name="calories" type="number" inputMode="numeric" placeholder="不知道可留空" /><span>kcal</span></label>
              <label>蛋白質<input name="protein" type="number" inputMode="decimal" step="0.1" placeholder="選填" /><span>g</span></label>
              <label className="wide">備註<input name="note" placeholder="份量、照片特徵或品牌" /></label>
              <button className="primary-button" type="submit">加入飲食</button>
            </form>
            <div className="entry-list">
              {record.additionalFoods.map((food) => (
                <article key={food.id}><div><strong>{food.name}</strong><small>{food.calories === null ? "熱量待估" : `${food.calories} kcal`}{food.protein !== null ? ` · 蛋白質 ${food.protein} g` : ""}</small></div><button type="button" onClick={() => removeFood(food.id)}>移除</button></article>
              ))}
            </div>
          </div>

          <div className="addition-card exercise-card">
            <h3>加一筆額外運動</h3>
            <form onSubmit={addExercise}>
              <label>類型
                <select name="category" value={exerciseCategory} onChange={(event) => setExerciseCategory(event.target.value as ExerciseCategory)}>
                  {(Object.keys(categoryLabel) as ExerciseCategory[]).map((value) => (
                    <option value={value} key={value}>{categoryLabel[value]}</option>
                  ))}
                </select>
              </label>
              <label>時間<input name="minutes" type="number" inputMode="numeric" min="1" required /><span>分鐘</span></label>
              {(exerciseCategory === "run" || exerciseCategory === "walk") && (
                <label>距離<input name="distance" type="number" inputMode="decimal" step="0.1" placeholder="選填" /><span>km</span></label>
              )}
              <label>手錶消耗<input name="activeCalories" type="number" inputMode="numeric" placeholder="選填，會蓋過估算" /><span>kcal</span></label>
              <label className="wide">備註<input name="note" placeholder="酸痛、疲勞或其他狀況" /></label>
              <button className="primary-button" type="submit">加入運動</button>
            </form>
            <div className="entry-list">
              {record.additionalExercises.map((exercise) => {
                const estimated = estimateExerciseCalories({
                  category: exercise.category,
                  minutes: exercise.minutes,
                  km: exercise.distance,
                  weightKg,
                });
                const calories = typeof exercise.activeCalories === "number"
                  ? `${exercise.activeCalories} kcal（手錶）`
                  : estimated !== null ? `約 ${estimated} kcal（估算）` : "";
                const details = [
                  `${exercise.minutes} 分鐘`,
                  exercise.distance !== null ? `${exercise.distance} km` : "",
                  calories,
                ].filter(Boolean).join(" · ");
                return (
                  <article key={exercise.id}><div><strong>{exercise.name || categoryLabel[exercise.category]}</strong><small>{details}</small></div><button type="button" onClick={() => removeExercise(exercise.id)}>移除</button></article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className={`impact-panel status-${impact.status}`}>
        <div className="impact-title"><div><p className="section-kicker">Impact advisor</p><h2>這些變動對後面有什麼影響？</h2></div><span>{statusLabel[impact.status]}</span></div>
        <div className="impact-metrics">
          <article><small>已知當日攝取</small><strong>{impact.intakeCalories.toLocaleString("en-US")} kcal</strong>{impact.usedTargetAsBase && <em>正常餐點未填，先用目標估算</em>}</article>
          <article><small>當日與目標差</small><strong>{impact.intakeDeviation >= 0 ? "+" : ""}{impact.intakeDeviation} kcal</strong></article>
          <article><small>本週累積差</small><strong>{impact.weekDeviation >= 0 ? "+" : ""}{impact.weekDeviation} kcal</strong></article>
          <article><small>額外運動活動消耗</small><strong>{impact.reportedExerciseCalories || 0} kcal</strong><em>只顯示，不 1 比 1 抵消</em></article>
        </div>
        <p className="impact-message">{impact.message}</p>
        {impact.recoveryWarning && <p className="recovery-warning"><strong>恢復提醒：</strong>{impact.recoveryWarning}</p>}
        {impact.proposedAdjustments.length > 0 && (
          <div className="proposal-box">
            <h3>可選的分散調整</h3>
            <p>這不是懲罰，也不需要一次追平。跑步日不會被排入。</p>
            <div className="proposal-list">
              {impact.proposedAdjustments.map((adjustment) => (
                <article key={adjustment.dateKey}><strong>{dateLabel(adjustment.dateKey)}</strong><span>{adjustment.caloriesDelta} kcal</span><small>{adjustment.reason}</small></article>
              ))}
            </div>
            {impact.unallocatedCalories > 0 && <p className="unallocated">還有 {impact.unallocatedCalories} kcal 沒有追平，先留給整週趨勢判斷。</p>}
            <button className="primary-button" type="button" onClick={applyAdjustments}>我確認，套用到未來日期</button>
          </div>
        )}
        <div className="consult-box"><div><strong>還是拿不準？</strong><small>把當天紀錄、影響與問題整理成一段文字。</small></div><button type="button" onClick={copySummary}>複製摘要回 session 問閆多比</button></div>
      </section>
    </>
  );

  const renderWeek = () => {
    const monday = getMondayKey(dateKey);
    const dates = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
    return (
      <section className="week-page">
        <div className="section-heading"><p className="section-kicker">Weekly view</p><h2>{dateLabel(monday)} 這一週</h2><p>點任一天回到 Checklist，已套用的熱量調整也會標出。</p></div>
        <div className="week-cards">
          {dates.map((key) => {
            const itemPlan = effectivePlan(state, key);
            const itemRecord = state.records[key];
            const itemCompletion = completionForDate(state, key);
            return (
              <article className={key === dateKey ? "selected" : ""} key={key}>
                <button className="week-card-main" type="button" onClick={() => selectDate(key)}>
                  <span>{dateLabel(key)}</span>
                  <strong>{itemPlan.workoutName}</strong>
                  <small>{itemPlan.targetCalories.toLocaleString("en-US")} kcal · 澱粉 {itemPlan.firstStarch} / {itemPlan.dinnerStarch}</small>
                  <i><b style={{ width: `${itemCompletion.percent}%` }} /></i>
                  <em>{itemCompletion.completed} / {itemCompletion.total} 完成</em>
                </button>
                {itemRecord?.calorieAdjustment !== 0 && itemRecord?.calorieAdjustment !== undefined && (
                  <div className="applied-adjustment"><span>已調整 {itemRecord.calorieAdjustment} kcal</span><button type="button" onClick={() => setState((current) => {
                    const ensured = ensureDailyRecord(current, key);
                    ensured.record.calorieAdjustment = 0;
                    return ensured.state;
                  })}>取消</button></div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    );
  };

  const renderTrend = () => {
    const trackWaist = state.profile.trackWaist;
    const records = Object.values(state.records)
      .filter((item) => item.weight !== null || (trackWaist && item.waist !== null) || item.steps !== null)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
      .slice(0, 30);
    const weights = records.filter((item) => item.weight !== null);
    const latestWeight = weights[0]?.weight ?? null;
    const earliestWeight = weights.at(-1)?.weight ?? null;
    const weightChange = latestWeight !== null && earliestWeight !== null ? latestWeight - earliestWeight : null;
    const weekMonday = getMondayKey(dateKey);
    const weekWeights = Object.values(state.records)
      .filter((item) => item.dateKey >= weekMonday && item.dateKey <= addDays(weekMonday, 6) && item.weight !== null)
      .map((item) => item.weight as number);
    const weekAverage = weekWeights.length ? weekWeights.reduce((sum, value) => sum + value, 0) / weekWeights.length : null;

    return (
      <section className="trend-page">
        <div className="section-heading"><p className="section-kicker">Trend</p><h2>看趨勢，不被單日數字騙</h2></div>
        <div className="trend-summary">
          <article><small>最新體重</small><strong>{latestWeight === null ? "尚未記錄" : `${latestWeight.toFixed(1)} kg`}</strong></article>
          <article><small>本週晨重平均</small><strong>{weekAverage === null ? "尚未記錄" : `${weekAverage.toFixed(2)} kg`}</strong></article>
          <article><small>目前紀錄區間變化</small><strong>{weightChange === null ? "資料不足" : `${weightChange > 0 ? "+" : ""}${weightChange.toFixed(1)} kg`}</strong></article>
        </div>
        <div className="history-list">
          {records.length === 0 && <p className="empty-state">開始記錄晨重{trackWaist ? "、腰圍" : ""}或步數後，這裡會自動形成時間線。</p>}
          {records.map((item) => (
            <article key={item.dateKey}><time>{dateLabel(item.dateKey)}</time><div>{item.weight !== null && <span><small>體重</small><strong>{item.weight.toFixed(1)} kg</strong></span>}{trackWaist && item.waist !== null && <span><small>腰圍</small><strong>{item.waist.toFixed(1)} cm</strong></span>}{item.steps !== null && <span><small>步數</small><strong>{item.steps.toLocaleString("en-US")}</strong></span>}</div></article>
          ))}
        </div>
      </section>
    );
  };

  const renderSettings = () => (
    <section className="settings-page">
      <div className="section-heading"><p className="section-kicker">Settings & backup</p><h2>設定、備份與隱私</h2></div>
      <div className="settings-grid">
        <article>
          <h3>個人目標</h3>
          <label>起始體重<input type="number" step="0.1" value={state.profile.startWeight ?? ""} onChange={(event) => updateProfileNumber("startWeight", event.target.value)} /><span>kg</span></label>
          <label>目標體重<input type="number" step="0.1" value={state.profile.goalWeight ?? ""} onChange={(event) => updateProfileNumber("goalWeight", event.target.value)} /><span>kg</span></label>
          <label>水杯容量<input type="number" step="50" value={state.profile.cupSizeMl} onChange={(event) => setState((current) => ({ ...current, profile: { ...current.profile, cupSizeMl: Number(event.target.value) } }))} /><span>ml</span></label>
          <label>開始空腹時間<input type="time" value={state.profile.fastingStart} onChange={(event) => setState((current) => ({ ...current, profile: { ...current.profile, fastingStart: event.target.value } }))} /></label>
        </article>
        <article>
          <h3>追蹤項目</h3>
          <p>只留下你真的會記錄的欄位，關掉的項目不會出現在清單與輸入區。</p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={Boolean(state.profile.trackWaist)}
              onChange={(event) => setState((current) => ({
                ...current,
                profile: { ...current.profile, trackWaist: event.target.checked },
              }))}
            />
            <span><strong>追蹤腰圍</strong><small>關掉時，今天頁不顯示腰圍欄位，週日清單也不會出現量腰圍。已經記錄過的腰圍資料一律保留，打開就看得到。</small></span>
          </label>
        </article>
        <article>
          <h3>備份與還原</h3>
          <p>資料只存在這個瀏覽器。建議每週下載一份 JSON 到 iCloud Drive。</p>
          <button className="primary-button" type="button" onClick={() => downloadBackup()}>下載 JSON 備份</button>
          <label className="file-button">匯入備份或舊版資料<input type="file" accept="application/json,.json" onChange={importBackup} /></label>
          <small>匯入前會自動下載現有資料，避免意外覆寫。</small>
        </article>
        <article>
          <h3>加入 iPhone 主畫面</h3>
          <ol><li>用 Safari 開啟這個網站。</li><li>點下方的「分享」。</li><li>選「加入主畫面」。</li></ol>
          <p>第一次開啟後，網路不穩時仍可開啟已快取的頁面。</p>
        </article>
        <article>
          <h3>隱私與安全</h3>
          <p>GitHub 只公開網站程式。體重、腰圍、飲食與運動紀錄不會上傳。</p>
          <p>這是個人生活追蹤工具，不是醫療診斷。若出現昏眩、胸痛、持續劇痛或其他明顯不適，停止運動並尋求專業協助。</p>
        </article>
      </div>
    </section>
  );

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-topline"><span>100-DAY TRANSFORMATION EXPERIMENT</span><span className="local-only">● 本機儲存</span></div>
        <h1>Skin &amp; Bones<br />in 100 Days</h1>
        <p>別追求每天完美。記錄變化，看懂影響，再做一個可以持續的調整。</p>
        <div className="challenge-progress"><div><strong>{progress.status === "upcoming" ? "尚未開始" : progress.status === "complete" ? "100 天已完成" : `DAY ${progress.day}`}</strong><span>{dateLabel(dateKey)}</span></div><i><b style={{ width: `${progress.status === "upcoming" ? 0 : progress.day}%` }} /></i></div>
      </header>

      <nav className="top-nav" aria-label="主選單">
        {([["today", "今天"], ["week", "本週"], ["trend", "趨勢"], ["settings", "設定"]] as Array<[Tab, string]>).map(([key, label]) => (
          <button type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)} key={key}>{label}</button>
        ))}
      </nav>

      <main>
        {!hydrated && <div className="loading-card">正在載入這台裝置的紀錄…</div>}
        {hydrated && tab === "today" && renderToday()}
        {hydrated && tab === "week" && renderWeek()}
        {hydrated && tab === "trend" && renderTrend()}
        {hydrated && tab === "settings" && renderSettings()}
      </main>

      <footer><strong>Skin &amp; Bones in 100 Days</strong><span>個人生活紀錄與實驗，不是醫療建議。</span></footer>
      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}
