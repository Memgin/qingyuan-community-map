-- 将广东金融学院周边实时检索到的医院与铁路/城际站点正式收录入库
-- 同名同分类已存在则跳过，可重复执行不会造成重复数据
-- 执行：npx wrangler d1 execute qingyuan-community-map --remote --file=import-facilities.sql

INSERT INTO spots (name, address, category, description, lat, lng, image_url, status, likes, owner_token, created_at, reviewed_at)
SELECT '飞霞站(城际站)', '清远市清城区', 'transit', '清远城际/铁路出行站点', 23.741615, 113.085191, '', 'approved', 0, 'system-import', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM spots WHERE name = '飞霞站(城际站)' AND category = 'transit');

INSERT INTO spots (name, address, category, description, lat, lng, image_url, status, likes, owner_token, created_at, reviewed_at)
SELECT '燕湖站(城际站)', '清远市清城区', 'transit', '清远城际/铁路出行站点', 23.67032, 113.089664, '', 'approved', 0, 'system-import', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM spots WHERE name = '燕湖站(城际站)' AND category = 'transit');

INSERT INTO spots (name, address, category, description, lat, lng, image_url, status, likes, owner_token, created_at, reviewed_at)
SELECT '清远站', '站前路', 'transit', '清远城际/铁路出行站点 · 站前路', 23.694175, 113.133644, '', 'approved', 0, 'system-import', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM spots WHERE name = '清远站' AND category = 'transit');

INSERT INTO spots (name, address, category, description, lat, lng, image_url, status, likes, owner_token, created_at, reviewed_at)
SELECT '洲心站(城际站)', '清远市清城区', 'transit', '清远城际/铁路出行站点', 23.692858, 113.133371, '', 'approved', 0, 'system-import', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM spots WHERE name = '洲心站(城际站)' AND category = 'transit');

INSERT INTO spots (name, address, category, description, lat, lng, image_url, status, likes, owner_token, created_at, reviewed_at)
SELECT '清城站(城际站)', '清远大道与凤翔南路交叉口西北角', 'transit', '清远城际/铁路出行站点 · 清远大道与凤翔南路交叉口西北角', 23.653565, 113.066524, '', 'approved', 0, 'system-import', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM spots WHERE name = '清城站(城际站)' AND category = 'transit');

INSERT INTO spots (name, address, category, description, lat, lng, image_url, status, likes, owner_token, created_at, reviewed_at)
SELECT '龙塘镇站(城际站)', '环城东路与107国道交叉口东150米', 'transit', '清远城际/铁路出行站点 · 环城东路与107国道交叉口东150米', 23.606158, 113.084098, '', 'approved', 0, 'system-import', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM spots WHERE name = '龙塘镇站(城际站)' AND category = 'transit');

INSERT INTO spots (name, address, category, description, lat, lng, image_url, status, likes, owner_token, created_at, reviewed_at)
SELECT '源潭站', '源潭镇跃进路1号', 'transit', '清远城际/铁路出行站点 · 源潭镇跃进路1号', 23.662601, 113.202038, '', 'approved', 0, 'system-import', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM spots WHERE name = '源潭站' AND category = 'transit');

INSERT INTO spots (name, address, category, description, lat, lng, image_url, status, likes, owner_token, created_at, reviewed_at)
SELECT '银盏站(城际站)', '清远市清城区', 'transit', '清远城际/铁路出行站点', 23.549596, 113.130148, '', 'approved', 0, 'system-import', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM spots WHERE name = '银盏站(城际站)' AND category = 'transit');

INSERT INTO spots (name, address, category, description, lat, lng, image_url, status, likes, owner_token, created_at, reviewed_at)
SELECT '清远市人民医院', '银泉路B24号区', 'medical', '清远医疗机构 · 银泉路B24号区', 23.666902, 113.056659, '', 'approved', 0, 'system-import', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM spots WHERE name = '清远市人民医院' AND category = 'medical');

INSERT INTO spots (name, address, category, description, lat, lng, image_url, status, likes, owner_token, created_at, reviewed_at)
SELECT '清远市妇幼保健院', '曙光二路22号', 'medical', '清远医疗机构 · 曙光二路22号', 23.711266, 113.032016, '', 'approved', 0, 'system-import', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM spots WHERE name = '清远市妇幼保健院' AND category = 'medical');

INSERT INTO spots (name, address, category, description, lat, lng, image_url, status, likes, owner_token, created_at, reviewed_at)
SELECT '清远市第三人民医院', '洲心街道永安社区永安楼32号市三院医疗综合楼', 'medical', '清远医疗机构 · 洲心街道永安社区永安楼32号', 23.687464, 113.035861, '', 'approved', 0, 'system-import', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM spots WHERE name = '清远市第三人民医院' AND category = 'medical');

INSERT INTO spots (name, address, category, description, lat, lng, image_url, status, likes, owner_token, created_at, reviewed_at)
SELECT '广州中医药大学附属清远中医院', '桥北路10号', 'medical', '清远医疗机构 · 桥北路10号', 23.708531, 113.039691, '', 'approved', 0, 'system-import', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM spots WHERE name = '广州中医药大学附属清远中医院' AND category = 'medical');

INSERT INTO spots (name, address, category, description, lat, lng, image_url, status, likes, owner_token, created_at, reviewed_at)
SELECT '清远市清新区人民医院', '太和镇清和大道178号', 'medical', '清远医疗机构 · 太和镇清和大道178号', 23.735585, 113.002207, '', 'approved', 0, 'system-import', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM spots WHERE name = '清远市清新区人民医院' AND category = 'medical');

INSERT INTO spots (name, address, category, description, lat, lng, image_url, status, likes, owner_token, created_at, reviewed_at)
SELECT '清远市清新区中医院', '清远市清新区太和镇', 'medical', '清远医疗机构 · 清远市清新区太和镇', 23.730203, 112.978634, '', 'approved', 0, 'system-import', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM spots WHERE name = '清远市清新区中医院' AND category = 'medical');

INSERT INTO spots (name, address, category, description, lat, lng, image_url, status, likes, owner_token, created_at, reviewed_at)
SELECT '清城区中医院', '355国道与240国道交叉口西南100米', 'medical', '清远医疗机构 · 355国道与240国道交叉口西南100米', 23.649801, 113.180078, '', 'approved', 0, 'system-import', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM spots WHERE name = '清城区中医院' AND category = 'medical');
