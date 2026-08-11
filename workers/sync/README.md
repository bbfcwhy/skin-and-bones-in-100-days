# 同步 Worker（單人版）

讓「百日剩皮包骨」的資料能跨瀏覽器同步：Cloudflare Workers + D1，自己的帳號密碼登入。

**單人版的意思**：第一個註冊的人就是主人，之後 `/auth/register` 一律回 403。沒有開放註冊、沒有寄信、沒有忘記密碼。密碼忘了就直接改資料庫（見文末）。

---

## 一次性部署步驟

以下每一步都在 `workers/sync/` 目錄裡執行。

### 1. 裝依賴並登入 Cloudflare

```bash
cd workers/sync
npm install
npx wrangler login
```

瀏覽器會跳出授權畫面，按同意即可。

### 2. 建立 D1 資料庫

```bash
npx wrangler d1 create skin-bones-sync
```

指令會印出一段設定，其中的 `database_id = "xxxxxxxx-xxxx-..."` 要**複製起來**。

### 3. 把 database_id 填進 wrangler.toml

打開 `wrangler.toml`，把這行的 `PASTE_DATABASE_ID_HERE` 換成上一步印出來的 uuid：

```toml
database_id = "PASTE_DATABASE_ID_HERE"
```

### 4. 建表（本機一次、雲端一次）

```bash
npx wrangler d1 execute skin-bones-sync --local  --file=./schema.sql   # 本機開發用
npx wrangler d1 execute skin-bones-sync --remote --file=./schema.sql   # 正式資料庫
```

`--remote` 那次會問「Do you want to proceed?」，按 y。

### 5. 設定 token 簽章用的 secret

先產生一組夠長的隨機字串：

```bash
openssl rand -base64 32
```

把它設進 Cloudflare（會問你貼上值，貼完按 Enter）：

```bash
npx wrangler secret put TOKEN_SECRET
```

本機開發另外建一個 `.dev.vars`（這個檔案不要進 git）：

```bash
echo 'TOKEN_SECRET=剛剛那組隨機字串' > .dev.vars
```

> 沒設定 `TOKEN_SECRET` 的話，所有登入與同步的路由一律回 500。程式裡刻意沒有預設值，避免用到寫死的假 secret。

### 6. 部署

```bash
npx wrangler deploy
```

成功後會印出網址，長得像 `https://skin-bones-sync.<你的帳號>.workers.dev`。**把這個網址記下來**，前端要用。

### 7. 註冊你自己的帳號（只能做這一次）

把下面的網址換成上一步的網址，email 與密碼換成你要用的（密碼 8 到 256 個字元）：

```bash
curl -X POST https://skin-bones-sync.<你的帳號>.workers.dev/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"你的email@example.com","password":"你的密碼至少八碼"}'
```

回傳 `{"token":"...","expiresAt":"..."}` 就成功了。再打一次同樣的指令會回 403「此服務不開放註冊」——這是對的，代表大門已經關上。

檢查狀態：

```bash
curl https://skin-bones-sync.<你的帳號>.workers.dev/health
# {"ok":true,"registered":true}
```

### 8.（選用加固）幫 /auth/login 加每 IP 限速

Worker 本身是無狀態的，要自己數「這個 IP 這分鐘打了幾次」得再開 KV 或 Durable Objects，對一個人自己用的站來說成本大於收益。**比較划算的做法是用 Cloudflare 內建的 Rate Limiting rule**，免費方案就有，不用改任何程式碼。

> 這步是選用的。不做也能正常運作——密碼是 PBKDF2 210,000 次迭代，暴力破解本來就慢；加了只是讓人連試都試不動。

1. 進 [Cloudflare Dashboard](https://dash.cloudflare.com)，左邊選 **Compute (Workers)** → **Workers & Pages** → 點進 `skin-bones-sync`。
2. 上方分頁選 **Settings** → 左邊選 **Security**（或在網域層級進 **Security** → **WAF** → **Rate limiting rules**）。
3. 按 **Create rule**，規則名稱填 `login-rate-limit`。
4. **符合條件**（If incoming requests match）：
   - Field 選 `URI Path`，Operator 選 `equals`，Value 填 `/auth/login`
5. **計數方式**（With the same characteristics）：選 `IP`。
6. **限速值**（When rate exceeds）：
   - Requests 填 `10`
   - Period 選 `1 minute`
   - 也就是「同一個 IP 每分鐘最多打 10 次登入」。自己用綽綽有餘，密碼打錯幾次也不會被卡。
7. **超過之後**（Then take action）：選 `Block`，Duration 選 `1 minute`。
8. 按 **Deploy**。

想更嚴一點可以改成 `5 次 / 1 分鐘`；如果哪天自己被擋了（例如反覆測試），把 Duration 調短或暫時把規則停用即可。

> 註冊路由不必加——`/auth/register` 在你註冊完之後一律回 403，本來就沒有可以打的空間。

### 9.（選用）綁自己的網域

如果 `*.workers.dev` 的網址夠用，這步可以跳過。要綁自己的網域：

1. 該網域必須已經加進同一個 Cloudflare 帳號（Cloudflare Dashboard → Add a site）。
2. 在 `wrangler.toml` 最後加上：

   ```toml
   [[routes]]
   pattern = "sync.你的網域.com"
   custom_domain = true
   ```

3. 重新部署：`npx wrangler deploy`。Cloudflare 會自動幫你建 DNS 紀錄與憑證，等一兩分鐘就會生效。

---

## 前端要改的地方

Worker 的 CORS 白名單寫死在 `src/index.ts` 最上面：

```ts
const ALLOWED_ORIGINS = new Set(["https://bbfcwhy.github.io", "http://localhost:3000"]);
```

正式站（GitHub Pages）與本機開發站都在裡面了。換網址的話改這裡再重新部署，白名單外的來源瀏覽器會擋下來。

---

## API

所有回應都是 JSON。錯誤一律是 `{ "error": "訊息" }`。

| 方法 | 路徑 | 需要 token | 說明 |
|---|---|---|---|
| POST | `/auth/register` | 否 | `{email, password}` → `{token, expiresAt}`。**只有在 users 表是空的時候才成功**，否則 403。 |
| POST | `/auth/login` | 否 | `{email, password}` → `{token, expiresAt}`。失敗一律回同一句話，不會告訴你是帳號還是密碼錯。 |
| GET | `/sync` | 是 | → `{profile, records}`，把伺服器上的整份資料拉回來。 |
| PUT | `/sync` | 是 | `{profile?, records}` → 每一筆的採用結果。 |
| GET | `/health` | 否 | → `{ok, registered}`，看服務活著沒、註冊過沒。 |

需要 token 的路由帶 `Authorization: Bearer <token>`。token 效期 30 天。

**PUT /sync 的衝突處理**：伺服器只在「進來的 `updatedAt` 比伺服器上的新」時才覆寫。被拒絕的那幾筆會回 `applied: false`、`reason: "stale"`，並且附上伺服器版本讓你直接拉回去合併：

```json
{
  "profile": { "applied": true },
  "records": [
    { "dateKey": "2026-08-10", "applied": true },
    { "dateKey": "2026-08-11", "applied": false, "reason": "stale",
      "server": { "payload": "{...}", "updatedAt": "2026-08-11T10:00:00.000Z" } }
  ]
}
```

前端的合併演算法在 `src/lib/sync.ts`（`mergeStates` / `buildPushPayload` / `remoteStateFromPull`）。

---

## 安全性

- 密碼用 PBKDF2-SHA256、210,000 次迭代、每個帳號一組隨機 salt，比對時用定時比較。
- token 是 HMAC-SHA256 簽名的 `payload.signature`，內容只有 userId 與到期時間，改一個位元就驗不過。
- 登入失敗的訊息永遠一樣，查無帳號時也照樣跑一次 PBKDF2，不讓人用回應時間問出某個 email 有沒有註冊。
- 密碼長度限制在 8 到 256 個字元，register 與 login 兩條路都先過這關才碰 PBKDF2，避免有人用超大字串灌 CPU。
- 登入沒有內建速率限制（無狀態環境要做得開 KV/DO），改用 Cloudflare 的 Rate Limiting rule 擋，做法見上面部署步驟第 8 步。
- 這些邏輯抽在 `src/lib.ts`，測試在專案根目錄的 `tests/sync-worker.test.ts`，跑 `npm test` 就會驗到。

---

## 日常維護

```bash
npx wrangler tail                                            # 看即時 log（500 的真正原因在這）
npx wrangler d1 execute skin-bones-sync --remote \
  --command "SELECT date_key, updated_at FROM day_records ORDER BY date_key"   # 看資料
```

**忘記密碼**：沒有寄信流程，所以只能直接改資料庫。最省事的做法是刪掉帳號後重新註冊（會連帶失去伺服器上的資料，但本機 localStorage 還在，重新登入後推上去就好）：

```bash
npx wrangler d1 execute skin-bones-sync --remote --command "DELETE FROM users"
```

> ⚠️ 動 `--remote` 的資料前先備份：`npx wrangler d1 export skin-bones-sync --remote --output=backup.sql`。

**加欄位**：schema 只擴張不收縮，一律用 `ALTER TABLE ... ADD COLUMN`，不要 DROP、不要改既有的列。每日紀錄的內容本身是 JSON 存在 `payload` 裡，所以 `DailyRecord` 加欄位不必動 schema。
