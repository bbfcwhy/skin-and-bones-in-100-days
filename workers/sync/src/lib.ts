/**
 * 同步 Worker 的純邏輯層：密碼雜湊、token 簽驗、last-write-wins 決策、輸入檢查。
 *
 * 這一層刻意不碰 Request / Response / D1，只用 Web Crypto 與標準全域物件，
 * 所以可以直接用 vitest 測（見 tests/sync-worker.test.ts），不必起 Worker runtime。
 * 所有安全相關的判斷都寫在這裡，index.ts 只負責路由與資料庫存取。
 */

/**
 * PBKDF2 迭代次數。Cloudflare Workers 的 WebCrypto 硬上限是 100000
 * （2026-08-11 實測，超過會拋 NotSupportedError），所以釘在上限值。
 * 低於 OWASP 2023 建議的 210000，但配合單人站、密碼長度 8-256 與
 * README 的登入限速加固，威脅模型下仍屬可接受強度。
 */
export const PBKDF2_ITERATIONS = 100_000;

/** 衍生金鑰長度（bit）。 */
const PBKDF2_KEY_BITS = 256;

/** salt 長度（byte）。 */
const SALT_BYTES = 16;

/** token 效期：30 天。 */
export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface TokenPayload {
  userId: number;
  exp: number;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
}

/**
 * 定時比較：不論哪裡不同都跑完整個迴圈，避免用回應時間猜出正確值。
 * 長度不同直接回 false（長度本身不是秘密）。
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index] ^ b[index];
  }
  return diff === 0;
}

async function derive(password: string, saltBytes: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    PBKDF2_KEY_BITS,
  );
  return new Uint8Array(bits);
}

/** 用隨機 salt 算出密碼雜湊；兩者都以 base64 存進 D1。 */
export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derive(password, saltBytes);
  return { hash: bytesToBase64(derived), salt: bytesToBase64(saltBytes) };
}

/** 驗證密碼。任何解碼錯誤都只回 false，不把細節丟回去。 */
export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  try {
    const saltBytes = base64ToBytes(salt);
    const expected = base64ToBytes(hash);
    const derived = await derive(password, saltBytes);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * 給查無此帳號時用的假驗證：照樣跑一次 PBKDF2，讓「帳號不存在」與「密碼錯誤」
 * 花掉差不多的時間，不讓人用回應時間問出某個 email 有沒有註冊。
 */
export async function burnPasswordTime(password: string): Promise<void> {
  const saltBytes = new Uint8Array(SALT_BYTES);
  await derive(password, saltBytes);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function sign(payload: string, secret: string): Promise<Uint8Array> {
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return new Uint8Array(signature);
}

/**
 * 簽出一個 `base64url(payload).base64url(HMAC-SHA256)` 形式的 token。
 * payload 只放 userId 與到期時間；沒有任何秘密資訊，但被竄改就驗不過。
 */
export async function createToken(
  userId: number,
  secret: string,
  nowMs: number = Date.now(),
): Promise<{ token: string; expiresAt: string }> {
  const exp = nowMs + TOKEN_TTL_MS;
  const payload: TokenPayload = { userId, exp };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await sign(encodedPayload, secret);
  return {
    token: `${encodedPayload}.${bytesToBase64(signature).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`,
    expiresAt: new Date(exp).toISOString(),
  };
}

/** 驗簽＋檢查過期，通過回 userId，其餘一律回 null（不區分是哪一種失敗）。 */
export async function verifyToken(
  token: string,
  secret: string,
  nowMs: number = Date.now(),
): Promise<number | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [encodedPayload, encodedSignature] = parts;
    if (!encodedPayload || !encodedSignature) return null;

    const expected = await sign(encodedPayload, secret);
    const actual = base64ToBytes(encodedSignature.replace(/-/g, "+").replace(/_/g, "/"));
    if (!timingSafeEqual(expected, actual)) return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<TokenPayload>;
    if (typeof payload.userId !== "number" || typeof payload.exp !== "number") return null;
    if (nowMs > payload.exp) return null;
    return payload.userId;
  } catch {
    return null;
  }
}

function toEpoch(iso: string | null | undefined): number | null {
  if (typeof iso !== "string" || iso === "") return null;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * 伺服器端的 last-write-wins：只有進來的比伺服器上的新才覆寫。
 * 時間戳相同不覆寫，防止開著舊分頁的瀏覽器把新資料蓋掉。
 * 進來的時間戳解不出來就不寫（fail closed），寧可讓客戶端重送。
 */
export function shouldOverwrite(incomingUpdatedAt: string, existingUpdatedAt: string | null | undefined): boolean {
  const incoming = toEpoch(incomingUpdatedAt);
  if (incoming === null) return false;
  const existing = toEpoch(existingUpdatedAt);
  if (existing === null) return true;
  return incoming > existing;
}

/** email 去空白轉小寫；長得不像 email 就回 null。 */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** 密碼長度下限（單人版，不再加複雜度要求）。 */
export const MIN_PASSWORD_CHARS = 8;

/**
 * 密碼長度上限。PBKDF2 的成本主要來自迭代次數，但沒有上限就等於讓任何人
 * 用一個超大字串灌進來多耗 CPU，所以在算雜湊之前先擋掉。
 * 256 個字元遠超過正常密碼或 passphrase 的長度，不會擋到真的使用者。
 */
export const MAX_PASSWORD_CHARS = 256;

/** 密碼規則：8 到 256 個字元。register 與 login 兩條路都要先過這關再碰 PBKDF2。 */
export function isAcceptablePassword(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= MIN_PASSWORD_CHARS
    && value.length <= MAX_PASSWORD_CHARS;
}

/** 單筆 payload 的長度上限，擋掉明顯不合理的請求。 */
export const MAX_PAYLOAD_CHARS = 64_000;

/** profile 的信封：payload 是 JSON 字串，updatedAt 是可解析的 ISO 時間。 */
export interface Envelope {
  payload: string;
  updatedAt: string;
}

/** 每日紀錄的信封，多一個 YYYY-MM-DD 的 dateKey。 */
export interface RecordEnvelope extends Envelope {
  dateKey: string;
}

export function isValidEnvelope(value: unknown): value is Envelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Envelope>;
  return typeof candidate.payload === "string"
    && candidate.payload.length <= MAX_PAYLOAD_CHARS
    && typeof candidate.updatedAt === "string"
    // 時間戳解不出來的一律當格式錯誤擋在這裡，後面的 stale 判斷才不會誤報。
    && !Number.isNaN(Date.parse(candidate.updatedAt));
}

export function isValidRecordEnvelope(value: unknown): value is RecordEnvelope {
  if (!isValidEnvelope(value)) return false;
  const dateKey = (value as Partial<RecordEnvelope>).dateKey;
  return typeof dateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateKey);
}
