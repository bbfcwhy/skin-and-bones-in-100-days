#!/bin/zsh
# 建 Release 版、裝到 /Applications/SkinAndBones.app，再啟動。
# 第一次啟動會自動註冊開機啟動（系統設定 → 一般 → 登入項目）。
# 重裝時：先結束正在跑的那份；舊的 App 搬到 mac/build/replaced/ 留著，不刪。
# 勾選紀錄在 ~/Library/Application Support/com.lazzymerlin.SkinAndBones/，重裝不會動到。
set -euo pipefail

MAC_DIR=${0:A:h:h}
BUILD_DIR="$MAC_DIR/build/release"
LOG="$MAC_DIR/build/release.log"
TARGET=/Applications/SkinAndBones.app
mkdir -p "$MAC_DIR/build"

echo "→ 產生 Xcode 專案"
(cd "$MAC_DIR" && xcodegen generate --quiet)

echo "→ 建 Release 版（log：$LOG）"
if ! xcodebuild build -project "$MAC_DIR/SkinAndBones.xcodeproj" -scheme SkinAndBones \
    -configuration Release -destination 'platform=macOS' -derivedDataPath "$BUILD_DIR" > "$LOG" 2>&1; then
  grep -E "error:" "$LOG" | head -20
  echo "✗ 建置失敗，沒有安裝"
  exit 1
fi
BUILT="$BUILD_DIR/Build/Products/Release/SkinAndBones.app"
codesign --verify --deep --strict "$BUILT"

# 只結束裝在 /Applications 的那份，不碰開發中從 DerivedData 跑的版本
RUNNING="$TARGET/Contents/MacOS/SkinAndBones"
if pgrep -f "$RUNNING" > /dev/null; then
  echo "→ 結束正在跑的 SkinAndBones"
  pkill -f "$RUNNING"
  for _ in {1..50}; do
    pgrep -f "$RUNNING" > /dev/null || break
    sleep 0.2
  done
  if pgrep -f "$RUNNING" > /dev/null; then
    echo "✗ SkinAndBones 10 秒內沒有結束，沒有安裝。請從選單列圖示按「結束」後再跑一次"
    exit 1
  fi
fi

if [[ -e "$TARGET" ]]; then
  mkdir -p "$MAC_DIR/build/replaced"
  BACKUP="$MAC_DIR/build/replaced/SkinAndBones-$(date +%Y%m%d-%H%M%S).app"
  echo "→ 舊版搬到 $BACKUP"
  mv "$TARGET" "$BACKUP"
fi

echo "→ 安裝到 $TARGET"
ditto "$BUILT" "$TARGET"
codesign --verify --deep --strict "$TARGET"

echo "→ 啟動"
open "$TARGET"
echo "✓ 完成"
