import { describe, expect, it } from "vitest";
import {
  MAX_PASSWORD_CHARS,
  MAX_PAYLOAD_CHARS,
  MIN_PASSWORD_CHARS,
  PBKDF2_ITERATIONS,
  TOKEN_TTL_MS,
  createToken,
  hashPassword,
  isAcceptablePassword,
  isValidEnvelope,
  isValidRecordEnvelope,
  normalizeEmail,
  shouldOverwrite,
  verifyPassword,
  verifyToken,
} from "../workers/sync/src/lib";

const SECRET = "test-secret-do-not-use-in-production";

describe("同步 Worker 的密碼雜湊", () => {
  it("使用 PBKDF2-SHA256 且迭代次數不低於 210000", () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(210_000);
  });

  it("同一組密碼每次的 salt 與 hash 都不同", async () => {
    const first = await hashPassword("correct horse battery");
    const second = await hashPassword("correct horse battery");
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
  });

  it("正確密碼驗得過，錯誤密碼驗不過", async () => {
    const { hash, salt } = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash, salt)).toBe(true);
    expect(await verifyPassword("correct horse batter", hash, salt)).toBe(false);
    expect(await verifyPassword("", hash, salt)).toBe(false);
  });

  it("salt 對不上就驗不過", async () => {
    const { hash } = await hashPassword("correct horse battery");
    const other = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash, other.salt)).toBe(false);
  });

  it("壞掉的 hash 或 salt 只回 false，不丟例外", async () => {
    expect(await verifyPassword("whatever", "!!!not-base64!!!", "!!!")).toBe(false);
  });
});

describe("同步 Worker 的 token 簽驗", () => {
  it("簽出來的 token 驗得回 userId，效期 30 天", async () => {
    const now = Date.parse("2026-08-11T00:00:00.000Z");
    const { token, expiresAt } = await createToken(7, SECRET, now);
    expect(await verifyToken(token, SECRET, now)).toBe(7);
    expect(Date.parse(expiresAt) - now).toBe(TOKEN_TTL_MS);
    expect(TOKEN_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("換一個 secret 就驗不過", async () => {
    const now = Date.parse("2026-08-11T00:00:00.000Z");
    const { token } = await createToken(7, SECRET, now);
    expect(await verifyToken(token, "another-secret", now)).toBeNull();
  });

  it("過期的 token 驗不過", async () => {
    const now = Date.parse("2026-08-11T00:00:00.000Z");
    const { token } = await createToken(7, SECRET, now);
    expect(await verifyToken(token, SECRET, now + TOKEN_TTL_MS - 1)).toBe(7);
    expect(await verifyToken(token, SECRET, now + TOKEN_TTL_MS + 1)).toBeNull();
  });

  it("竄改 payload 讓 userId 變大就驗不過", async () => {
    const now = Date.parse("2026-08-11T00:00:00.000Z");
    const { token } = await createToken(7, SECRET, now);
    const [payload, signature] = token.split(".");
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, number>;
    decoded.userId = 1;
    const forged = btoa(JSON.stringify(decoded)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(await verifyToken(`${forged}.${signature}`, SECRET, now)).toBeNull();
  });

  it("格式不對的 token 只回 null，不丟例外", async () => {
    const now = Date.now();
    expect(await verifyToken("", SECRET, now)).toBeNull();
    expect(await verifyToken("only-one-part", SECRET, now)).toBeNull();
    expect(await verifyToken("a.b.c", SECRET, now)).toBeNull();
    expect(await verifyToken("!!!.###", SECRET, now)).toBeNull();
  });
});

describe("同步 Worker 的 last-write-wins 決策", () => {
  it("伺服器上沒有這筆就一定寫入", () => {
    expect(shouldOverwrite("2026-08-11T00:00:00.000Z", null)).toBe(true);
    expect(shouldOverwrite("2026-08-11T00:00:00.000Z", undefined)).toBe(true);
  });

  it("只有進來的比較新才覆寫", () => {
    expect(shouldOverwrite("2026-08-11T10:00:00.000Z", "2026-08-11T09:00:00.000Z")).toBe(true);
    expect(shouldOverwrite("2026-08-11T08:00:00.000Z", "2026-08-11T09:00:00.000Z")).toBe(false);
  });

  it("時間戳一樣就不覆寫（舊分頁蓋不掉新資料）", () => {
    expect(shouldOverwrite("2026-08-11T09:00:00.000Z", "2026-08-11T09:00:00.000Z")).toBe(false);
  });

  it("不同時區寫法也比得出來", () => {
    expect(shouldOverwrite("2026-08-11T18:00:00.000+08:00", "2026-08-11T09:00:00.000Z")).toBe(true);
    expect(shouldOverwrite("2026-08-11T17:00:00.000+08:00", "2026-08-11T09:00:00.000Z")).toBe(false);
  });

  it("進來的時間戳壞掉就不寫（fail closed）", () => {
    expect(shouldOverwrite("昨天", "2026-08-11T09:00:00.000Z")).toBe(false);
    expect(shouldOverwrite("", null)).toBe(false);
  });
});

describe("同步 Worker 的輸入檢查", () => {
  it("email 去空白轉小寫，格式不對回 null", () => {
    expect(normalizeEmail("  BBFCWHY@Gmail.com ")).toBe("bbfcwhy@gmail.com");
    expect(normalizeEmail("nope")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });

  it("密碼至少 8 個字元", () => {
    expect(isAcceptablePassword("12345678")).toBe(true);
    expect(isAcceptablePassword("1234567")).toBe(false);
    expect(isAcceptablePassword(undefined)).toBe(false);
    expect(isAcceptablePassword(12345678)).toBe(false);
  });

  it("密碼超過長度上限就拒絕，不讓超大字串進到 PBKDF2", () => {
    expect(MIN_PASSWORD_CHARS).toBe(8);
    expect(MAX_PASSWORD_CHARS).toBe(256);
    expect(isAcceptablePassword("a".repeat(MAX_PASSWORD_CHARS))).toBe(true);
    expect(isAcceptablePassword("a".repeat(MAX_PASSWORD_CHARS + 1))).toBe(false);
    expect(isAcceptablePassword("a".repeat(100_000))).toBe(false);
  });

  it("信封要有字串 payload 與解得開的 updatedAt", () => {
    expect(isValidEnvelope({ payload: "{}", updatedAt: "2026-08-11T00:00:00.000Z" })).toBe(true);
    expect(isValidEnvelope({ payload: "{}", updatedAt: "昨天" })).toBe(false);
    expect(isValidEnvelope({ payload: {}, updatedAt: "2026-08-11T00:00:00.000Z" })).toBe(false);
    expect(isValidEnvelope(null)).toBe(false);
  });

  it("超過長度上限的 payload 擋下來", () => {
    const huge = { payload: "x".repeat(MAX_PAYLOAD_CHARS + 1), updatedAt: "2026-08-11T00:00:00.000Z" };
    const fine = { payload: "x".repeat(MAX_PAYLOAD_CHARS), updatedAt: "2026-08-11T00:00:00.000Z" };
    expect(isValidEnvelope(huge)).toBe(false);
    expect(isValidEnvelope(fine)).toBe(true);
  });

  it("每日紀錄的 dateKey 一定要是 YYYY-MM-DD", () => {
    const base = { payload: "{}", updatedAt: "2026-08-11T00:00:00.000Z" };
    expect(isValidRecordEnvelope({ ...base, dateKey: "2026-08-11" })).toBe(true);
    expect(isValidRecordEnvelope({ ...base, dateKey: "2026-8-11" })).toBe(false);
    expect(isValidRecordEnvelope({ ...base, dateKey: "../../etc/passwd" })).toBe(false);
    expect(isValidRecordEnvelope(base)).toBe(false);
  });
});
