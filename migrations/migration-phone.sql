-- 手机号绑定迁移（2026-11）
-- 用途：注册时绑定手机号；忘记密码时通过「用户名 + 手机号」核验身份后重设密码。
-- 注意：SQLite 的 ALTER TABLE ADD COLUMN 不支持 IF NOT EXISTS，本迁移只需执行一次；
-- 重复执行会报 "duplicate column name: phone"，可忽略。

ALTER TABLE users ADD COLUMN phone TEXT;

-- 手机号唯一：一个手机号只能绑定一个账号（空值不参与唯一约束）
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users(phone) WHERE phone IS NOT NULL;
