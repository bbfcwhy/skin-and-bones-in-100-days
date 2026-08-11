/**
 * 同步 Worker 的 HTTP 封裝。
 *
 * 這一層只做三件事：組網址、帶 token、把各種失敗翻成四種分類，
 * 不碰 localStorage、不碰 React、不決定「失敗了要怎麼辦」——那是 sync-runner 與 UI 的事。
 *
 * 失敗一律用回傳值表達（不 throw），呼叫端才不用到處 try/catch：
 *   unauthorized  401：帳號密碼不對，或 token 過期了
 *   forbidden     403：這個服務已經有人註冊，不開放新帳號
 *   network       連不上（沒網路、Worker 沒醒、CORS 擋掉）
 *   other         其他狀態碼、或回應根本不是預期的 JSON
 */
import type { SyncPullResponse, SyncPushPayload } from "./sync";

export type SyncFailureKind = "unauthorized" | "forbidden" | "network" | "other";

export interface SyncFailure {
  ok: false;
  kind: SyncFailureKind;
  /** HTTP 狀態碼；連不上伺服器時是 null。 */
  status: number | null;
  /** 可以直接顯示給使用者看的中文訊息。 */
  message: string;
}

export interface SyncSuccess<T> {
  ok: true;
  data: T;
}

export type SyncResult<T> = SyncSuccess<T> | SyncFailure;

/** 登入／註冊成功後拿到的東西。 */
export interface AuthSession {
  token: string;
  expiresAt: string;
}

export interface HealthInfo {
  /** true 代表主人已經註冊過了，第二個人不能再開帳號。 */
  registered: boolean;
}

/** PUT /sync 的回應，逐筆告訴你伺服器採用了沒。這一層先原樣收下。 */
export interface PushOutcome {
  profile?: unknown;
  records?: unknown;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface ClientConfig {
  baseUrl: string;
  /** 測試時可以換掉；平常走瀏覽器的 fetch。 */
  fetchImpl?: FetchLike;
}

const NETWORK_MESSAGE = "連不上同步服務，先確認網路，資料還在這台裝置上。";
const OTHER_MESSAGE = "同步服務暫時有狀況，稍後會再試一次。";

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

async function readBody(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await response.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function classify(status: number, body: Record<string, unknown> | null): SyncFailure {
  const serverMessage = typeof body?.error === "string" ? body.error : "";
  if (status === 401) {
    return { ok: false, kind: "unauthorized", status, message: serverMessage || "登入已過期，請重新登入。" };
  }
  if (status === 403) {
    return { ok: false, kind: "forbidden", status, message: serverMessage || "此服務不開放註冊。" };
  }
  return { ok: false, kind: "other", status, message: serverMessage || OTHER_MESSAGE };
}

/**
 * 送出一次請求並把結果轉成 SyncResult。
 * parse 負責檢查「回來的東西長得對不對」——形狀不對一律當 other，
 * 免得後面拿到 undefined 才炸在別的地方。
 */
async function send<T>(
  config: ClientConfig,
  path: string,
  init: RequestInit,
  parse: (body: Record<string, unknown>) => T | null,
): Promise<SyncResult<T>> {
  const doFetch = config.fetchImpl ?? ((url: string, options?: RequestInit) => fetch(url, options));

  let response: Response;
  try {
    response = await doFetch(endpoint(config.baseUrl, path), init);
  } catch {
    return { ok: false, kind: "network", status: null, message: NETWORK_MESSAGE };
  }

  const body = await readBody(response);
  if (!response.ok) return classify(response.status, body);
  if (!body) return { ok: false, kind: "other", status: response.status, message: OTHER_MESSAGE };

  const data = parse(body);
  if (data === null) return { ok: false, kind: "other", status: response.status, message: OTHER_MESSAGE };
  return { ok: true, data };
}

function jsonInit(method: string, token: string | null, payload: unknown): RequestInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  };
}

function parseSession(body: Record<string, unknown>): AuthSession | null {
  if (typeof body.token !== "string" || body.token === "") return null;
  return {
    token: body.token,
    expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : "",
  };
}

export function requestLogin(config: ClientConfig, email: string, password: string): Promise<SyncResult<AuthSession>> {
  return send(config, "/auth/login", jsonInit("POST", null, { email, password }), parseSession);
}

export function requestRegister(
  config: ClientConfig,
  email: string,
  password: string,
): Promise<SyncResult<AuthSession>> {
  return send(config, "/auth/register", jsonInit("POST", null, { email, password }), parseSession);
}

export function requestHealth(config: ClientConfig): Promise<SyncResult<HealthInfo>> {
  return send(config, "/health", { method: "GET" }, (body) => ({ registered: body.registered === true }));
}

export function requestPull(config: ClientConfig, token: string): Promise<SyncResult<SyncPullResponse>> {
  return send(
    config,
    "/sync",
    { method: "GET", headers: { Authorization: `Bearer ${token}` } },
    (body) => {
      if (!Array.isArray(body.records)) return null;
      return {
        profile: (body.profile ?? null) as SyncPullResponse["profile"],
        records: body.records as SyncPullResponse["records"],
      };
    },
  );
}

export function requestPush(
  config: ClientConfig,
  token: string,
  payload: SyncPushPayload,
): Promise<SyncResult<PushOutcome>> {
  return send(config, "/sync", jsonInit("PUT", token, payload), (body) => body as PushOutcome);
}
