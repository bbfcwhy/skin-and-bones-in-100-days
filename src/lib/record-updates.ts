/**
 * 修改狀態的唯一入口。
 *
 * 為什麼要有這一層：跨瀏覽器同步靠 updatedAt 判斷誰比較新，
 * 只要有任何一條修改路徑忘了蓋時間戳，那筆資料在同步時就會被判成「最舊」而被蓋掉。
 * 所以 UI 一律只透過這兩個函式改資料，蓋章的事在這裡做一次就好。
 */
import { ensureDailyRecord } from "./storage";
import { stampProfile, stampRecord } from "./sync";
import type { AppState, DailyRecord, Profile } from "./types";

/**
 * 改某一天的紀錄並蓋上時間戳。傳進來的 state 不會被就地修改。
 * mutate 直接改傳進去的 record 物件即可（那是一份拷貝）。
 */
export function applyRecordUpdate(
  state: AppState,
  dateKey: string,
  mutate: (record: DailyRecord) => void,
  now: string = new Date().toISOString(),
): AppState {
  const ensured = ensureDailyRecord(state, dateKey);
  mutate(ensured.record);
  ensured.state.records[dateKey] = stampRecord(ensured.record, now);
  return ensured.state;
}

/** 改個人設定並蓋上時間戳。傳進來的 state 不會被就地修改。 */
export function applyProfileUpdate(
  state: AppState,
  patch: Partial<Profile>,
  now: string = new Date().toISOString(),
): AppState {
  return {
    ...state,
    profile: stampProfile({ ...state.profile, ...patch }, now),
  };
}
