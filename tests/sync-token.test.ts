import { describe, expect, it } from "vitest";
import {
  SYNC_TOKEN_KEY,
  clearSession,
  readSession,
  touchLastSynced,
  writeSession,
  type StorageLike,
} from "../src/lib/sync-token";
import { STORAGE_KEY, createInitialState, ensureDailyRecord, serializeState } from "../src/lib/storage";
import { stampProfile, stampRecord } from "../src/lib/sync";

function memoryStorage(): StorageLike & { dump(): Record<string, string> } {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    dump: () => Object.fromEntries(data),
  };
}

const future = "2099-01-01T00:00:00.000Z";
const past = "2020-01-01T00:00:00.000Z";

describe("同步 token 的儲存", () => {
  it("token 存在自己的 key，不跟 app 資料混在一起", () => {
    const storage = memoryStorage();
    writeSession(storage, { token: "secret-token-abc", expiresAt: future, email: "will@example.com" });

    expect(SYNC_TOKEN_KEY).not.toBe(STORAGE_KEY);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(String(storage.getItem(SYNC_TOKEN_KEY))).toContain("secret-token-abc");
  });

  it("寫進去讀得回來", () => {
    const storage = memoryStorage();
    writeSession(storage, { token: "t1", expiresAt: future, email: "will@example.com" });

    const state = readSession(storage);

    expect(state.expired).toBe(false);
    expect(state.session?.token).toBe("t1");
    expect(state.session?.email).toBe("will@example.com");
  });

  it("過期的 token 讀不出來，而且會標記成 expired", () => {
    const storage = memoryStorage();
    writeSession(storage, { token: "t1", expiresAt: past });

    const state = readSession(storage);

    expect(state.session).toBeNull();
    expect(state.expired).toBe(true);
  });

  it("沒登入過或內容壞掉時回 null 且不算過期", () => {
    const storage = memoryStorage();
    expect(readSession(storage)).toEqual({ session: null, expired: false });

    storage.setItem(SYNC_TOKEN_KEY, "{ 這不是 JSON");
    expect(readSession(storage)).toEqual({ session: null, expired: false });
  });

  it("登出只清 token，不動本機紀錄", () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, serializeState(createInitialState()));
    writeSession(storage, { token: "t1", expiresAt: future });

    clearSession(storage);

    expect(storage.getItem(SYNC_TOKEN_KEY)).toBeNull();
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("記錄上次同步時間時不會弄丟 token", () => {
    const storage = memoryStorage();
    writeSession(storage, { token: "t1", expiresAt: future });

    touchLastSynced(storage, "2026-08-11T04:30:00.000Z");

    const state = readSession(storage);
    expect(state.session?.token).toBe("t1");
    expect(state.session?.lastSyncedAt).toBe("2026-08-11T04:30:00.000Z");
  });
});

describe("備份不得挾帶 token", () => {
  it("serializeState 的輸出裡沒有 token 字樣，也沒有 token 值", () => {
    const storage = memoryStorage();
    writeSession(storage, { token: "secret-token-abc", expiresAt: future, email: "will@example.com" });

    let state = createInitialState();
    const ensured = ensureDailyRecord(state, "2026-08-11");
    state = ensured.state;
    state.records["2026-08-11"] = stampRecord({ ...ensured.record, weight: 74.2 });
    state.profile = stampProfile({ ...state.profile, startWeight: 75 });

    const backup = serializeState(state);

    expect(backup).not.toContain("secret-token-abc");
    expect(backup.toLowerCase()).not.toContain("token");
    expect(backup.toLowerCase()).not.toContain("password");
  });
});
