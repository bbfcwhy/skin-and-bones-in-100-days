/**
 * 同步登入狀態的儲存。
 *
 * 鐵則：token 存在自己的 localStorage key，**絕對不進 AppState**。
 * 理由是設定頁的「下載 JSON 備份」會把整個 AppState 寫進檔案，
 * token 混進去就等於把登入憑證存到 iCloud Drive 或傳給別人。
 * tests/sync-token.test.ts 有一條測試守著這件事。
 */
export const SYNC_TOKEN_KEY = "skin-and-bones-sync-token-v1";

export interface StoredSession {
  token: string;
  /** ISO 字串。過期後 readSession 會當作沒登入。 */
  expiresAt: string;
  /** 只是拿來在畫面上顯示「目前連線的帳號」，不參與驗證。 */
  email?: string;
  /** 上次成功同步的時間，重新整理後還能顯示。 */
  lastSyncedAt?: string;
}

export interface SessionState {
  /** 還有效的登入；沒有或已過期都是 null。 */
  session: StoredSession | null;
  /** true 代表本來有登入但過期了，UI 要提示「重新登入後會繼續同步」。 */
  expired: boolean;
}

/** 只用到 localStorage 的這三個方法，測試才能塞一個假的進來。 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 瀏覽器的 localStorage；SSR／靜態輸出階段沒有 window，回 null。 */
export function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function parse(raw: string | null): StoredSession | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<StoredSession>;
    if (typeof candidate.token !== "string" || candidate.token === "") return null;
    return {
      token: candidate.token,
      expiresAt: typeof candidate.expiresAt === "string" ? candidate.expiresAt : "",
      email: typeof candidate.email === "string" ? candidate.email : undefined,
      lastSyncedAt: typeof candidate.lastSyncedAt === "string" ? candidate.lastSyncedAt : undefined,
    };
  } catch {
    return null;
  }
}

/** 沒有 expiresAt 或解析不出來時當作「還沒過期」，讓伺服器自己去擋。 */
function isExpired(session: StoredSession, now: number): boolean {
  const expiry = Date.parse(session.expiresAt);
  if (Number.isNaN(expiry)) return false;
  return expiry <= now;
}

export function readSession(storage: StorageLike | null, now: number = Date.now()): SessionState {
  if (!storage) return { session: null, expired: false };
  const session = parse(storage.getItem(SYNC_TOKEN_KEY));
  if (!session) return { session: null, expired: false };
  if (isExpired(session, now)) return { session: null, expired: true };
  return { session, expired: false };
}

export function writeSession(storage: StorageLike | null, session: StoredSession): void {
  storage?.setItem(SYNC_TOKEN_KEY, JSON.stringify(session));
}

/** 登出：只清 token，本機的紀錄一個字都不動。 */
export function clearSession(storage: StorageLike | null): void {
  storage?.removeItem(SYNC_TOKEN_KEY);
}

/** 記下這次同步成功的時間，順手保留原本的 token 內容。 */
export function touchLastSynced(storage: StorageLike | null, isoTime: string): void {
  if (!storage) return;
  const session = parse(storage.getItem(SYNC_TOKEN_KEY));
  if (!session) return;
  writeSession(storage, { ...session, lastSyncedAt: isoTime });
}
