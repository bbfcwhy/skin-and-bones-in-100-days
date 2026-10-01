# CLAUDE.md

## 專案概述

Mac 桌面上一直浮著的半透明小視窗：提醒威爾照 100 天減脂計畫走，一鍵打勾，看得到進度。2026-10-01 起改成這個方向，規格見 `docs/2026-10-01_Mac浮動小視窗規格.md`。

- 計畫內容的唯一真相是 vault 計畫頁（路徑寫在規格第一段）。舊版 `src/lib/plan.ts` 已過時，不能當來源。
- 第二大腦的決策結論見 `docs/BRAIN-DECISIONS.md`（vault 鏡像，勿手改）。

## 技術棧

- 現行：SwiftUI（macOS）＋ Swift Testing。
- 舊版：Next.js ＋ TypeScript 的手機記錄網頁，保留不刪、不再開發。要刪除舊檔前先問威爾。

## 資料夾結構

- `docs/` — 規格、設計、PRD（被 2nd Brain symlink）
- `mac/` — Mac App（現行）
  - `project.yml` — XcodeGen 設定，`SkinAndBones.xcodeproj` 由它產生
  - `SkinAndBones/` — App 外殼：浮動視窗、選單列、開機啟動、存檔位置（碰系統 API 的薄轉接層）
  - `SkinAndBonesCore/` — 純邏輯：週課表、熱量、第幾天、清單、每日紀錄、進度（同時編進 App 與測試）
  - `SkinAndBonesTests/` — Swift Testing；`Fixtures/plan-fixture.json` 是計畫頁算出的逐日期望值
  - `scripts/generate-plan-fixture.mjs` — 用 node 跑計畫頁的 JS 重產 fixture
- `app/`、`src/`、`tests/`、`workers/` — 舊版網頁（不再開發）

## 開發原則

- 每個功能寫測試，不跳過
- 不要動 `workers/` 的部署：Cloudflare Worker 與 D1 還在執行，要不要關由威爾決定
- Git commit message 用繁體中文，專有名詞可用英文
- 詳細的全域開發偏好見 ~/.claude/CLAUDE.md

## 跑測試（Mac App）

```bash
xcodebuild test -project mac/SkinAndBones.xcodeproj -scheme SkinAndBones -destination 'platform=macOS' -only-testing:SkinAndBonesTests > /tmp/skinbones-test.log 2>&1; tail -20 /tmp/skinbones-test.log
```

- 測試 bundle 不掛在 App 上：跑測試不會啟動 App，桌面不會跳出視窗。
- 不要加 `-quiet`：它會把 log 裡的斷言一起壓掉，紅了只剩測試名清單（starter 2026-08-02 判例）。
- 改專案設定改 `mac/project.yml`，再在 `mac/` 底下跑 `xcodegen generate`。不要在 Xcode 裡直接改 target 設定，下次 generate 會蓋掉。
- 計畫頁改版：跑 `node mac/scripts/generate-plan-fixture.mjs` 重產 fixture，再跑測試，看 App 哪裡要跟著改。

## ★ TDD（starter 必補段）

- 新功能、修 bug 一律先寫會失敗的測試（紅）→ 實作到通過（綠）→ 跑完整測試確認全綠 → commit。
- 純文案、純樣式微調、純文件可以例外；拿不準先問。
- 測試用的暫時實作回傳「安全但錯誤」的值（空陣列、0），不要用 `fatalError`：Swift Testing 同一個行程跑全部測試，一個 crash 會把無關的測試一起打紅。
- 測試函式名用英文，中文說明寫在 `@Test("…")` 的顯示名稱：SwiftLint 的 identifier_name 不接受中文開頭的函式名，會擋 commit。

## ★ Hooks 防線（starter 必補段，不開 CI）

| 層 | 跑什麼 | 角色 |
|----|--------|------|
| `.githooks/pre-commit`（3 秒內） | SwiftLint（暫存的 .swift） | 擋風格與低級錯誤 |
| `.githooks/pre-push`（約 30 秒） | `xcodebuild test`（單元測試） | 擋邏輯 bug 推上 main |

- 啟用：`git config core.hooksPath .githooks`（新 clone 要重跑）。
- 兩支 hook 從 vault `200_Reference/sop/ios-app-starter/.githooks/` 原封不動複製。要改先改樣板，再同步過來。
- 先不放 AppIcon PNG：pre-push 的 AppIcon alpha 檢查不分平台，macOS 圖示的透明邊角會擋 push。要加圖示，先在樣板把那段限定成 iOS。
- 緊急跳過用 `--no-verify`，但要馬上回頭修。

## ★ Commit message（starter 必補段）

- 沿用本 repo 既有寫法：英文前綴＋半形冒號＋空格＋繁中描述，例如 `feat: …`、`fix: …`、`test: …`、`refactor: …`、`docs: …`、`chore: …`。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
