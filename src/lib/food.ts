import rawFoods from "../data/foods.json";

/**
 * 內建食物營養資料庫的查詢與換算。
 *
 * 目的：使用者記錄「吃了什麼」時不必自己查熱量與蛋白質，輸入名稱選到食物、
 * 填克數就換算好。資料是靜態 JSON，離線也能用；換算結果只是預設值，
 * 使用者仍然可以在表單裡手動改。
 */

export type FoodCategory = "protein" | "staple" | "vegfruit" | "eatery" | "drink" | "snack";

/** tfnd＝台灣食品成分資料庫、usda＝美國農業部資料庫、estimate＝依常見標示估算。 */
export type FoodSource = "tfnd" | "usda" | "estimate";

export interface FoodUnit {
  /** 給人看的份量說明，例如「1 片（約 150g）」。 */
  label: string;
  grams: number;
}

export interface FoodItem {
  id: string;
  name: string;
  aliases: string[];
  category: FoodCategory;
  kcalPer100g: number;
  proteinPer100g: number;
  units: FoodUnit[];
  /** 需要提醒的但書（例如珍奶不含珍珠、各店差異大），沒有就是空字串。 */
  note: string;
  source: FoodSource;
}

export const foods: FoodItem[] = rawFoods as FoodItem[];

/** 全形轉半形、全形空白轉半形空白、去頭尾空白、轉小寫，讓比對不挑輸入法。 */
function normalize(value: string): string {
  return value
    .replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ")
    .trim()
    .toLowerCase();
}

/** 命中等級：名稱開頭 0 ＜ 名稱包含 1 ＜ 別名包含 2，數字小的排前面。 */
function matchRank(item: FoodItem, needle: string): number {
  const name = normalize(item.name);
  if (name.startsWith(needle)) return 0;
  if (name.includes(needle)) return 1;
  if (item.aliases.some((alias) => normalize(alias).includes(needle))) return 2;
  return -1;
}

/**
 * 依輸入的字串找食物。空字串或全空白回空陣列（不要一打開就跳一堆建議）。
 * source 參數只給測試注入自訂資料用，正式呼叫都吃內建資料庫。
 */
export function searchFoods(query: string, limit = 8, source: FoodItem[] = foods): FoodItem[] {
  const needle = normalize(query);
  if (!needle) return [];

  const matched: Array<{ item: FoodItem; rank: number; index: number }> = [];
  source.forEach((item, index) => {
    const rank = matchRank(item, needle);
    if (rank >= 0) matched.push({ item, rank, index });
  });

  matched.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return matched.slice(0, Math.max(0, limit)).map((entry) => entry.item);
}

/**
 * 每 100g 線性換算。熱量取整數、蛋白質留一位小數——
 * 這是估算不是實驗室數據，小數點後再多位只是假精確。
 */
export function computeNutrition(food: FoodItem, grams: number): { calories: number; protein: number } {
  if (!Number.isFinite(grams) || grams <= 0) return { calories: 0, protein: 0 };
  const ratio = grams / 100;
  return {
    calories: Math.round(food.kcalPer100g * ratio),
    protein: Math.round(food.proteinPer100g * ratio * 10) / 10,
  };
}
