-- 「百日剩皮包骨」同步服務的 D1 schema（單人版）。
-- 只擴張不收縮：之後要加欄位一律用 ALTER TABLE ... ADD COLUMN，不要 DROP、不要改既有列。
-- 套用方式見 README.md，本機與正式站各跑一次。

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,          -- PBKDF2-SHA256 衍生金鑰，base64
  salt          TEXT NOT NULL,          -- 每個帳號各自的隨機 salt，base64
  created_at    TEXT NOT NULL           -- ISO 8601
);

-- 個人設定：一個帳號一列，payload 是 Profile 的 JSON 字串。
CREATE TABLE IF NOT EXISTS profiles (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id),
  payload    TEXT NOT NULL,
  updated_at TEXT NOT NULL              -- ISO 8601，last-write-wins 就靠這個比
);

-- 每日紀錄：一天一列，payload 是 DailyRecord 的 JSON 字串。
CREATE TABLE IF NOT EXISTS day_records (
  user_id    INTEGER NOT NULL REFERENCES users(id),
  date_key   TEXT NOT NULL,             -- YYYY-MM-DD
  payload    TEXT NOT NULL,
  updated_at TEXT NOT NULL,             -- ISO 8601
  PRIMARY KEY (user_id, date_key)
);

-- GET /sync 會按 user_id 撈整份資料，這個索引讓它不必掃全表。
CREATE INDEX IF NOT EXISTS idx_day_records_user ON day_records(user_id);
