/**
 * Preferences 轻量持久化封装。
 *
 * 存放：登录 token、提交者身份串、点赞身份串、增量同步时间、搜索历史。
 * 这些数据量小、读写频繁，用 Preferences 比关系型数据库更合适。
 */
import { preferences } from '@kit.ArkData';
import { common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { PREF_STORE_NAME } from '../constants/AppConstants';

const DOMAIN: number = 0x0000;
const TAG: string = 'QyMapPref';

export class PreferenceUtil {
  private static store: preferences.Preferences | null = null;

  /** 在 EntryAbility 中初始化一次即可全局使用 */
  static init(context: common.Context): void {
    try {
      const options: preferences.Options = { name: PREF_STORE_NAME };
      PreferenceUtil.store = preferences.getPreferencesSync(context, options);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'init preferences failed: %{public}s', JSON.stringify(err));
      PreferenceUtil.store = null;
    }
  }

  static getString(key: string, defValue: string): string {
    if (PreferenceUtil.store === null) {
      return defValue;
    }
    try {
      const value: preferences.ValueType = PreferenceUtil.store.getSync(key, defValue);
      return typeof value === 'string' ? value : defValue;
    } catch (err) {
      return defValue;
    }
  }

  static putString(key: string, value: string): void {
    if (PreferenceUtil.store === null) {
      return;
    }
    try {
      PreferenceUtil.store.putSync(key, value);
      PreferenceUtil.store.flushSync();
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'putString failed: %{public}s', JSON.stringify(err));
    }
  }

  static getNumber(key: string, defValue: number): number {
    if (PreferenceUtil.store === null) {
      return defValue;
    }
    try {
      const value: preferences.ValueType = PreferenceUtil.store.getSync(key, defValue);
      return typeof value === 'number' ? value : defValue;
    } catch (err) {
      return defValue;
    }
  }

  static putNumber(key: string, value: number): void {
    if (PreferenceUtil.store === null) {
      return;
    }
    try {
      PreferenceUtil.store.putSync(key, value);
      PreferenceUtil.store.flushSync();
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'putNumber failed: %{public}s', JSON.stringify(err));
    }
  }

  static remove(key: string): void {
    if (PreferenceUtil.store === null) {
      return;
    }
    try {
      PreferenceUtil.store.deleteSync(key);
      PreferenceUtil.store.flushSync();
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'remove failed: %{public}s', JSON.stringify(err));
    }
  }
}
