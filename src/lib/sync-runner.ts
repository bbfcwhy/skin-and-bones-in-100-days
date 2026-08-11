/**
 * 同步的執行順序（誰先誰後、失敗了算誰的）。
 *
 * 這裡是純邏輯：所有會碰外面世界的動作（讀寫 localStorage、發 request）
 * 都由呼叫端用 deps 傳進來，所以可以直接測。
 *
 * 最重要的一條規則：**localStorage 永遠先寫**。
 * 合併結果一算出來就立刻寫回本機，之後推送失敗最多只是「有變更待同步」，
 * 絕不會發生「同步失敗順便把本機資料弄丟」。
 * 相對地，pull 失敗時完全不動本機——沒有拿到伺服器版本就沒有合併的依據。
 */
import { buildPushPayload, mergeStates, remoteStateFromPull, type SyncPullResponse, type SyncPushPayload } from "./sync";
import type { SyncFailureKind, SyncResult } from "./sync-client";
import type { AppState } from "./types";

export interface SyncRunnerDeps {
  /** 讀本機目前的狀態（實務上就是 loadState()）。 */
  readLocal: () => AppState;
  /** 把合併後的狀態寫回本機（實務上就是 saveState()）。 */
  writeLocal: (state: AppState) => void;
  pull: () => Promise<SyncResult<SyncPullResponse>>;
  push: (payload: SyncPushPayload) => Promise<SyncResult<unknown>>;
}

export type SyncStatus = "synced" | "pending" | "offline" | "unauthorized" | "error";

export interface SyncOutcome {
  status: SyncStatus;
  /** 有合併出新狀態時才有；呼叫端要拿去更新畫面。 */
  state?: AppState;
  /** 這次推上去的日期。 */
  pushed: string[];
  /** 失敗時給使用者看的訊息。 */
  message: string;
  /** 失敗的種類，讓 UI 分得出「離線」與「其他狀況」。 */
  kind?: SyncFailureKind;
}

function statusForFailure(kind: SyncFailureKind): SyncStatus {
  if (kind === "unauthorized") return "unauthorized";
  if (kind === "network") return "offline";
  return "error";
}

/**
 * 全量同步：pull → 合併 → 寫回本機 → 只推本機比較新的那幾天。
 * 登入成功後與每次開頁面都跑這個。
 */
export async function runFullSync(deps: SyncRunnerDeps): Promise<SyncOutcome> {
  const local = deps.readLocal();
  const pulled = await deps.pull();

  if (!pulled.ok) {
    return { status: statusForFailure(pulled.kind), pushed: [], message: pulled.message, kind: pulled.kind };
  }

  const remote = remoteStateFromPull(pulled.data, local);
  const { merged, localNewer, profileSource } = mergeStates(local, remote);

  // 先寫本機，再推。順序不能顛倒。
  deps.writeLocal(merged);

  const shouldPushProfile = profileSource === "local";
  if (localNewer.length === 0 && !shouldPushProfile) {
    return { status: "synced", state: merged, pushed: [], message: "" };
  }

  const payload = buildPushPayload(merged, { dateKeys: localNewer, includeProfile: shouldPushProfile });
  const pushed = await deps.push(payload);
  if (!pushed.ok) {
    const status = pushed.kind === "unauthorized" ? "unauthorized" : "pending";
    return { status, state: merged, pushed: [], message: pushed.message, kind: pushed.kind };
  }

  return { status: "synced", state: merged, pushed: localNewer, message: "" };
}

export interface PushOptions {
  dateKeys: string[];
  includeProfile: boolean;
}

/**
 * 增量推送：使用者改完東西、debounce 到期時跑這個。
 * 不做 pull、不合併——本機就是這幾筆的最新版本，推上去讓伺服器自己比時間戳。
 */
export async function runPush(deps: SyncRunnerDeps, options: PushOptions): Promise<SyncOutcome> {
  const state = deps.readLocal();
  const dateKeys = options.dateKeys.filter((dateKey) => Boolean(state.records?.[dateKey]));

  if (dateKeys.length === 0 && !options.includeProfile) {
    return { status: "synced", pushed: [], message: "" };
  }

  const payload = buildPushPayload(state, { dateKeys, includeProfile: options.includeProfile });
  const pushed = await deps.push(payload);
  if (!pushed.ok) {
    const status = pushed.kind === "unauthorized" ? "unauthorized" : "pending";
    return { status, pushed: [], message: pushed.message, kind: pushed.kind };
  }

  return { status: "synced", pushed: dateKeys, message: "" };
}
