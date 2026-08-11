/**
 * 跨瀏覽器同步的設定入口。
 *
 * SYNC_API_BASE 是同步 Worker 的網址（例如 https://skin-and-bones-sync.xxx.workers.dev）。
 * 空字串＝同步服務還沒部署，整個同步功能會在畫面上收起來，App 照樣是純本機工具。
 *
 * 部署後怎麼填：
 * 1. 本機開發：在專案根目錄建一個 `.env.local`（已在 .gitignore 裡），寫
 *      NEXT_PUBLIC_SYNC_URL=https://你的-worker-網址.workers.dev
 *    然後重開 `npm run dev`。
 * 2. GitHub Pages：這個值是 build 時被寫死進 JS 的，所以要設在 build 的環境——
 *    在 .github/workflows 的 build 步驟加上
 *      env:
 *        NEXT_PUBLIC_SYNC_URL: ${{ vars.NEXT_PUBLIC_SYNC_URL }}
 *    再到 GitHub repo 的 Settings → Secrets and variables → Actions → Variables
 *    新增 NEXT_PUBLIC_SYNC_URL。改完要重跑一次 build 才會生效。
 *
 * 注意：這裡一定要直接寫 `process.env.NEXT_PUBLIC_SYNC_URL`，
 * 不能先把名字存進變數再取，否則 Next.js 不會把值 inline 進瀏覽器的 bundle。
 */
export const SYNC_API_BASE = process.env.NEXT_PUBLIC_SYNC_URL ?? "";

/** 同步服務有沒有設定好。沒設定就當作這個功能不存在。 */
export function isSyncConfigured(baseUrl: string = SYNC_API_BASE): boolean {
  return baseUrl.trim() !== "";
}
