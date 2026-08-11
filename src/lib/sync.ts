/**
 * 跨瀏覽器同步的純邏輯層。
 *
 * 這個檔案只做「兩份資料怎麼合併」與「送出／收回的 payload 長什麼樣」，
 * 不碰 localStorage、不碰 UI、不發 request——網路呼叫與畫面接線由外層負責。
 *
 * 資料模型：AppState 的 profile 與每一筆 DailyRecord 各自帶一個 optional 的
 * `updatedAt`（ISO 字串）。沒有 updatedAt 的資料一律視為「最舊」，
 * 因為舊版 localStorage 備份不會有這個欄位。
 *
 * 合併規則（three-way 的簡化版，last-write-wins）：
 * 1. 逐 dateKey 比 updatedAt，新的贏；只存在單邊的鍵一定保留（合併不丟資料）。
 * 2. 時間戳相同（含兩邊都沒有）時取 local；內容不同的話會標記成 localNewer，
 *    讓呼叫端把 local 推上去，避免兩邊永遠停在不同版本。
 * 3. profile 用同一套規則比較，結果放在 profileSource。
 */
import { normalizeState } from "./storage";
import type { AppState, DailyRecord, Profile } from "./types";

/** 沒有 updatedAt 的資料在送上伺服器時補的時間戳，代表「最舊」。 */
export const EPOCH_ISO = "1970-01-01T00:00:00.000Z";

/** 伺服器上一筆每日紀錄的信封格式（payload 是 DailyRecord 的 JSON 字串）。 */
export interface SyncRecordEnvelope {
  dateKey: string;
  payload: string;
  updatedAt: string;
}

/** 伺服器上個人設定的信封格式（payload 是 Profile 的 JSON 字串）。 */
export interface SyncProfileEnvelope {
  payload: string;
  updatedAt: string;
}

/** GET /sync 的回應。 */
export interface SyncPullResponse {
  profile: SyncProfileEnvelope | null;
  records: SyncRecordEnvelope[];
}

/** PUT /sync 的請求 body。 */
export interface SyncPushPayload {
  profile?: SyncProfileEnvelope;
  records: SyncRecordEnvelope[];
}

export interface MergeResult {
  /** 合併後的完整狀態，可直接存回 localStorage。 */
  merged: AppState;
  /** local 較新的 dateKey——呼叫端要把這些推上伺服器。 */
  localNewer: string[];
  /** remote 較新的 dateKey——這些已經被合併進 merged，不需要再推。 */
  remoteNewer: string[];
  /** profile 採用了哪一邊；equal 代表兩邊時間戳相同且內容一致。 */
  profileSource: "local" | "remote" | "equal";
}

/**
 * 把 ISO 時間轉成可比較的毫秒；沒有值或格式壞掉一律回 -Infinity（最舊）。
 * 用 Date.parse 而不是字串比較，才不會被 `+08:00` 與 `Z` 兩種寫法誤導。
 */
function toEpoch(iso: string | undefined): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => deepEqual(left[key], right[key]));
}

type Winner = "local" | "remote" | "equal";

/** 單一項目的勝負判定：時間戳新的贏，平手取 local（內容不同時回 local，相同回 equal）。 */
function pickWinner(
  localUpdatedAt: string | undefined,
  remoteUpdatedAt: string | undefined,
  localValue: unknown,
  remoteValue: unknown,
): Winner {
  const localTime = toEpoch(localUpdatedAt);
  const remoteTime = toEpoch(remoteUpdatedAt);
  if (localTime > remoteTime) return "local";
  if (remoteTime > localTime) return "remote";
  return deepEqual(localValue, remoteValue) ? "equal" : "local";
}

/**
 * 合併本機與伺服器兩份狀態。輸入不會被修改，回傳的是深拷貝。
 * 保證：merged.records 的鍵集合 = local 與 remote 鍵集合的聯集（不丟資料）。
 */
export function mergeStates(local: AppState, remote: AppState): MergeResult {
  const localRecords = local.records ?? {};
  const remoteRecords = remote.records ?? {};
  const dateKeys = [...new Set([...Object.keys(localRecords), ...Object.keys(remoteRecords)])].sort();

  const records: Record<string, DailyRecord> = {};
  const localNewer: string[] = [];
  const remoteNewer: string[] = [];

  dateKeys.forEach((dateKey) => {
    const localRecord = localRecords[dateKey];
    const remoteRecord = remoteRecords[dateKey];

    if (localRecord && !remoteRecord) {
      records[dateKey] = structuredClone(localRecord);
      localNewer.push(dateKey);
      return;
    }
    if (!localRecord && remoteRecord) {
      records[dateKey] = structuredClone(remoteRecord);
      remoteNewer.push(dateKey);
      return;
    }
    if (!localRecord || !remoteRecord) return;

    const winner = pickWinner(localRecord.updatedAt, remoteRecord.updatedAt, localRecord, remoteRecord);
    records[dateKey] = structuredClone(winner === "remote" ? remoteRecord : localRecord);
    if (winner === "local") localNewer.push(dateKey);
    if (winner === "remote") remoteNewer.push(dateKey);
  });

  const profileWinner = pickWinner(
    local.profile?.updatedAt,
    remote.profile?.updatedAt,
    local.profile,
    remote.profile,
  );
  const profile = structuredClone(profileWinner === "remote" ? remote.profile : local.profile);

  return {
    merged: { version: 1, profile, records },
    localNewer,
    remoteNewer,
    profileSource: profileWinner,
  };
}

export interface BuildPushOptions {
  /** 只推這些日期；不給就推全部。清單裡不存在的鍵會被略過。 */
  dateKeys?: string[];
  /** 是否一併推 profile，預設 true。 */
  includeProfile?: boolean;
}

/**
 * 把狀態打包成 PUT /sync 的 body。沒有 updatedAt 的項目補上 EPOCH_ISO，
 * 這樣伺服器端的 last-write-wins 比較才有東西可以比（而且必定輸給有時間戳的版本）。
 */
export function buildPushPayload(state: AppState, options: BuildPushOptions = {}): SyncPushPayload {
  const { dateKeys, includeProfile = true } = options;
  const keys = dateKeys ?? Object.keys(state.records ?? {});

  const records: SyncRecordEnvelope[] = keys
    .filter((dateKey) => Boolean(state.records?.[dateKey]))
    .map((dateKey) => {
      const record = state.records[dateKey];
      return {
        dateKey,
        payload: JSON.stringify(record),
        updatedAt: record.updatedAt ?? EPOCH_ISO,
      };
    });

  if (!includeProfile) return { records };

  return {
    profile: {
      payload: JSON.stringify(state.profile),
      updatedAt: state.profile.updatedAt ?? EPOCH_ISO,
    },
    records,
  };
}

/**
 * 把 GET /sync 的回應還原成 AppState，好餵給 mergeStates。
 * fallback 用來補伺服器上還沒有的東西（例如第一次同步時 profile 是 null），
 * 這時會把 fallback 的 profile 拿來用但拿掉 updatedAt，讓它在合併時算「最舊」。
 * 單筆 payload 壞掉只跳過那一筆並保留其他筆，不讓一筆爛資料炸掉整次同步。
 */
export function remoteStateFromPull(pull: SyncPullResponse, fallback: AppState): AppState {
  const records: Record<string, DailyRecord> = {};

  pull.records.forEach((envelope) => {
    const parsed = safeParseObject(envelope.payload);
    if (!parsed) return;
    records[envelope.dateKey] = {
      ...(parsed as Partial<DailyRecord>),
      dateKey: envelope.dateKey,
      updatedAt: envelope.updatedAt,
    } as DailyRecord;
  });

  let profile: Profile;
  const parsedProfile = pull.profile ? safeParseObject(pull.profile.payload) : null;
  if (pull.profile && parsedProfile) {
    profile = { ...fallback.profile, ...(parsedProfile as Partial<Profile>), updatedAt: pull.profile.updatedAt };
  } else {
    profile = { ...fallback.profile };
    delete profile.updatedAt;
  }

  return normalizeState({ version: 1, profile, records });
}

function safeParseObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 蓋上修改時間戳。UI 每次改動一筆紀錄後呼叫，同步才知道誰比較新。 */
export function stampRecord(record: DailyRecord, now: string = new Date().toISOString()): DailyRecord {
  return { ...record, updatedAt: now };
}

/** 蓋上修改時間戳。UI 每次改動個人設定後呼叫。 */
export function stampProfile(profile: Profile, now: string = new Date().toISOString()): Profile {
  return { ...profile, updatedAt: now };
}
