/**
 * 审核结果提醒。
 *
 * 后端没有接入厂商推送通道（那需要额外的推送服务与设备 Token），
 * 这里用「轮询 + 本地通知」达到同等体验：
 *   定期拉取 /api/my-spots，把点位状态与本地快照比对，
 *   一旦发现「待审核」变成「已通过 / 未通过」，立刻发一条系统通知。
 *
 * 好处是不依赖 Push Kit 与 HMS Core，模拟器和真机表现一致；
 * 代价是 App 完全退到后台时不会实时提醒，回到前台后 1 分钟内补发。
 */
import { notificationManager } from '@kit.NotificationKit';
import { pushService } from '@kit.PushKit';
import { common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { KEY_REVIEW_SNAPSHOT, KEY_REVIEW_TRACKED, statusLabel } from '../constants/AppConstants';
import { Spot } from '../../model/SpotModels';
import { CommunityApi } from '../../service/CommunityApi';
import { PreferenceUtil } from './PreferenceUtil';
import { Session } from './Session';
import { describeError } from './HttpUtil';

const DOMAIN: number = 0x2F02;
const TAG: string = 'QyReview';

/** 通知 id 基准值，避免与将来其他类型的通知冲突 */
const NOTIFICATION_ID_BASE: number = 10000;

export class ReviewNotifier {
  /**
   * 是否已成功上报 Push Token。
   * 为 true 时由服务端推送负责提醒，本地轮询只更新快照、不再弹通知，避免重复打扰。
   */
  private static pushEnabled: boolean = false;

  /**
   * 检查并请求通知授权。
   * 1600004（通知未开启）是最常见的失败原因：首次启动弹系统授权对话框，
   * 用户已做出选择后系统会静默返回/拒绝，不会重复打扰。
   */
  static async ensurePermission(context: common.UIAbilityContext): Promise<void> {
    try {
      const enabled: boolean = await notificationManager.isNotificationEnabled();
      if (enabled) {
        return;
      }
      await notificationManager.requestEnableNotification(context);
      hilog.info(DOMAIN, TAG, 'notification enabled by user');
    } catch (err) {
      hilog.warn(DOMAIN, TAG, 'notification permission not granted: %{public}s', JSON.stringify(err));
    }
  }

  /**
   * 获取并上报鸿蒙 Push Token（Push Kit）。
   *
   * 模拟器或未开通推送服务时 getToken 会失败，此时静默降级——
   * 继续用「轮询 + 本地通知」，保证功能不会整体失效。
   */
  static async registerPushToken(): Promise<void> {
    if (!Session.isLoggedIn()) {
      return;
    }
    try {
      const token: string = await pushService.getToken();
      if (token.length === 0) {
        return;
      }
      await CommunityApi.savePushToken(token, 'harmony');
      ReviewNotifier.pushEnabled = true;
      hilog.info(DOMAIN, TAG, 'push token registered');
    } catch (err) {
      hilog.warn(DOMAIN, TAG, 'push token unavailable, fallback to local notification');
    }
  }
  /**
   * 检查一次审核状态：未登录或网络异常时静默返回，不打扰用户。
   */
  static async check(): Promise<void> {
    if (!Session.isLoggedIn()) {
      return;
    }
    let spots: Spot[] = [];
    try {
      spots = await CommunityApi.mySpots();
    } catch (err) {
      hilog.warn(DOMAIN, TAG, 'failed to load my spots: %{public}s', describeError(err));
      return;
    }

    const previous: Record<string, string> = ReviewNotifier.readSnapshot();
    const isFirstRun: boolean = Object.keys(previous).length === 0;
    const current: Record<string, string> = {};
    const changed: Spot[] = [];
    const tracked: number[] = ReviewNotifier.readTracked();

    for (let i = 0; i < spots.length; i++) {
      const spot: Spot = spots[i];
      const key: string = String(spot.id);
      const status: string = spot.status;
      current[key] = status;
      const before: string | undefined = previous[key];
      if (before === undefined) {
        // 新出现的点位：若是本 App 提交且已是终态（高德核验秒过），补一条通知；
        // 否则只记基线，等它有审核结果时再提醒
        const idx: number = tracked.indexOf(spot.id);
        if (idx >= 0 && (status === 'approved' || status === 'rejected')) {
          tracked.splice(idx, 1);
          changed.push(spot);
        }
        continue;
      }
      if (before !== status && (status === 'approved' || status === 'rejected')) {
        changed.push(spot);
      }
    }

    PreferenceUtil.putString(KEY_REVIEW_SNAPSHOT, JSON.stringify(current));
    PreferenceUtil.putString(KEY_REVIEW_TRACKED, JSON.stringify(tracked));

    // 首次建立基线时静默，避免把历史点位全部通知一遍
    if (isFirstRun) {
      return;
    }
    for (let i = 0; i < changed.length; i++) {
      await ReviewNotifier.publish(changed[i]);
    }
  }

  /** 清空快照：退出登录时调用，换账号后不应继承上一个人的审核状态 */
  static reset(): void {
    PreferenceUtil.putString(KEY_REVIEW_SNAPSHOT, '');
    PreferenceUtil.putString(KEY_REVIEW_TRACKED, '');
  }

  /** 提交成功后登记点位 id：即使被自动核验秒过审核，也能收到一条结果通知 */
  static trackSubmission(spotId: number): void {
    if (spotId <= 0) {
      return;
    }
    const tracked: number[] = ReviewNotifier.readTracked();
    if (!tracked.includes(spotId)) {
      tracked.push(spotId);
      PreferenceUtil.putString(KEY_REVIEW_TRACKED, JSON.stringify(tracked));
    }
  }

  private static readTracked(): number[] {
    const raw: string = PreferenceUtil.getString(KEY_REVIEW_TRACKED, '');
    if (raw.length === 0) {
      return [];
    }
    try {
      const parsed: number[] = JSON.parse(raw) as number[];
      return parsed ?? [];
    } catch {
      return [];
    }
  }

  private static readSnapshot(): Record<string, string> {
    const raw: string = PreferenceUtil.getString(KEY_REVIEW_SNAPSHOT, '');
    if (raw.length === 0) {
      return {};
    }
    try {
      const parsed: Record<string, string> = JSON.parse(raw) as Record<string, string>;
      return parsed ?? {};
    } catch {
      return {};
    }
  }

  private static async publish(spot: Spot): Promise<void> {
    // 已接入服务端推送时不再重复弹本地通知
    if (ReviewNotifier.pushEnabled) {
      return;
    }
    const approved: boolean = spot.status === 'approved';
    const title: string = approved ? '点位已通过审核' : '点位未通过审核';
    const text: string = approved
      ? `「${spot.name}」已上线，现在所有人都能在地图上看到它`
      : `「${spot.name}」审核结果为${statusLabel(spot.status)}，可以调整后重新提交`;
    const request: notificationManager.NotificationRequest = {
      id: NOTIFICATION_ID_BASE + spot.id,
      content: {
        notificationContentType: notificationManager.ContentType.NOTIFICATION_CONTENT_BASIC_TEXT,
        normal: {
          title: title,
          text: text,
          additionalText: '清远社区共享地图'
        }
      }
    };
    try {
      await notificationManager.publish(request);
      hilog.info(DOMAIN, TAG, 'notification published for spot %{public}d', spot.id);
    } catch (err) {
      hilog.warn(DOMAIN, TAG, 'publish failed: %{public}s', JSON.stringify(err));
    }
  }
}
