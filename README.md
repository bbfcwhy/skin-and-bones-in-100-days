# skin-and-bones-in-100-days

Mac 桌面上一直浮著的半透明小視窗：提醒自己照 100 天減脂計畫走，一鍵打勾，看得到進度。

## 開發環境

- 平台：macOS（SwiftUI）
- Repo：https://github.com/bbfcwhy/skin-and-bones-in-100-days
- 舊版：2026-08 的手機記錄網頁（Next.js：`app/`、`src/`、`tests/`、`workers/`）保留在 repo 裡，不再開發

## 安裝與更新

```bash
mac/scripts/install.sh
```

建 Release 版、裝到 `/Applications/SkinAndBones.app` 並啟動；第一次啟動會自動加進開機啟動（系統設定 → 一般 → 登入項目）。選單列的清單圖示可以顯示／隱藏視窗、切換開機自動啟動、結束。

## 文件

- `docs/2026-10-01_Mac浮動小視窗規格.md` — 現行規格
- `docs/BRAIN-DECISIONS.md` — 第二大腦的決策鏡像（勿手改）
- `docs/` — 規格、設計、PRD（vault 端 symlink：`500_Projects/skin-and-bones-in-100-days/docs/`）
- `CLAUDE.md` — Claude Code 開發指南
