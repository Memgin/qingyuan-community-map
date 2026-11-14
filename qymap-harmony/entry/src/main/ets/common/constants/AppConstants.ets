/**
 * 全局常量定义。
 *
 * 本应用复用「清远社区共享地图」已上线的 Cloudflare Pages 后端
 * （https://qymap.pages.dev），因此这里集中维护接口地址、地图参数
 * 以及本地存储使用的键名，避免散落在各个页面里。
 */

/** 后端 API 根地址（与网页端共用同一套接口与数据库） */
export const API_BASE: string = 'https://qymap.pages.dev/api';

/** 地图默认中心：清远市区（与网页端 index.html 保持一致） */
export const MAP_CENTER_LAT: number = 23.6818;
export const MAP_CENTER_LNG: number = 113.056;
export const MAP_DEFAULT_ZOOM: number = 12;

/** 后端 validateSpot 限定的清远坐标范围，超出会被判定为无效点位 */
export const SPOT_LAT_MIN: number = 23.4;
export const SPOT_LAT_MAX: number = 24.8;
export const SPOT_LNG_MIN: number = 112.4;
export const SPOT_LNG_MAX: number = 113.8;

/** 列表分页：后端 full 字段单页上限 50，默认 20 */
export const PAGE_SIZE: number = 8;
/** 地图图钉一次拉取的最大条数（后端 fields=map 上限 500） */
export const MAP_SPOT_LIMIT: number = 500;

/** Preferences 存储文件名（轻量 KV：登录态、身份串、同步时间） */
export const PREF_STORE_NAME: string = 'qingyuan_prefs';
export const KEY_AUTH_TOKEN: string = 'auth_token';
export const KEY_OWNER_TOKEN: string = 'owner_token';
export const KEY_ACTOR_TOKEN: string = 'actor_token';
export const KEY_LAST_SYNC: string = 'last_sync';
export const KEY_USER_ID: string = 'user_id';
export const KEY_USERNAME: string = 'username';
export const KEY_SEARCH_HISTORY: string = 'search_history';
export const KEY_MAP_CLIENT_ID: string = 'map_client_id';
/** 审核状态快照：记录「我的提交」里每个点位上次已知的状态，用于发现审核结果变化 */
export const KEY_REVIEW_SNAPSHOT: string = 'review_snapshot';
/** 本 App 提交的点位 id 列表：覆盖「高德核验秒过审核」的场景，保证也能收到结果通知 */
export const KEY_REVIEW_TRACKED: string = 'review_tracked';

/** 关系型数据库：点位离线缓存 + 离线提交队列 */
export const RDB_NAME: string = 'qingyuan_cache.db';

/** 兜底数据：随包内置的点位快照，保证断网时地图与列表不空白 */
export const SEED_RAWFILE: string = 'spots_seed.json';

/** 加密学院/清远市区周边检索默认城市 */
export const AMAP_CITY: string = '清远';

/**
 * 分类定义。颜色与图标沿用了网页端 app.js 中的分类配色，
 * 使鸿蒙端与网页端视觉一致。
 */
export class CategoryInfo {
  key: string;
  label: string;
  color: string;
  icon: string;

  constructor(key: string, label: string, color: string, icon: string) {
    this.key = key;
    this.label = label;
    this.color = color;
    this.icon = icon;
  }
}

export const CATEGORIES: CategoryInfo[] = [
  new CategoryInfo('all', '全部', '#2F6D5A', '✦'),
  new CategoryInfo('scenic', '景点', '#5995A8', '山'),
  new CategoryInfo('food', '美食', '#EB765E', '食'),
  new CategoryInfo('shopping', '商圈', '#B4778E', '逛'),
  new CategoryInfo('medical', '医疗', '#68A678', '医'),
  new CategoryInfo('school', '学校', '#6F7FC0', '校'),
  new CategoryInfo('transit', '车站', '#D39A47', '行')
];

/** 取分类中文名，未知分类回退为「其他」 */
export function categoryLabel(key: string): string {
  for (let i = 0; i < CATEGORIES.length; i++) {
    if (CATEGORIES[i].key === key) {
      return CATEGORIES[i].label;
    }
  }
  return '其他';
}

/** 取分类主题色 */
export function categoryColor(key: string): string {
  for (let i = 0; i < CATEGORIES.length; i++) {
    if (CATEGORIES[i].key === key) {
      return CATEGORIES[i].color;
    }
  }
  return '#71807A';
}

/** 取分类图标字 */
export function categoryIcon(key: string): string {
  for (let i = 0; i < CATEGORIES.length; i++) {
    if (CATEGORIES[i].key === key) {
      return CATEGORIES[i].icon;
    }
  }
  return '·';
}

/**
 * 分类图钉图标（Map Kit marker 用）。
 * 颜色与 categoryColor 一一对应，使鸿蒙端地图图钉与网页端分类配色一致。
 */
export function categoryPin(key: string): Resource {
  if (key === 'food') {
    return $r('app.media.pin_food');
  }
  if (key === 'shopping') {
    return $r('app.media.pin_shopping');
  }
  if (key === 'medical') {
    return $r('app.media.pin_medical');
  }
  if (key === 'school') {
    return $r('app.media.pin_school');
  }
  if (key === 'transit') {
    return $r('app.media.pin_transit');
  }
  return $r('app.media.pin_scenic');
}

/** 审核状态中文名 */
export function statusLabel(status: string): string {
  if (status === 'approved') {
    return '已上线';
  }
  if (status === 'rejected') {
    return '未通过';
  }
  return '待审核';
}

/** 生成高德导航链接（与网页端 navigationURL 一致） */
export function navigationUrl(name: string, lat: number, lng: number): string {
  return `https://uri.amap.com/navigation?to=${lng},${lat},${encodeURIComponent(name)}` +
    `&mode=car&policy=1&src=qingyuan-map&coordinate=gaode&callnative=1`;
}
