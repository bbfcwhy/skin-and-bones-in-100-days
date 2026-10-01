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
- Mac App 的資料夾由實作第一張票建立，建好後回填這裡
- `app/`、`src/`、`tests/`、`workers/` — 舊版網頁（不再開發）

## 開發原則

- 每個功能寫測試，不跳過
- 不要動 `workers/` 的部署：Cloudflare Worker 與 D1 還在執行，要不要關由威爾決定
- Git commit message 用繁體中文，專有名詞可用英文
- 詳細的全域開發偏好見 ~/.claude/CLAUDE.md

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
