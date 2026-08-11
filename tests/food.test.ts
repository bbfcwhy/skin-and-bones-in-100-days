import { describe, expect, it } from "vitest";
import { computeNutrition, foods, searchFoods, type FoodItem } from "../src/lib/food";

const sample: FoodItem[] = [
  {
    id: "latte",
    name: "Latte 拿鐵",
    aliases: ["拿鐵咖啡"],
    category: "drink",
    kcalPer100g: 60,
    proteinPer100g: 3.2,
    units: [{ label: "1 中杯（約 360g）", grams: 360 }],
    note: "",
    source: "estimate",
  },
  {
    id: "test-contains",
    name: "冰美式拿鐵風味",
    aliases: [],
    category: "drink",
    kcalPer100g: 5,
    proteinPer100g: 0.2,
    units: [],
    note: "",
    source: "estimate",
  },
  {
    id: "test-alias-only",
    name: "黑咖啡",
    aliases: ["拿鐵替代品"],
    category: "drink",
    kcalPer100g: 2,
    proteinPer100g: 0.1,
    units: [],
    note: "",
    source: "estimate",
  },
];

function nameOf(items: FoodItem[]): string[] {
  return items.map((item) => item.name);
}

describe("食物搜尋", () => {
  it("空字串或只有空白時不給建議", () => {
    expect(searchFoods("")).toEqual([]);
    expect(searchFoods("   ")).toEqual([]);
  });

  it("完全沒命中就回空陣列，不要硬塞不相關的東西", () => {
    expect(searchFoods("完全不存在的食物名稱")).toEqual([]);
  });

  it("輸入「雞胸」找得到雞胸肉，名稱開頭命中排在包含命中前面", () => {
    const results = searchFoods("雞胸");
    const names = nameOf(results);

    expect(names[0]).toBe("雞胸肉（熟）");
    expect(names).toContain("雞胸肉（生，去皮）");
    expect(names.indexOf("雞胸肉（生，去皮）")).toBeLessThan(names.indexOf("超商即食雞胸肉"));
  });

  it("只有別名命中也找得到（珍奶 → 珍珠奶茶）", () => {
    const results = searchFoods("珍奶");

    expect(results.length).toBeGreaterThan(0);
    results.forEach((item) => expect(item.name).toContain("珍珠奶茶"));
  });

  it("排序是：名稱開頭 → 名稱包含 → 別名命中", () => {
    expect(nameOf(searchFoods("拿鐵", 8, sample))).toEqual([
      "Latte 拿鐵",
      "冰美式拿鐵風味",
      "黑咖啡",
    ]);
  });

  it("大小寫不敏感", () => {
    expect(nameOf(searchFoods("LATTE", 8, sample))).toEqual(["Latte 拿鐵"]);
    expect(nameOf(searchFoods("latte", 8, sample))).toEqual(["Latte 拿鐵"]);
  });

  it("全形數字與英文也對得上半形寫法", () => {
    const results = searchFoods("１ 碗");

    expect(nameOf(results)).toContain("陽春麵（1 碗）");
  });

  it("預設最多 8 筆，limit 可以再收窄", () => {
    expect(searchFoods("蛋").length).toBeLessThanOrEqual(8);
    expect(searchFoods("蛋", 3)).toHaveLength(3);
  });
});

describe("營養換算", () => {
  const chicken = foods.find((item) => item.id === "chicken-breast-cooked");

  it("資料庫裡有雞胸肉（熟），每 100g 是 165 kcal / 31 g", () => {
    expect(chicken).toBeDefined();
    expect(chicken?.kcalPer100g).toBe(165);
    expect(chicken?.proteinPer100g).toBe(31);
  });

  it("150 g 雞胸肉（熟）＝ 248 kcal、46.5 g 蛋白質", () => {
    expect(computeNutrition(chicken as FoodItem, 150)).toEqual({ calories: 248, protein: 46.5 });
  });

  it("常見份量按鈕帶入的克數，算出來跟手動輸入一樣", () => {
    const unit = (chicken as FoodItem).units[0];

    expect(unit.grams).toBe(150);
    expect(computeNutrition(chicken as FoodItem, unit.grams)).toEqual({ calories: 248, protein: 46.5 });
  });

  it("熱量四捨五入到整數，蛋白質留一位小數", () => {
    expect(computeNutrition(sample[0], 33)).toEqual({ calories: 20, protein: 1.1 });
    expect(computeNutrition(sample[1], 250)).toEqual({ calories: 13, protein: 0.5 });
  });

  it("克數是 0 或無效值時回 0，不要算出 NaN", () => {
    expect(computeNutrition(sample[0], 0)).toEqual({ calories: 0, protein: 0 });
    expect(computeNutrition(sample[0], Number.NaN)).toEqual({ calories: 0, protein: 0 });
    expect(computeNutrition(sample[0], -50)).toEqual({ calories: 0, protein: 0 });
  });
});

describe("食物資料庫", () => {
  it("222 筆資料，id 不重複", () => {
    expect(foods.length).toBe(222);
    expect(new Set(foods.map((item) => item.id)).size).toBe(foods.length);
  });

  it("每筆都有正的熱量密度與合理的份量設定", () => {
    foods.forEach((item) => {
      expect(item.name.length).toBeGreaterThan(0);
      expect(item.kcalPer100g).toBeGreaterThanOrEqual(0);
      expect(item.proteinPer100g).toBeGreaterThanOrEqual(0);
      item.units.forEach((unit) => {
        expect(unit.grams).toBeGreaterThan(0);
        expect(unit.label.length).toBeGreaterThan(0);
      });
    });
  });
});
