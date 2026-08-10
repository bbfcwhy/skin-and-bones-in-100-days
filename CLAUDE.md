# CLAUDE.md

## 專案概述

把 100 天減脂計畫、每日清單、臨時飲食與額外運動影響整合成可離線使用的手機網頁

## 技術棧

Next.js + TypeScript

## 資料夾結構

- `docs/` — 規格、設計、PRD（被 2nd Brain symlink）
- `src/` — source code
- `tests/` — 測試

## 開發原則

- 每個功能寫測試，不跳過
- Git commit message 用繁體中文，專有名詞可用英文
- 詳細的全域開發偏好見 ~/.claude/CLAUDE.md

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
