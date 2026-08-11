"use client";

/**
 * 跨瀏覽器同步的接線層（React 這一側）。
 *
 * 分工：怎麼合併在 src/lib/sync.ts、怎麼發 request 在 sync-client.ts、
 * 誰先誰後在 sync-runner.ts；這個 hook 只負責「什麼時候跑」與「畫面要顯示什麼」。
 *
 * 同步時機：
 * 1. 頁面載入且 token 還沒過期 → 全量同步一次。
 * 2. 登入成功 → 全量同步一次。
 * 3. 使用者改東西 → 標記待同步，安靜等 3 秒（DEBOUNCE_MS）再推。
 *    3 秒內又改就重新計時，避免每按一個字就打一次 request。
 * 4. 手動按「立即同步」→ 全量同步。
 *
 * 失敗一律不彈窗、不擋操作：本機儲存本來就先寫好了，最多是頭部徽章顯示待同步或離線。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { loadState, saveState } from "@/src/lib/storage";
import {
  requestHealth,
  requestLogin,
  requestPull,
  requestPush,
  requestRegister,
  type AuthSession,
  type ClientConfig,
} from "@/src/lib/sync-client";
import { SYNC_API_BASE, isSyncConfigured } from "@/src/lib/sync-config";
import { runFullSync, runPush, type SyncOutcome, type SyncRunnerDeps } from "@/src/lib/sync-runner";
import {
  browserStorage,
  clearSession,
  readSession,
  touchLastSynced,
  writeSession,
  type StoredSession,
} from "@/src/lib/sync-token";
import type { AppState } from "@/src/lib/types";

/** 改完東西等多久才推上去。 */
const DEBOUNCE_MS = 3000;

/** 網址是 build 時就寫死的，整個 session 都是同一個值，所以放在模組層。 */
const config: ClientConfig = { baseUrl: SYNC_API_BASE };

export const MIN_PASSWORD_CHARS = 8;

export type SyncPhase = "disabled" | "signed-out" | "syncing" | "synced" | "pending" | "offline";

export interface SyncState {
  /** 有沒有設定 SYNC_API_BASE。false 時整個同步區塊要收起來。 */
  configured: boolean;
  phase: SyncPhase;
  signedIn: boolean;
  email: string;
  /** 上次同步成功的時間，格式 HH:mm（台北時間）；沒同步過是空字串。 */
  lastSyncedLabel: string;
  /** 進行中（登入或同步），按鈕要 disable。 */
  busy: boolean;
  /** 登入表單的錯誤訊息。 */
  error: string;
  /** 一般提示，例如登入過期。 */
  notice: string;
  /** true 時要顯示「第一次使用會建立你的專屬帳號」並把按鈕換成建立帳號。 */
  needsRegisterConfirm: boolean;
  signIn: (email: string, password: string, allowRegister: boolean) => Promise<void>;
  signOut: () => void;
  syncNow: () => Promise<void>;
  /** 改了某一天的紀錄。 */
  markRecordChanged: (dateKey: string) => void;
  /** 改了個人設定。 */
  markProfileChanged: () => void;
}

function timeLabel(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

export interface UseSyncOptions {
  /** 本機資料讀好了沒；沒好之前不做任何同步。 */
  hydrated: boolean;
  /** 合併出新狀態時通知畫面更新。 */
  onMerged: (state: AppState) => void;
}

export function useSync({ hydrated, onMerged }: UseSyncOptions): SyncState {
  const configured = isSyncConfigured();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [phase, setPhase] = useState<SyncPhase>(configured ? "signed-out" : "disabled");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [needsRegisterConfirm, setNeedsRegisterConfirm] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState("");

  const pendingDates = useRef<Set<string>>(new Set());
  const pendingProfile = useRef(false);
  const timer = useRef<number | null>(null);
  const sessionRef = useRef<StoredSession | null>(null);
  const mergedRef = useRef(onMerged);
  const initialSyncDone = useRef(false);

  useEffect(() => {
    mergedRef.current = onMerged;
  }, [onMerged]);

  /** token 不能用了：清掉登入狀態，但本機紀錄一個字都不動。 */
  const handleExpired = useCallback(() => {
    clearSession(browserStorage());
    sessionRef.current = null;
    setSession(null);
    setPhase("signed-out");
    setNotice("登入已過期，重新登入後會繼續同步。");
  }, []);

  const applyOutcome = useCallback((outcome: SyncOutcome) => {
    if (outcome.state) mergedRef.current(outcome.state);

    if (outcome.status === "unauthorized") {
      handleExpired();
      return;
    }
    if (outcome.status === "synced") {
      const now = new Date().toISOString();
      touchLastSynced(browserStorage(), now);
      setLastSyncedAt(now);
      setPhase("synced");
      setNotice("");
      return;
    }
    // pending / offline / error：本機資料是安全的，只是還沒推上去。
    setPhase(outcome.kind === "network" ? "offline" : "pending");
  }, [handleExpired]);

  const runnerDeps = useCallback((token: string): SyncRunnerDeps => ({
    readLocal: loadState,
    writeLocal: saveState,
    pull: () => requestPull(config, token),
    push: (payload) => requestPush(config, token, payload),
  }), []);

  const fullSync = useCallback(async (token: string) => {
    setPhase("syncing");
    const outcome = await runFullSync(runnerDeps(token));
    if (outcome.status === "synced") {
      pendingDates.current.clear();
      pendingProfile.current = false;
    }
    applyOutcome(outcome);
  }, [applyOutcome, runnerDeps]);

  /** debounce 到期：把累積的變更推上去。失敗時保留待推清單，等下次再試。 */
  const flush = useCallback(async () => {
    const token = sessionRef.current?.token;
    if (!token) return;
    const dateKeys = [...pendingDates.current];
    const includeProfile = pendingProfile.current;
    if (dateKeys.length === 0 && !includeProfile) return;

    setPhase("syncing");
    const outcome = await runPush(runnerDeps(token), { dateKeys, includeProfile });
    if (outcome.status === "synced") {
      dateKeys.forEach((dateKey) => pendingDates.current.delete(dateKey));
      if (includeProfile) pendingProfile.current = false;
    }
    applyOutcome(outcome);
  }, [applyOutcome, runnerDeps]);

  const schedule = useCallback(() => {
    if (!sessionRef.current) return;
    setPhase("pending");
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void flush();
    }, DEBOUNCE_MS);
  }, [flush]);

  const markRecordChanged = useCallback((dateKey: string) => {
    pendingDates.current.add(dateKey);
    schedule();
  }, [schedule]);

  const markProfileChanged = useCallback(() => {
    pendingProfile.current = true;
    schedule();
  }, [schedule]);

  // 開頁面：有沒過期的 token 就直接全量同步一次。
  useEffect(() => {
    if (!configured || !hydrated || initialSyncDone.current) return;
    initialSyncDone.current = true;
    const stored = readSession(browserStorage());
    if (stored.expired) {
      handleExpired();
      return;
    }
    if (!stored.session) return;
    sessionRef.current = stored.session;
    setSession(stored.session);
    setLastSyncedAt(stored.session.lastSyncedAt ?? "");
    void fullSync(stored.session.token);
  }, [configured, fullSync, handleExpired, hydrated]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const startSession = useCallback(async (auth: AuthSession, email: string) => {
    const stored: StoredSession = { token: auth.token, expiresAt: auth.expiresAt, email };
    writeSession(browserStorage(), stored);
    sessionRef.current = stored;
    setSession(stored);
    setNeedsRegisterConfirm(false);
    setError("");
    setNotice("");
    await fullSync(auth.token);
  }, [fullSync]);

  const signIn = useCallback(async (email: string, password: string, allowRegister: boolean) => {
    const account = email.trim();
    if (!account || password.length < MIN_PASSWORD_CHARS) {
      setError(`請填 email，密碼至少 ${MIN_PASSWORD_CHARS} 個字元。`);
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (allowRegister) {
        const registered = await requestRegister(config, account, password);
        if (!registered.ok) {
          setNeedsRegisterConfirm(false);
          setError(registered.kind === "forbidden" ? "此服務已有人註冊，不開放新帳號。" : registered.message);
          return;
        }
        // 帳號開好後照樣走一次正式登入，確認這組帳密之後真的登得進來。
        const logged = await requestLogin(config, account, password);
        await startSession(logged.ok ? logged.data : registered.data, account);
        return;
      }

      const logged = await requestLogin(config, account, password);
      if (logged.ok) {
        await startSession(logged.data, account);
        return;
      }
      if (logged.kind !== "unauthorized") {
        setError(logged.message);
        return;
      }

      // 401 有兩種可能：帳密不對，或者根本還沒有人註冊過。問一下 /health 才知道。
      const health = await requestHealth(config);
      if (health.ok && !health.data.registered) {
        setNeedsRegisterConfirm(true);
        setError("");
        return;
      }
      setError(health.ok ? "帳號或密碼不對。" : health.message);
    } finally {
      setBusy(false);
    }
  }, [startSession]);

  const signOut = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    pendingDates.current.clear();
    pendingProfile.current = false;
    clearSession(browserStorage());
    sessionRef.current = null;
    setSession(null);
    setPhase("signed-out");
    setNeedsRegisterConfirm(false);
    setError("");
    setNotice("已登出這個瀏覽器，這台裝置的紀錄完整保留。");
    setLastSyncedAt("");
  }, []);

  const syncNow = useCallback(async () => {
    const token = sessionRef.current?.token;
    if (!token) return;
    setBusy(true);
    try {
      await fullSync(token);
    } finally {
      setBusy(false);
    }
  }, [fullSync]);

  return {
    configured,
    phase: configured ? phase : "disabled",
    signedIn: session !== null,
    email: session?.email ?? "",
    lastSyncedLabel: lastSyncedAt ? timeLabel(lastSyncedAt) : "",
    busy,
    error,
    notice,
    needsRegisterConfirm,
    signIn,
    signOut,
    syncNow,
    markRecordChanged,
    markProfileChanged,
  };
}
