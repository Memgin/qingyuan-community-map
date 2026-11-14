/**
 * 通用格式化与提示工具。
 */
import { promptAction } from '@kit.ArkUI';
import { UIContext } from '@kit.ArkUI';

/** 轻提示。使用 UIContext 版本，避免使用已废弃的全局 promptAction */
export function toast(uiContext: UIContext, message: string): void {
  const options: promptAction.ShowToastOptions = {
    message: message,
    duration: 2000
  };
  uiContext.getPromptAction().showToast(options);
}

/** 两点间球面距离（米），与后端 distanceInMeters 使用同一公式 */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radians: number = Math.PI / 180;
  const x: number = (lng2 - lng1) * radians * Math.cos(((lat1 + lat2) / 2) * radians);
  const y: number = (lat2 - lat1) * radians;
  return Math.sqrt(x * x + y * y) * 6371000;
}

/** 距离文案：米 / 公里 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const km: number = meters / 1000;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

/** 生成后端增量同步需要的时间戳：YYYY-MM-DD HH:mm:ss（UTC，与后端 CURRENT_TIMESTAMP 对齐） */
export function syncStamp(): string {
  const now: Date = new Date();
  const iso: string = now.toISOString();
  return iso.substring(0, 19).replace('T', ' ');
}

/** 把后端的 'YYYY-MM-DD HH:mm:ss'（UTC）转成相对时间文案 */
export function relativeTime(createdAt: string): string {
  if (createdAt.length < 19) {
    return createdAt;
  }
  const text: string = createdAt.replace(' ', 'T');
  const time: number = Date.parse(`${text}Z`);
  if (Number.isNaN(time)) {
    return createdAt;
  }
  const diffSeconds: number = Math.floor((Date.now() - time) / 1000);
  if (diffSeconds < 60) {
    return '刚刚';
  }
  if (diffSeconds < 3600) {
    return `${Math.floor(diffSeconds / 60)} 分钟前`;
  }
  if (diffSeconds < 86400) {
    return `${Math.floor(diffSeconds / 3600)} 小时前`;
  }
  if (diffSeconds < 86400 * 30) {
    return `${Math.floor(diffSeconds / 86400)} 天前`;
  }
  return createdAt.substring(0, 10);
}

/** 昵称首字母（用于头像占位） */
export function initialOf(name: string): string {
  if (name.length === 0) {
    return '游';
  }
  return name.substring(0, 1).toUpperCase();
}

/** 生成离线提交的幂等键 */
export function newClientToken(uuid: string): string {
  return `app-${uuid}`;
}
