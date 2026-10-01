<!-- 此檔由第二大腦自動同步，請勿手改；要改請改 vault 的 000_Agent/memory/project-decisions/skin-and-bones-in-100-days.md -->
<!-- 最後同步：2026-10-01 10:57:57 -->

# skin-and-bones-in-100-days — 結論延續

> 100 天減脂計畫（2026-08-10 第 1 天，11-17 第 100 天）的執行輔助工具。
> 計畫內容的唯一真相是 vault 的計畫頁：`100_Todo/projects/健康管理/2026-08-09_內臟脂肪減脂週計畫.html`。

## 2026-10-01｜改方向：Mac 桌面浮動小視窗，取代手機記錄網頁

- 新目標：威爾的 Mac 桌面上一直浮著一個半透明小視窗，提醒他照減脂計畫走，一鍵打勾，看得到進度。
- 起因：8 月的手機記錄網頁 8/25 後就沒在用。威爾判斷原因有兩個：平常看不到就忘了打開，加上每餐輸入太麻煩。新工具兩個都要解決：一直看得到、只留一鍵打勾。
- 10/8 復職後白天上班和在家都用同一台 Mac，所以第一版只做 Mac。
- 邊界：不做餐點輸入、數字記錄、iPhone、跨裝置同步、通知、自動判定。
- 規格：專案 `docs/2026-10-01_Mac浮動小視窗規格.md`。

## 2026-10-01｜技術選型：SwiftUI 重寫，放在同一個 repo

- 評估過三種做法：Swift 外殼包網頁（NSPanel＋WKWebView）、Electron（參考 CatsOnDesk 的透明置頂視窗）、SwiftUI 重寫。威爾選 SwiftUI 重寫。
- 理由：拿掉記錄與同步後，網頁版能沿用的邏輯只剩約 550 行；SwiftUI 最輕、最原生，NSPanel 點了不搶焦點，整天常駐不吃記憶體；之後要加通知、選單列、桌面 widget、iPhone 都好接。
- 舊的 Next.js 網頁程式（app/、src/、tests/、workers/ 等）保留不刪，標成舊版、不再開發。要刪除前先問威爾。
- 部署在 Cloudflare 的同步服務（skin-bones-sync.lazzymerlin.workers.dev，D1 資料庫）從來沒人註冊使用，仍在執行；要不要關，由威爾決定。

## 2026-10-01｜計畫內容以計畫頁為準

- 週課表、A/B 輪替、熱量目標都照計畫頁的 JS（getNutritionTargets、strengthPlans、cardioPlans）移植。
- 舊版 `src/lib/plan.ts` 有四處過時，不能當來源：肌酸時間（現行是起床配第 1 杯水）、週二運動（現行是間歇有氧）、步數（現行是 10,000）、A/B 輪替規則（現行是 A-B-A 週與 B-A-B 週交替）。
- 驗證方式：用 node 跑計畫頁的 JS，產生 10/1 到 11/17 每一天的期望值，當 Swift 測試的 fixture 逐日比對。
- 計畫頁改版時，App 要跟著改，改完重產 fixture。
