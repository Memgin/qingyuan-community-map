/**
 * 业务仓储层：串起「网络 → 本地缓存 → 内置兜底数据」三级数据来源，
 * 页面只调用这一层，不直接关心数据从哪来。
 */
import { common } from '@kit.AbilityKit';
import { util } from '@kit.ArkTS';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { ApiError, describeError } from '../common/utils/HttpUtil';
import { Session } from '../common/utils/Session';
import { syncStamp, newClientToken } from '../common/utils/CommonUtil';
import { Spot, SpotListResult, SubmitSpotPayload } from '../model/SpotModels';
import { CommunityApi } from './CommunityApi';
import { LocalStore } from './LocalStore';
import { STORAGE_OFFLINE, STORAGE_PENDING_SYNC } from '../common/utils/Session';

const DOMAIN: number = 0x0000;
const TAG: string = 'QyMapRepo';

/** 一次数据加载的结果，附带数据来源，页面据此显示「离线模式」提示 */
export class SpotLoad {
  spots: Spot[] = [];
  /** true 表示来自本地缓存或内置兜底数据 */
  offline: boolean = false;
  error: string = '';
}

/** 提交结果（可能是「已提交」也可能是「已入离线队列」） */
export class SubmitOutcome {
  queued: boolean = false;
  status: string = 'pending';
  verified: boolean = false;
  message: string = '';
  duplicated: boolean = false;
}

export class SpotRepository {

  /**
   * 地图图钉数据：先请求网络，成功则刷新缓存；
   * 失败则回退到数据库缓存，再失败回退到随包内置快照。
   */
  static async loadMapSpots(context: common.Context): Promise<SpotLoad> {
    const load = new SpotLoad();
    try {
      const spots: Spot[] = await CommunityApi.mapSpots();
      load.spots = spots;
      await LocalStore.cacheSpots(spots);
      Session.setLastSync(syncStamp());
      SpotRepository.publishOffline(false);
      return load;
    } catch (err) {
      load.error = describeError(err);
      hilog.warn(DOMAIN, TAG, 'map spots network failed: %{public}s', load.error);
    }
    const cached: Spot[] = await LocalStore.loadCachedSpots();
    if (cached.length > 0) {
      load.spots = cached;
      load.offline = true;
      SpotRepository.publishOffline(true);
      return load;
    }
    const seed: Spot[] = LocalStore.loadSeed(context);
    load.spots = seed;
    load.offline = seed.length > 0;
    SpotRepository.publishOffline(load.offline);
    return load;
  }

  /** 列表页数据：后端真分页，不做本地缓存（保证翻页与搜索的准确性） */
  static async loadList(page: number, category: string, keyword: string): Promise<SpotListResult> {
    const result: SpotListResult = await CommunityApi.listSpots(page, category, keyword);
    SpotRepository.publishOffline(false);
    return result;
  }

  /** 我的提交 */
  static async loadMySpots(): Promise<Spot[]> {
    return await CommunityApi.mySpots();
  }

  /** 增量同步：返回自指定时间点之后新增 / 变更的点位数量 */
  static async countUpdatesSince(since: string): Promise<number> {
    if (since.length === 0) {
      return 0;
    }
    try {
      const result: SpotListResult = await CommunityApi.syncSpots(since);
      return result.total;
    } catch (err) {
      hilog.warn(DOMAIN, TAG, 'countUpdates failed: %{public}s', describeError(err));
      return 0;
    }
  }

  /**
   * 提交点位：网络可用时直接提交；网络异常时写入离线队列，
   * 由 flushOutbox 在网络恢复或下次启动时重发。
   */
  static async submit(payload: SubmitSpotPayload): Promise<SubmitOutcome> {
    const outcome = new SubmitOutcome();
    try {
      const result = await CommunityApi.submitSpot(payload);
      outcome.status = result.status;
      outcome.verified = result.verified;
      outcome.message = result.message;
      outcome.duplicated = result.duplicated;
      return outcome;
    } catch (err) {
      const apiError: ApiError | null = err instanceof ApiError ? err as ApiError : null;
      // 业务性错误（参数不合法、重复、未登录）直接抛给页面，不入队
      if (apiError !== null && apiError.status >= 400 && apiError.status < 500 && apiError.status !== 408) {
        throw err as Error;
      }
      // 网络类错误：入队等网络恢复后重发
      await LocalStore.enqueue(JSON.stringify(payload), payload.client_token, syncStamp());
      await SpotRepository.refreshPendingCount();
      outcome.queued = true;
      outcome.message = '当前网络不可用，已存入离线队列，联网后会自动重发';
      hilog.warn(DOMAIN, TAG, 'submit queued offline: %{public}s', describeError(err));
      return outcome;
    }
  }

  /** 重发离线队列，返回本次成功同步的条数 */
  static async flushOutbox(): Promise<number> {
    const payloads: string[] = await LocalStore.loadOutbox();
    if (payloads.length === 0) {
      return 0;
    }
    let synced: number = 0;
    for (let i = 0; i < payloads.length; i++) {
      const payload: SubmitSpotPayload = JSON.parse(payloads[i]) as SubmitSpotPayload;
      try {
        await CommunityApi.submitSpot(payload);
        await LocalStore.removeFromOutbox(payload.client_token);
        synced++;
      } catch (err) {
        const apiError: ApiError | null = err instanceof ApiError ? err as ApiError : null;
        // 409：后端判定该地点已收录，属于「这条提交不用再发了」
        if (apiError !== null && apiError.status === 409) {
          await LocalStore.removeFromOutbox(payload.client_token);
          synced++;
          continue;
        }
        // 401：尚未登录，保留在队列里等用户登录后再发
        if (apiError !== null && apiError.status === 401) {
          hilog.warn(DOMAIN, TAG, 'outbox paused: not logged in');
          break;
        }
        hilog.warn(DOMAIN, TAG, 'outbox resend failed: %{public}s', describeError(err));
        break;
      }
    }
    await SpotRepository.refreshPendingCount();
    return synced;
  }

  /** 生成新的离线提交幂等键 */
  static newClientToken(): string {
    return newClientToken(util.generateRandomUUID(true));
  }

  /** 把离线状态与待同步条数写入 AppStorage，供页面用 @StorageLink 订阅 */
  static async refreshPendingCount(): Promise<void> {
    const count: number = await LocalStore.outboxCount();
    AppStorage.setOrCreate(STORAGE_PENDING_SYNC, count);
  }

  static publishOffline(offline: boolean): void {
    AppStorage.setOrCreate(STORAGE_OFFLINE, offline);
  }
}
