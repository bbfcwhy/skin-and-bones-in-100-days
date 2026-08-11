import { describe, expect, it } from "vitest";
import { applyProfileUpdate, applyRecordUpdate } from "../src/lib/record-updates";
import { createInitialState } from "../src/lib/storage";

describe("集中入口：改一筆紀錄一定會蓋上時間戳", () => {
  it("第一次改就補上 updatedAt", () => {
    const before = createInitialState();

    const after = applyRecordUpdate(before, "2026-08-11", (record) => {
      record.weight = 74.2;
    }, "2026-08-11T10:00:00.000Z");

    expect(after.records["2026-08-11"].weight).toBe(74.2);
    expect(after.records["2026-08-11"].updatedAt).toBe("2026-08-11T10:00:00.000Z");
  });

  it("再改一次時間戳會變新", () => {
    const first = applyRecordUpdate(createInitialState(), "2026-08-11", (record) => {
      record.weight = 74.2;
    }, "2026-08-11T10:00:00.000Z");

    const second = applyRecordUpdate(first, "2026-08-11", (record) => {
      record.checks["breakfast"] = true;
    }, "2026-08-11T11:00:00.000Z");

    const before = Date.parse(String(first.records["2026-08-11"].updatedAt));
    const after = Date.parse(String(second.records["2026-08-11"].updatedAt));
    expect(after).toBeGreaterThan(before);
    expect(second.records["2026-08-11"].checks["breakfast"]).toBe(true);
    expect(second.records["2026-08-11"].weight).toBe(74.2);
  });

  it("不會偷改別天的紀錄，也不會就地竄改傳進來的 state", () => {
    const before = applyRecordUpdate(createInitialState(), "2026-08-10", (record) => {
      record.steps = 8000;
    }, "2026-08-10T10:00:00.000Z");

    const after = applyRecordUpdate(before, "2026-08-11", (record) => {
      record.steps = 9000;
    }, "2026-08-11T10:00:00.000Z");

    expect(after.records["2026-08-10"].updatedAt).toBe("2026-08-10T10:00:00.000Z");
    expect(before.records["2026-08-11"]).toBeUndefined();
  });

  it("移除額外飲食也算修改，一樣蓋章", () => {
    const withFood = applyRecordUpdate(createInitialState(), "2026-08-11", (record) => {
      record.additionalFoods.push({
        id: "food-1",
        name: "珍奶",
        calories: 500,
        protein: 5,
        note: "",
        createdAt: "2026-08-11T09:00:00.000Z",
      });
    }, "2026-08-11T09:00:00.000Z");

    const removed = applyRecordUpdate(withFood, "2026-08-11", (record) => {
      record.additionalFoods = record.additionalFoods.filter((food) => food.id !== "food-1");
    }, "2026-08-11T09:30:00.000Z");

    expect(removed.records["2026-08-11"].additionalFoods).toHaveLength(0);
    expect(removed.records["2026-08-11"].updatedAt).toBe("2026-08-11T09:30:00.000Z");
  });
});

describe("集中入口：改個人設定一定會蓋上時間戳", () => {
  it("改目標體重會蓋章，其他欄位保留", () => {
    const before = createInitialState();

    const after = applyProfileUpdate(before, { goalWeight: 68 }, "2026-08-11T10:00:00.000Z");

    expect(after.profile.goalWeight).toBe(68);
    expect(after.profile.cupSizeMl).toBe(before.profile.cupSizeMl);
    expect(after.profile.updatedAt).toBe("2026-08-11T10:00:00.000Z");
    expect(before.profile.updatedAt).toBeUndefined();
  });

  it("紀錄不會被 profile 的修改波及", () => {
    const withRecord = applyRecordUpdate(createInitialState(), "2026-08-11", (record) => {
      record.weight = 74;
    }, "2026-08-11T10:00:00.000Z");

    const after = applyProfileUpdate(withRecord, { trackWaist: true }, "2026-08-11T12:00:00.000Z");

    expect(after.records["2026-08-11"].updatedAt).toBe("2026-08-11T10:00:00.000Z");
    expect(after.profile.trackWaist).toBe(true);
  });
});
