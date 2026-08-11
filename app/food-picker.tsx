"use client";

/**
 * 食物選擇器（搜尋內建資料庫 → 填克數 → 自動換算熱量與蛋白質）。
 *
 * 抽成共用元件的原因：正餐逐筆記錄與臨時加餐都要同一套操作手感，
 * 各寫一份遲早會漂移成兩種行為。
 *
 * 這個元件不往外拋值，欄位就是原生 input（name＝name／grams／calories／protein），
 * 由外層 form 用 FormData 讀——跟這個專案原本的表單寫法一致。
 * 送出後要清空：外層換掉 key 讓它重新掛載即可。
 */

import { type KeyboardEvent, useMemo, useState } from "react";
import { computeNutrition, searchFoods, type FoodItem } from "@/src/lib/food";

interface FoodPickerProps {
  /** 同一頁會有兩個選擇器，用這個前綴讓 listbox 的 id 與 aria-controls 不會互相打架。 */
  idPrefix: string;
  nameLabel: string;
  namePlaceholder: string;
  /**
   * 開啟「自訂項目」切換：不查資料庫，直接填名稱與數字（例：雞腿便當 850）。
   * 臨時加餐維持原本只有搜尋的樣子，所以預設關閉。
   */
  allowCustom?: boolean;
}

export default function FoodPicker({ idPrefix, nameLabel, namePlaceholder, allowCustom = false }: FoodPickerProps) {
  const [custom, setCustom] = useState(false);
  const [query, setQuery] = useState("");
  const [choice, setChoice] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const suggestions = useMemo(
    () => (listOpen && !custom ? searchFoods(query) : []),
    [custom, listOpen, query],
  );
  const listId = `${idPrefix}-food-suggestions`;

  /** 克數一變就重算熱量與蛋白質；算出來只是預設值，使用者還是能自己覆寫。 */
  const setGramsAndNutrition = (value: string) => {
    setGrams(value);
    if (!choice) return;
    const amount = Number(value);
    if (value.trim() === "" || !Number.isFinite(amount) || amount <= 0) {
      setCalories("");
      setProtein("");
      return;
    }
    const nutrition = computeNutrition(choice, amount);
    setCalories(String(nutrition.calories));
    setProtein(String(nutrition.protein));
  };

  const chooseFood = (food: FoodItem) => {
    setChoice(food);
    setQuery(food.name);
    setListOpen(false);
    setHighlight(0);
    setGrams("");
    setCalories("");
    setProtein("");
  };

  /** 自己改名字＝不再跟著資料庫走，但已經填好的數字留著讓使用者自己調。 */
  const typeFoodName = (value: string) => {
    setQuery(value);
    setListOpen(true);
    setHighlight(0);
    setChoice(null);
    setGrams("");
  };

  const onFoodNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      chooseFood(suggestions[highlight] ?? suggestions[0]);
    } else if (event.key === "Escape") {
      setListOpen(false);
    }
  };

  /** 切換模式時保留已經打好的名字與數字，只丟掉跟資料庫綁定的部分。 */
  const switchMode = (nextCustom: boolean) => {
    setCustom(nextCustom);
    setChoice(null);
    setGrams("");
    setListOpen(false);
    setHighlight(0);
  };

  return (
    <>
      {allowCustom && (
        <div className="wide picker-mode" role="group" aria-label="記錄方式">
          <button type="button" className={custom ? "" : "active"} onClick={() => switchMode(false)}>查食物資料庫</button>
          <button type="button" className={custom ? "active" : ""} onClick={() => switchMode(true)}>自訂項目</button>
        </div>
      )}

      <div className="wide food-search">
        <label>{nameLabel}
          <input
            name="name"
            required
            autoComplete="off"
            placeholder={custom ? "例：雞腿便當、公司便當" : namePlaceholder}
            value={query}
            onChange={(event) => (custom ? setQuery(event.target.value) : typeFoodName(event.target.value))}
            onKeyDown={custom ? undefined : onFoodNameKeyDown}
            role={custom ? undefined : "combobox"}
            aria-expanded={custom ? undefined : suggestions.length > 0}
            aria-controls={custom ? undefined : listId}
          />
        </label>
        {suggestions.length > 0 && (
          <div className="food-suggestions" id={listId} role="listbox" onMouseDown={(event) => event.preventDefault()}>
            {suggestions.map((food, index) => (
              <button
                type="button"
                key={food.id}
                role="option"
                aria-selected={index === highlight}
                className={index === highlight ? "active" : ""}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => chooseFood(food)}
              >
                <strong>{food.name}</strong>
                <small>每 100g {food.kcalPer100g} kcal · 蛋白質 {food.proteinPer100g} g</small>
              </button>
            ))}
          </div>
        )}
      </div>
      {choice && (
        <div className="wide food-portion">
          <label>吃了多少<input name="grams" type="number" inputMode="decimal" min="1" step="1" placeholder="輸入克數，下面數字會自動算" value={grams} onChange={(event) => setGramsAndNutrition(event.target.value)} /><span>g</span></label>
          {choice.units.length > 0 && (
            <div className="portion-buttons">
              {choice.units.map((unit) => (
                <button
                  type="button"
                  key={unit.label}
                  className={grams !== "" && Number(grams) === unit.grams ? "active" : ""}
                  onClick={() => setGramsAndNutrition(String(unit.grams))}
                >{unit.label}</button>
              ))}
            </div>
          )}
        </div>
      )}
      <label>熱量<input name="calories" type="number" inputMode="numeric" placeholder="不知道可留空" value={calories} onChange={(event) => setCalories(event.target.value)} /><span>kcal</span></label>
      <label>蛋白質<input name="protein" type="number" inputMode="decimal" step="0.1" placeholder="選填" value={protein} onChange={(event) => setProtein(event.target.value)} /><span>g</span></label>
      {choice && choice.note !== "" && <p className="wide food-note">提醒：{choice.note}</p>}
    </>
  );
}
