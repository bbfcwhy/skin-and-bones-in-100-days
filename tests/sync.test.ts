import { describe, expect, it } from "vitest";
import {
  EPOCH_ISO,
  buildPushPayload,
  mergeStates,
  remoteStateFromPull,
  stampProfile,
  stampRecord,
} from "../src/lib/sync";
import { createInitialState, ensureDailyRecord } from "../src/lib/storage";
import type { AppState } from "../src/lib/types";

function stateWith(
  entries: Array<{ dateKey: string; weight: number | null; updatedAt?: string }>,
  profileUpdatedAt?: string,
): AppState {
  let state = createInitialState();
  entries.forEach(({ dateKey, weight, updatedAt }) => {
    const ensured = ensureDailyRecord(state, dateKey);
    state = ensured.state;
    state.records[dateKey].weight = weight;
    if (updatedAt) state.records[dateKey].updatedAt = updatedAt;
  });
  if (profileUpdatedAt) state.profile.updatedAt = profileUpdatedAt;
  return state;
}

describe("跨瀏覽器同步的合併演算法", () => {
  it("兩邊互有新舊時，逐筆各自取較新的版本", () => {
    const local = stateWith([
      { dateKey: "2026-08-10", weight: 74.1, updatedAt: "2026-08-10T12:00:00.000Z" },
      { dateKey: "2026-08-11", weight: 73.8, updatedAt: "2026-08-11T02:00:00.000Z" },
    ]);
    const remote = stateWith([
      { dateKey: "2026-08-10", weight: 99, updatedAt: "2026-08-10T09:00:00.000Z" },
      { dateKey: "2026-08-11", weight: 73.5, updatedAt: "2026-08-11T08:00:00.000Z" },
    ]);

    const { merged, localNewer, remoteNewer } = mergeStates(local, remote);

    expect(merged.records["2026-08-10"].weight).toBe(74.1);
    expect(merged.records["2026-08-11"].weight).toBe(73.5);
    expect(localNewer).toEqual(["2026-08-10"]);
    expect(remoteNewer).toEqual(["2026-08-11"]);
  });

  it("只存在於單邊的日期一定會保留，並標記成該邊較新", () => {
    const local = stateWith([
      { dateKey: "2026-08-10", weight: 74.1, updatedAt: "2026-08-10T12:00:00.000Z" },
    ]);
    const remote = stateWith([
      { dateKey: "2026-08-20", weight: 72.4, updatedAt: "2026-08-20T12:00:00.000Z" },
    ]);

    const { merged, localNewer, remoteNewer } = mergeStates(local, remote);

    expect(Object.keys(merged.records).sort()).toEqual(["2026-08-10", "2026-08-20"]);
    expect(localNewer).toEqual(["2026-08-10"]);
    expect(remoteNewer).toEqual(["2026-08-20"]);
  });

  it("沒有 updatedAt 視為最舊，會被有時間戳的那邊蓋過", () => {
    const local = stateWith([{ dateKey: "2026-08-10", weight: 74.1 }]);
    const remote = stateWith([
      { dateKey: "2026-08-10", weight: 70, updatedAt: "2020-01-01T00:00:00.000Z" },
    ]);

    const { merged, remoteNewer } = mergeStates(local, remote);

    expect(merged.records["2026-08-10"].weight).toBe(70);
    expect(remoteNewer).toEqual(["2026-08-10"]);
  });

  it("兩邊都沒有 updatedAt 時取 local，內容不同才需要推上去", () => {
    const local = stateWith([{ dateKey: "2026-08-10", weight: 74.1 }]);
    const remote = stateWith([{ dateKey: "2026-08-10", weight: 70 }]);

    const differing = mergeStates(local, remote);
    expect(differing.merged.records["2026-08-10"].weight).toBe(74.1);
    expect(differing.localNewer).toEqual(["2026-08-10"]);
    expect(differing.remoteNewer).toEqual([]);

    const identical = mergeStates(local, structuredClone(local));
    expect(identical.localNewer).toEqual([]);
    expect(identical.remoteNewer).toEqual([]);
  });

  it("時間戳相同但內容不同時取 local，並標記需要推上去", () => {
    const local = stateWith([
      { dateKey: "2026-08-10", weight: 74.1, updatedAt: "2026-08-10T12:00:00.000Z" },
    ]);
    const remote = stateWith([
      { dateKey: "2026-08-10", weight: 70, updatedAt: "2026-08-10T12:00:00.000Z" },
    ]);

    const { merged, localNewer, remoteNewer } = mergeStates(local, remote);

    expect(merged.records["2026-08-10"].weight).toBe(74.1);
    expect(localNewer).toEqual(["2026-08-10"]);
    expect(remoteNewer).toEqual([]);
  });

  it("profile 也比 updatedAt，並回報採用了哪一邊", () => {
    const local = stateWith([], "2026-08-10T00:00:00.000Z");
    local.profile.goalWeight = 65;
    const remote = stateWith([], "2026-08-11T00:00:00.000Z");
    remote.profile.goalWeight = 68;

    const remoteWins = mergeStates(local, remote);
    expect(remoteWins.merged.profile.goalWeight).toBe(68);
    expect(remoteWins.profileSource).toBe("remote");

    const localWins = mergeStates(remote, local);
    expect(localWins.merged.profile.goalWeight).toBe(68);
    expect(localWins.profileSource).toBe("local");
  });

  it("profile 兩邊都沒有 updatedAt 時取 local", () => {
    const local = createInitialState();
    local.profile.cupSizeMl = 500;
    const remote = createInitialState();
    remote.profile.cupSizeMl = 900;

    const { merged, profileSource } = mergeStates(local, remote);

    expect(merged.profile.cupSizeMl).toBe(500);
    expect(profileSource).toBe("local");
  });

  it("筆數對帳：合併後的日期集合等於兩邊的聯集", () => {
    const local = stateWith([
      { dateKey: "2026-08-10", weight: 74.1, updatedAt: "2026-08-10T12:00:00.000Z" },
      { dateKey: "2026-08-11", weight: 74, updatedAt: "2026-08-11T12:00:00.000Z" },
      { dateKey: "2026-08-12", weight: 73.9 },
    ]);
    const remote = stateWith([
      { dateKey: "2026-08-11", weight: 73.7, updatedAt: "2026-08-11T20:00:00.000Z" },
      { dateKey: "2026-08-13", weight: 73.5, updatedAt: "2026-08-13T12:00:00.000Z" },
      { dateKey: "2026-08-14", weight: 73.4, updatedAt: "2026-08-14T12:00:00.000Z" },
    ]);
    const union = new Set([...Object.keys(local.records), ...Object.keys(remote.records)]);

    const { merged, localNewer, remoteNewer } = mergeStates(local, remote);

    expect(Object.keys(merged.records)).toHaveLength(union.size);
    expect(new Set(Object.keys(merged.records))).toEqual(union);
    expect(Object.keys(merged.records)).toHaveLength(5);
    // 每個鍵最多出現在一份差異清單裡，兩份加起來不會超過聯集
    expect(localNewer.filter((key) => remoteNewer.includes(key))).toEqual([]);
    expect(localNewer.length + remoteNewer.length).toBeLessThanOrEqual(union.size);
  });

  it("合併不會改動傳入的兩個 state", () => {
    const local = stateWith([
      { dateKey: "2026-08-10", weight: 74.1, updatedAt: "2026-08-10T12:00:00.000Z" },
    ]);
    const remote = stateWith([
      { dateKey: "2026-08-10", weight: 70, updatedAt: "2026-08-11T12:00:00.000Z" },
    ]);
    const localBefore = structuredClone(local);
    const remoteBefore = structuredClone(remote);

    const { merged } = mergeStates(local, remote);
    merged.records["2026-08-10"].weight = 1;

    expect(local).toEqual(localBefore);
    expect(remote).toEqual(remoteBefore);
  });
});

describe("同步 payload 的組裝與還原", () => {
  it("buildPushPayload 預設推送全部日期，缺時間戳補 EPOCH", () => {
    const state = stateWith(
      [
        { dateKey: "2026-08-10", weight: 74.1, updatedAt: "2026-08-10T12:00:00.000Z" },
        { dateKey: "2026-08-11", weight: 73.8 },
      ],
      "2026-08-10T12:00:00.000Z",
    );

    const payload = buildPushPayload(state);

    expect(payload.records).toHaveLength(2);
    expect(payload.profile?.updatedAt).toBe("2026-08-10T12:00:00.000Z");
    const missing = payload.records.find((item) => item.dateKey === "2026-08-11");
    expect(missing?.updatedAt).toBe(EPOCH_ISO);
    expect(JSON.parse(missing!.payload).weight).toBe(73.8);
  });

  it("buildPushPayload 可只推指定日期，並略過不存在的鍵", () => {
    const state = stateWith([
      { dateKey: "2026-08-10", weight: 74.1, updatedAt: "2026-08-10T12:00:00.000Z" },
      { dateKey: "2026-08-11", weight: 73.8, updatedAt: "2026-08-11T12:00:00.000Z" },
    ]);

    const payload = buildPushPayload(state, { dateKeys: ["2026-08-11", "2026-09-01"], includeProfile: false });

    expect(payload.records.map((item) => item.dateKey)).toEqual(["2026-08-11"]);
    expect(payload.profile).toBeUndefined();
  });

  it("remoteStateFromPull 把伺服器回應還原成 AppState，profile 為 null 時沿用本機", () => {
    const local = stateWith([], "2026-08-10T12:00:00.000Z");
    local.profile.cupSizeMl = 500;

    const state = remoteStateFromPull(
      {
        profile: null,
        records: [
          {
            dateKey: "2026-08-12",
            payload: JSON.stringify({ dateKey: "2026-08-12", weight: 73.2 }),
            updatedAt: "2026-08-12T12:00:00.000Z",
          },
        ],
      },
      local,
    );

    expect(state.profile.cupSizeMl).toBe(500);
    expect(state.profile.updatedAt).toBeUndefined();
    expect(state.records["2026-08-12"].updatedAt).toBe("2026-08-12T12:00:00.000Z");
    expect(state.records["2026-08-12"].waterCups).toEqual([false, false, false]);
  });

  it("remoteStateFromPull 忽略壞掉的 payload，不讓一筆爛資料炸掉整次同步", () => {
    const local = createInitialState();

    const state = remoteStateFromPull(
      {
        profile: null,
        records: [
          { dateKey: "2026-08-12", payload: "{壞掉的 JSON", updatedAt: "2026-08-12T12:00:00.000Z" },
          {
            dateKey: "2026-08-13",
            payload: JSON.stringify({ dateKey: "2026-08-13", weight: 73 }),
            updatedAt: "2026-08-13T12:00:00.000Z",
          },
        ],
      },
      local,
    );

    expect(Object.keys(state.records)).toEqual(["2026-08-13"]);
  });

  it("stampRecord / stampProfile 蓋上時間戳但不動其他欄位", () => {
    const state = stateWith([{ dateKey: "2026-08-10", weight: 74.1 }]);
    const now = "2026-08-11T05:00:00.000Z";

    const record = stampRecord(state.records["2026-08-10"], now);
    const profile = stampProfile(state.profile, now);

    expect(record.updatedAt).toBe(now);
    expect(record.weight).toBe(74.1);
    expect(profile.updatedAt).toBe(now);
    expect(profile.cupSizeMl).toBe(state.profile.cupSizeMl);
  });
});
