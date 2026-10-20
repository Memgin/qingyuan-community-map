/**
 * 会话管理：登录态与各类身份串。
 *
 * 三种身份串的用途（与网页端 app.js 的约定一致）：
 * - authToken  ：登录后后端返回的会话 token，放在 Authorization: Bearer <token>
 * - ownerToken ：提交点位的提交者身份，放在 X-Owner-Token（后端要求 20-100 字符）
 * - actorToken ：未登录时的点赞 / 举报身份，放在 X-Actor-Token
 *
 * 三者在首次启动时自动生成并写入 Preferences，之后长期复用，
 * 保证「我的提交」在重启应用后依然能找到。
 */
import { util } from '@kit.ArkTS';
import { PreferenceUtil } from './PreferenceUtil';
import {
  KEY_ACTOR_TOKEN,
  KEY_AUTH_TOKEN,
  KEY_LAST_SYNC,
  KEY_OWNER_TOKEN,
  KEY_USER_ID,
  KEY_USERNAME
} from '../constants/AppConstants';
import { SessionUser } from '../../model/SpotModels';

/** 供 @StorageLink 使用的全局状态键 */
export const STORAGE_LOGGED_IN: string = 'isLoggedIn';
export const STORAGE_USERNAME: string = 'loginUsername';
export const STORAGE_OFFLINE: string = 'offlineMode';
export const STORAGE_PENDING_SYNC: string = 'pendingSyncCount';

export class Session {
  private static authToken: string = '';
  private static ownerToken: string = '';
  private static actorToken: string = '';
  private static userId: number = 0;
  private static userName: string = '';

  /** 应用启动时调用一次：恢复持久化状态并补齐缺失的身份串 */
  static bootstrap(): void {
    Session.ownerToken = Session.ensureToken(KEY_OWNER_TOKEN);
    Session.actorToken = Session.ensureToken(KEY_ACTOR_TOKEN);
    Session.authToken = PreferenceUtil.getString(KEY_AUTH_TOKEN, '');
    Session.userId = PreferenceUtil.getNumber(KEY_USER_ID, 0);
    Session.userName = PreferenceUtil.getString(KEY_USERNAME, '');
    AppStorage.setOrCreate(STORAGE_LOGGED_IN, Session.authToken.length > 0);
    AppStorage.setOrCreate(STORAGE_USERNAME, Session.userName);
    AppStorage.setOrCreate(STORAGE_OFFLINE, false);
    AppStorage.setOrCreate(STORAGE_PENDING_SYNC, 0);
  }

  private static ensureToken(key: string): string {
    let token: string = PreferenceUtil.getString(key, '');
    if (token.length === 0) {
      token = util.generateRandomUUID(true);
      PreferenceUtil.putString(key, token);
    }
    return token;
  }

  /* ---------------------------- 登录态 ---------------------------- */

  static setLogin(token: string, user: SessionUser): void {
    Session.authToken = token;
    Session.userId = user.id;
    Session.userName = user.username;
    PreferenceUtil.putString(KEY_AUTH_TOKEN, token);
    PreferenceUtil.putNumber(KEY_USER_ID, user.id);
    PreferenceUtil.putString(KEY_USERNAME, user.username);
    AppStorage.setOrCreate(STORAGE_LOGGED_IN, token.length > 0);
    AppStorage.setOrCreate(STORAGE_USERNAME, user.username);
  }

  static clearLogin(): void {
    Session.authToken = '';
    Session.userId = 0;
    Session.userName = '';
    PreferenceUtil.remove(KEY_AUTH_TOKEN);
    PreferenceUtil.putNumber(KEY_USER_ID, 0);
    PreferenceUtil.remove(KEY_USERNAME);
    AppStorage.setOrCreate(STORAGE_LOGGED_IN, false);
    AppStorage.setOrCreate(STORAGE_USERNAME, '');
  }

  static isLoggedIn(): boolean {
    return Session.authToken.length > 0;
  }

  static getUserId(): number {
    return Session.userId;
  }

  static getUsername(): string {
    return Session.userName;
  }

  /* ---------------------------- 身份串 ---------------------------- */

  static getOwnerToken(): string {
    return Session.ownerToken;
  }

  static getActorToken(): string {
    return Session.actorToken;
  }

  /* ---------------------------- 请求头 ---------------------------- */

  /** 基础请求头 */
  static baseHeaders(): Record<string, string> {
    const header: Record<string, string> = {};
    header['Content-Type'] = 'application/json';
    return header;
  }

  /** 带登录态的请求头（未登录时不附加 Authorization） */
  static authHeaders(): Record<string, string> {
    const header: Record<string, string> = Session.baseHeaders();
    if (Session.authToken.length > 0) {
      header['Authorization'] = `Bearer ${Session.authToken}`;
    }
    return header;
  }

  /** 提交点位：登录态 + 提交者身份 */
  static submitHeaders(): Record<string, string> {
    const header: Record<string, string> = Session.authHeaders();
    header['X-Owner-Token'] = Session.ownerToken;
    return header;
  }

  /** 点赞 / 举报：登录态 + 匿名身份（两者后端都认，登录时优先按账号记） */
  static actorHeaders(): Record<string, string> {
    const header: Record<string, string> = Session.authHeaders();
    header['X-Actor-Token'] = Session.actorToken;
    return header;
  }

  /* -------------------------- 增量同步 -------------------------- */

  static getLastSync(): string {
    return PreferenceUtil.getString(KEY_LAST_SYNC, '');
  }

  static setLastSync(stamp: string): void {
    PreferenceUtil.putString(KEY_LAST_SYNC, stamp);
  }
}
