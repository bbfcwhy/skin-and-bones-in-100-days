/**
 * 「百日剩皮包骨」跨瀏覽器同步 Worker（單人版）。
 *
 * 設計立場：這是一個人自己用的服務，不做開放註冊、不寄信、不做找回密碼。
 * 第一個註冊的人就是主人，之後 /auth/register 一律 403。
 *
 * 路由：
 *   POST   /auth/register  { email, password }        → { token, expiresAt }（只有 users 表是空的時候）
 *   POST   /auth/login     { email, password }        → { token, expiresAt }
 *   GET    /sync           Authorization: Bearer …    → { profile, records }
 *   PUT    /sync           Authorization: Bearer …    → { profile, records }（每筆的採用結果）
 *   GET    /health                                    → { ok: true, registered: boolean }
 *
 * 衝突處理：伺服器端也守 last-write-wins——只有進來的 updatedAt 比伺服器上的新才覆寫，
 * 被拒絕的那幾筆會把伺服器版本一起回傳，讓客戶端直接拉回去合併，不必再多打一次 GET。
 */
import type { D1PreparedStatement, Env } from "./env";
import type { Envelope, RecordEnvelope } from "./lib";
import {
  MAX_PASSWORD_CHARS,
  MIN_PASSWORD_CHARS,
  burnPasswordTime,
  createToken,
  hashPassword,
  isAcceptablePassword,
  isValidEnvelope,
  isValidRecordEnvelope,
  normalizeEmail,
  shouldOverwrite,
  verifyPassword,
  verifyToken,
} from "./lib";

/** 允許的來源：GitHub Pages 正式站與本機開發站。 */
const ALLOWED_ORIGINS = new Set(["https://bbfcwhy.github.io", "http://localhost:3000"]);

/** 登入失敗一律回同一句話，不讓人問出某個 email 有沒有註冊。 */
const INVALID_CREDENTIALS = "登入失敗，請確認帳號與密碼。";
const SERVER_ERROR = "伺服器錯誤，請稍後再試。";

/** 單次 PUT 的筆數上限，擋掉明顯不合理的請求。100 天的計畫用不到這個量。 */
const MAX_RECORDS_PER_PUSH = 500;

interface ItemOutcome {
  applied: boolean;
  /** stale：伺服器上的比較新；invalid：這一筆格式不對。 */
  reason?: "stale" | "invalid";
  /** 被拒絕時附上伺服器版本，客戶端可以直接拉回去合併。 */
  server?: Envelope;
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
    },
  });
}

function fail(status: number, message: string, origin: string | null): Response {
  return json({ error: message }, status, origin);
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 驗 Authorization header，通過回 userId，失敗回一個現成的 Response。 */
async function authenticate(request: Request, env: Env, origin: string | null): Promise<number | Response> {
  if (!env.TOKEN_SECRET) return fail(500, "伺服器尚未設定 TOKEN_SECRET。", origin);
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) return fail(401, "請先登入。", origin);
  const userId = await verifyToken(token, env.TOKEN_SECRET);
  if (userId === null) return fail(401, "登入已過期，請重新登入。", origin);
  return userId;
}

async function handleRegister(request: Request, env: Env, origin: string | null): Promise<Response> {
  if (!env.TOKEN_SECRET) return fail(500, "伺服器尚未設定 TOKEN_SECRET。", origin);
  const body = await readJsonBody(request);
  if (!body) return fail(400, "請求格式不正確。", origin);

  const email = normalizeEmail(body.email);
  if (!email) return fail(400, "email 格式不正確。", origin);
  if (!isAcceptablePassword(body.password)) {
    return fail(400, `密碼長度要介於 ${MIN_PASSWORD_CHARS} 到 ${MAX_PASSWORD_CHARS} 個字元。`, origin);
  }

  const existing = await env.DB.prepare("SELECT COUNT(*) AS total FROM users").first<{ total: number }>();
  if ((existing?.total ?? 0) > 0) return fail(403, "此服務不開放註冊。", origin);

  const { hash, salt } = await hashPassword(body.password);
  // WHERE NOT EXISTS 讓「只准第一個人註冊」這件事由 SQLite 自己保證，
  // 不依賴上面那次 COUNT 的結果，兩個請求同時打進來也只會有一個成功。
  const inserted = await env.DB
    .prepare(
      `INSERT INTO users (email, password_hash, salt, created_at)
       SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM users)
       RETURNING id`,
    )
    .bind(email, hash, salt, new Date().toISOString())
    .first<{ id: number }>();

  if (!inserted) return fail(403, "此服務不開放註冊。", origin);

  const { token, expiresAt } = await createToken(inserted.id, env.TOKEN_SECRET);
  return json({ token, expiresAt }, 201, origin);
}

async function handleLogin(request: Request, env: Env, origin: string | null): Promise<Response> {
  if (!env.TOKEN_SECRET) return fail(500, "伺服器尚未設定 TOKEN_SECRET。", origin);
  const body = await readJsonBody(request);
  if (!body) return fail(400, "請求格式不正確。", origin);

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  // 長度或格式一看就不合規的，直接當登入失敗擋掉，連 PBKDF2 都不必算。
  // 這個判斷只看客戶端送來的值，不碰資料庫，所以不會洩漏帳號存不存在。
  if (!email || !isAcceptablePassword(password)) {
    return fail(401, INVALID_CREDENTIALS, origin);
  }

  const user = await env.DB
    .prepare("SELECT id, password_hash, salt FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: number; password_hash: string; salt: string }>();

  if (!user) {
    // 查無此帳號也照樣算一次 PBKDF2，讓兩種失敗花掉差不多的時間。
    await burnPasswordTime(password);
    return fail(401, INVALID_CREDENTIALS, origin);
  }

  const passed = await verifyPassword(password, user.password_hash, user.salt);
  if (!passed) return fail(401, INVALID_CREDENTIALS, origin);

  const { token, expiresAt } = await createToken(user.id, env.TOKEN_SECRET);
  return json({ token, expiresAt }, 200, origin);
}

async function handlePull(env: Env, userId: number, origin: string | null): Promise<Response> {
  const profile = await env.DB
    .prepare("SELECT payload, updated_at FROM profiles WHERE user_id = ?")
    .bind(userId)
    .first<{ payload: string; updated_at: string }>();

  const records = await env.DB
    .prepare("SELECT date_key, payload, updated_at FROM day_records WHERE user_id = ? ORDER BY date_key")
    .bind(userId)
    .all<{ date_key: string; payload: string; updated_at: string }>();

  return json(
    {
      profile: profile ? { payload: profile.payload, updatedAt: profile.updated_at } : null,
      records: records.results.map((row) => ({
        dateKey: row.date_key,
        payload: row.payload,
        updatedAt: row.updated_at,
      })),
    },
    200,
    origin,
  );
}

async function handlePush(request: Request, env: Env, userId: number, origin: string | null): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body) return fail(400, "請求格式不正確。", origin);

  const incomingRecords = Array.isArray(body.records) ? body.records : null;
  if (!incomingRecords) return fail(400, "records 必須是陣列。", origin);
  if (incomingRecords.length > MAX_RECORDS_PER_PUSH) {
    return fail(413, `一次最多同步 ${MAX_RECORDS_PER_PUSH} 筆。`, origin);
  }
  if (body.profile !== undefined && !isValidEnvelope(body.profile)) {
    return fail(400, "profile 格式不正確。", origin);
  }

  const statements: D1PreparedStatement[] = [];
  const recordOutcomes: Array<ItemOutcome & { dateKey: string }> = [];
  let profileOutcome: ItemOutcome | null = null;

  // 先把伺服器現有的時間戳一次撈齊，再逐筆判斷，最後用一次 batch 寫回去。
  const existingRecords = await env.DB
    .prepare("SELECT date_key, payload, updated_at FROM day_records WHERE user_id = ?")
    .bind(userId)
    .all<{ date_key: string; payload: string; updated_at: string }>();
  const existingByDate = new Map(existingRecords.results.map((row) => [row.date_key, row]));

  if (isValidEnvelope(body.profile)) {
    const incoming = body.profile;
    const existingProfile = await env.DB
      .prepare("SELECT payload, updated_at FROM profiles WHERE user_id = ?")
      .bind(userId)
      .first<{ payload: string; updated_at: string }>();

    if (shouldOverwrite(incoming.updatedAt, existingProfile?.updated_at)) {
      statements.push(
        env.DB
          .prepare(
            `INSERT INTO profiles (user_id, payload, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
          )
          .bind(userId, incoming.payload, incoming.updatedAt),
      );
      profileOutcome = { applied: true };
    } else {
      // 走到這裡代表伺服器上一定有一筆而且不比進來的舊（時間戳格式已在 isValidEnvelope 擋過）。
      profileOutcome = {
        applied: false,
        reason: "stale",
        server: existingProfile
          ? { payload: existingProfile.payload, updatedAt: existingProfile.updated_at }
          : undefined,
      };
    }
  }

  const seen = new Set<string>();
  incomingRecords.forEach((item) => {
    if (!isValidRecordEnvelope(item)) {
      const rawDateKey = (item as Partial<RecordEnvelope> | null)?.dateKey;
      recordOutcomes.push({
        dateKey: typeof rawDateKey === "string" ? rawDateKey : "",
        applied: false,
        reason: "invalid",
      });
      return;
    }
    // 同一次請求裡重複的 dateKey 只採用第一筆，避免 batch 裡自己蓋自己。
    if (seen.has(item.dateKey)) {
      recordOutcomes.push({ dateKey: item.dateKey, applied: false, reason: "invalid" });
      return;
    }
    seen.add(item.dateKey);

    const existing = existingByDate.get(item.dateKey);
    if (shouldOverwrite(item.updatedAt, existing?.updated_at)) {
      statements.push(
        env.DB
          .prepare(
            `INSERT INTO day_records (user_id, date_key, payload, updated_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(user_id, date_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
          )
          .bind(userId, item.dateKey, item.payload, item.updatedAt),
      );
      recordOutcomes.push({ dateKey: item.dateKey, applied: true });
    } else {
      recordOutcomes.push({
        dateKey: item.dateKey,
        applied: false,
        reason: "stale",
        server: existing ? { payload: existing.payload, updatedAt: existing.updated_at } : undefined,
      });
    }
  });

  if (statements.length > 0) await env.DB.batch(statements);

  return json({ profile: profileOutcome, records: recordOutcomes }, 200, origin);
}

async function route(request: Request, env: Env, origin: string | null): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";

  if (path === "/health") {
    if (request.method !== "GET") return fail(405, "方法不允許。", origin);
    const existing = await env.DB.prepare("SELECT COUNT(*) AS total FROM users").first<{ total: number }>();
    return json({ ok: true, registered: (existing?.total ?? 0) > 0 }, 200, origin);
  }

  if (path === "/auth/register") {
    if (request.method !== "POST") return fail(405, "方法不允許。", origin);
    return handleRegister(request, env, origin);
  }

  if (path === "/auth/login") {
    if (request.method !== "POST") return fail(405, "方法不允許。", origin);
    return handleLogin(request, env, origin);
  }

  if (path === "/sync") {
    if (request.method !== "GET" && request.method !== "PUT") return fail(405, "方法不允許。", origin);
    const authenticated = await authenticate(request, env, origin);
    if (typeof authenticated !== "number") return authenticated;
    return request.method === "GET"
      ? handlePull(env, authenticated, origin)
      : handlePush(request, env, authenticated, origin);
  }

  return fail(404, "找不到這個路徑。", origin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      return await route(request, env, origin);
    } catch (error) {
      // 真正的錯誤只留在 log（wrangler tail 看得到），回給前端的一律是同一句話。
      console.error("sync worker failed", error);
      return fail(500, SERVER_ERROR, origin);
    }
  },
};
