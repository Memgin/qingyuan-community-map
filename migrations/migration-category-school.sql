-- 重建 spots 表：category 增加 'school' 选项（SQLite CHECK 约束无法 ALTER，需重建表）
PRAGMA foreign_keys=OFF;
CREATE TABLE spots_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('scenic', 'food', 'shopping', 'medical', 'transit', 'school')),
  description TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  likes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  owner_token TEXT,
  address TEXT,
  user_id INTEGER REFERENCES users(id)
);
INSERT INTO spots_new (id, name, address, category, description, lat, lng, image_url, status, likes, owner_token, user_id, created_at, reviewed_at)
  SELECT id, name, address, category, description, lat, lng, image_url, status, likes, owner_token, user_id, created_at, reviewed_at FROM spots;
DROP TABLE spots;
ALTER TABLE spots_new RENAME TO spots;
CREATE INDEX IF NOT EXISTS idx_spots_status ON spots(status);
CREATE INDEX IF NOT EXISTS idx_spots_category ON spots(category);
CREATE INDEX IF NOT EXISTS idx_spots_created_at ON spots(created_at);
CREATE INDEX IF NOT EXISTS idx_spots_owner_token ON spots(owner_token);
PRAGMA foreign_keys=ON;
