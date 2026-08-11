import { describe, expect, it, vi } from "vitest";
import { runFullSync, runPush, type SyncRunnerDeps } from "../src/lib/sync-runner";
import type { SyncFailure, SyncResult } from "../src/lib/sync-client";
import type { SyncPullResponse, SyncPushPayload } from "../src/lib/sync";
import { createInitialState, ensureDailyRecord } from "../src/lib/storage";
import type { AppState } from "../src/lib/types";

function stateWith(dateKey: string, weight: number, updatedAt: string): AppState {
  let state = createInitialState();
  const ensured = ensureDailyRecord(state, dateKey);
  state = ensured.state;
  state.records[dateKey].weight = weight;
  state.records[dateKey].updatedAt = updatedAt;
  return state;
}

function pullOf(entries: Array<{ dateKey: string; weight: number; updatedAt: string }>): SyncPullResponse {
  return {
    profile: null,
    records: entries.map(({ dateKey, weight, updatedAt }) => ({
      dateKey,
      payload: JSON.stringify({ dateKey, weight, updatedAt }),
      updatedAt,
    })),
  };
}

const failure = (kind: SyncFailure["kind"], message: string): SyncFailure => ({
  ok: false,
  kind,
  status: kind === "unauthorized" ? 401 : null,
  message,
});

function deps(overrides: Partial<SyncRunnerDeps> & { local: AppState }): SyncRunnerDeps & {
  written: AppState[];
  pushed: SyncPushPayload[];
} {
  const written: AppState[] = [];
  const pushed: SyncPushPayload[] = [];
  const base: SyncRunnerDeps = {
    readLocal: () => overrides.local,
    writeLocal: (state) => void written.push(state),
    pull: async () => ({ ok: true, data: pullOf([]) }) as SyncResult<SyncPullResponse>,
    push: async (payload) => {
      pushed.push(payload);
      return { ok: true, data: null };
    },
    ...overrides,
  };
  return { ...base, written, pushed };
}

describe("全量同步流程", () => {
  it("拉下來合併後先寫本機，再只推本機比較新的那幾天", async () => {
    const local = stateWith("2026-08-11", 74.1, "2026-08-11T10:00:00.000Z");
    const runner = deps({
      local,
      pull: async () => ({
        ok: true,
        data: pullOf([{ dateKey: "2026-08-09", weight: 75, updatedAt: "2026-08-09T10:00:00.000Z" }]),
      }),
    });

    const outcome = await runFullSync(runner);

    expect(outcome.status).toBe("synced");
    // 合併後本機要同時有兩天的資料
    expect(runner.written).toHaveLength(1);
    expect(Object.keys(runner.written[0].records).sort()).toEqual(["2026-08-09", "2026-08-11"]);
    expect(runner.written[0].records["2026-08-09"].weight).toBe(75);
    // 只推本機比較新的 2026-08-11
    expect(runner.pushed).toHaveLength(1);
    expect(runner.pushed[0].records.map((item) => item.dateKey)).toEqual(["2026-08-11"]);
  });

  it("伺服器上比較新的版本會蓋掉本機的舊資料", async () => {
    const local = stateWith("2026-08-11", 74.1, "2026-08-11T10:00:00.000Z");
    const runner = deps({
      local,
      pull: async () => ({
        ok: true,
        data: pullOf([{ dateKey: "2026-08-11", weight: 73.2, updatedAt: "2026-08-11T20:00:00.000Z" }]),
      }),
    });

    const outcome = await runFullSync(runner);

    expect(outcome.status).toBe("synced");
    expect(runner.written[0].records["2026-08-11"].weight).toBe(73.2);
    expect(runner.pushed).toHaveLength(0);
  });

  it("pull 失敗（沒網路）時完全不動本機資料", async () => {
    const local = stateWith("2026-08-11", 74.1, "2026-08-11T10:00:00.000Z");
    const runner = deps({ local, pull: async () => failure("network", "連不上同步服務。") });

    const outcome = await runFullSync(runner);

    expect(outcome.status).toBe("offline");
    expect(runner.written).toHaveLength(0);
    expect(runner.pushed).toHaveLength(0);
  });

  it("push 失敗時本機已經寫好了，只標記成待同步", async () => {
    const local = stateWith("2026-08-11", 74.1, "2026-08-11T10:00:00.000Z");
    const runner = deps({
      local,
      pull: async () => ({ ok: true, data: pullOf([]) }),
      push: async () => failure("network", "連不上同步服務。"),
    });

    const outcome = await runFullSync(runner);

    expect(outcome.status).toBe("pending");
    expect(runner.written).toHaveLength(1);
    expect(runner.written[0].records["2026-08-11"].weight).toBe(74.1);
  });

  it("token 失效時回報 unauthorized，本機資料照樣不動", async () => {
    const local = stateWith("2026-08-11", 74.1, "2026-08-11T10:00:00.000Z");
    const runner = deps({ local, pull: async () => failure("unauthorized", "登入已過期，請重新登入。") });

    const outcome = await runFullSync(runner);

    expect(outcome.status).toBe("unauthorized");
    expect(runner.written).toHaveLength(0);
  });

  it("本機沒有任何比較新的資料時就不發 push", async () => {
    const local = createInitialState();
    const runner = deps({ local, pull: async () => ({ ok: true, data: pullOf([]) }) });

    const outcome = await runFullSync(runner);

    expect(outcome.status).toBe("synced");
    expect(runner.pushed).toHaveLength(0);
  });
});

describe("變更後的增量推送", () => {
  it("只推指定的日期，成功後回 synced", async () => {
    const local = stateWith("2026-08-11", 74.1, "2026-08-11T10:00:00.000Z");
    const ensured = ensureDailyRecord(local, "2026-08-12");
    Object.assign(local, ensured.state);
    const runner = deps({ local });

    const outcome = await runPush(runner, { dateKeys: ["2026-08-11"], includeProfile: false });

    expect(outcome.status).toBe("synced");
    expect(runner.pushed[0].records.map((item) => item.dateKey)).toEqual(["2026-08-11"]);
    expect(runner.pushed[0].profile).toBeUndefined();
  });

  it("要求推 profile 時 payload 會帶上 profile", async () => {
    const local = createInitialState();
    local.profile.updatedAt = "2026-08-11T10:00:00.000Z";
    const runner = deps({ local });

    await runPush(runner, { dateKeys: [], includeProfile: true });

    expect(runner.pushed[0].profile?.updatedAt).toBe("2026-08-11T10:00:00.000Z");
  });

  it("沒有東西要推時不發 request", async () => {
    const runner = deps({ local: createInitialState() });
    const spy = vi.spyOn(runner, "push");

    const outcome = await runPush(runner, { dateKeys: [], includeProfile: false });

    expect(outcome.status).toBe("synced");
    expect(spy).not.toHaveBeenCalled();
  });

  it("推送失敗時回 pending，讓 UI 顯示有變更待同步", async () => {
    const local = stateWith("2026-08-11", 74.1, "2026-08-11T10:00:00.000Z");
    const runner = deps({ local, push: async () => failure("network", "連不上同步服務。") });

    const outcome = await runPush(runner, { dateKeys: ["2026-08-11"], includeProfile: false });

    expect(outcome.status).toBe("pending");
  });

  it("token 失效時回 unauthorized", async () => {
    const local = stateWith("2026-08-11", 74.1, "2026-08-11T10:00:00.000Z");
    const runner = deps({ local, push: async () => failure("unauthorized", "登入已過期，請重新登入。") });

    const outcome = await runPush(runner, { dateKeys: ["2026-08-11"], includeProfile: false });

    expect(outcome.status).toBe("unauthorized");
  });
});
