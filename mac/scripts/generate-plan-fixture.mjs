#!/usr/bin/env node
// 用 node 跑 vault 計畫頁的 <script>，逐日算出週課表、熱量、A/B 與第幾天，
// 存成 Swift 測試的 fixture。計畫頁改版後重跑這支，再跑 Swift 測試：
//   node mac/scripts/generate-plan-fixture.mjs
// 每一天都重新執行一次整段 script，並把「今天」固定在那天中午，
// 所以第幾天的文字也是計畫頁自己算出來的，不是這支腳本重寫的邏輯。
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

process.env.TZ = 'Asia/Taipei';
if (new Date(2026, 7, 10).getTimezoneOffset() !== -480) {
  console.error('時區沒有切到 Asia/Taipei，停止產生 fixture');
  process.exit(1);
}

const PLAN_RELATIVE = '100_Todo/projects/健康管理/2026-08-09_內臟脂肪減脂週計畫.html';
const PLAN_PATH = process.env.PLAN_PAGE
  ?? `${process.env.HOME}/Library/Mobile Documents/iCloud~md~obsidian/Documents/2nd Brain/${PLAN_RELATIVE}`;
const OUT_PATH = process.argv[2]
  ?? new URL('../SkinAndBonesTests/Fixtures/plan-fixture.json', import.meta.url);
const FIRST_DAY = [2026, 10, 1];
const LAST_DAY = [2026, 11, 17];

const html = readFileSync(PLAN_PATH, 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
if (scripts.length !== 1) {
  console.error(`計畫頁應該只有 1 段 <script>，實際 ${scripts.length} 段`);
  process.exit(1);
}
const script = scripts[0];

function makeDocument() {
  const elements = new Map();
  const makeElement = () => ({
    textContent: '',
    innerHTML: '',
    value: '',
    hidden: false,
    style: {},
    classList: { add() {}, remove() {} },
    addEventListener() {}
  });
  return {
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, makeElement());
      return elements.get(selector);
    }
  };
}

function makeFrozenDate(now) {
  return class FrozenDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(now);
      else super(...args);
    }

    static now() {
      return now;
    }
  };
}

function expectationsFor(year, month, day) {
  const document = makeDocument();
  const now = new Date(year, month - 1, day, 12, 0, 0).getTime();
  const context = vm.createContext({
    document,
    navigator: {},
    window: { setTimeout() {} },
    Date: makeFrozenDate(now)
  });
  vm.runInContext(script, context);
  const result = vm.runInContext(`(() => {
    const date = new Date(${year}, ${month - 1}, ${day});
    const workout = getWorkoutForDate(date);
    const overview = getWeeklyOverview(date);
    const nutrition = getNutritionTargets(workout);
    const strength = workout.title.match(/肌力 ([AB])/);
    return {
      date: toDateKey(date),
      weekday: weekdayNames[(date.getDay() + 6) % 7],
      workoutLabel: overview.workoutLabel,
      workoutNote: overview.workoutNote,
      strengthType: strength ? strength[1] : null,
      dayType: nutrition.dayType,
      calorieLabel: nutrition.calorieLabel
    };
  })()`, context);
  return { ...result, progressText: document.querySelector('#hundredDayProgress').textContent };
}

const days = [];
const cursor = new Date(FIRST_DAY[0], FIRST_DAY[1] - 1, FIRST_DAY[2]);
const last = new Date(LAST_DAY[0], LAST_DAY[1] - 1, LAST_DAY[2]);
while (cursor <= last) {
  days.push(expectationsFor(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate()));
  cursor.setDate(cursor.getDate() + 1);
}

const fixture = {
  source: PLAN_RELATIVE,
  scriptSha256: createHash('sha256').update(script).digest('hex'),
  timeZone: 'Asia/Taipei',
  days
};
writeFileSync(OUT_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`已寫入 ${days.length} 天：${days[0].date} 到 ${days.at(-1).date}`);
