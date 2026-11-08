-- 收紧已导入的设施点位：
-- 1) 车站去掉银盏站、龙塘镇站
-- 2) 医院只保留清城区的三甲：清远市人民医院、广州中医药大学附属清远中医院
-- 限定 owner_token = 'system-import'，不会影响用户自己提交的点位
-- 执行：npx wrangler d1 execute qingyuan-community-map --remote --file=cleanup-facilities.sql

DELETE FROM spots
WHERE owner_token = 'system-import'
  AND category = 'transit'
  AND name IN ('银盏站(城际站)', '龙塘镇站(城际站)', '清远长隆(地铁站)');

DELETE FROM spots
WHERE owner_token = 'system-import'
  AND category = 'medical'
  AND name NOT IN ('清远市人民医院', '广州中医药大学附属清远中医院');
