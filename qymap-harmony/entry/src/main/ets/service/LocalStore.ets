/**
 * 本地持久化层（关系型数据库）。
 *
 * 承担两件事：
 * 1. 点位离线缓存 —— 断网时列表与地图展示上次成功拉取的数据，而不是白屏；
 * 2. 离线提交队列（outbox）—— 断网提交先入库，联网后自动重发，
 *    依靠后端 client_token 唯一索引保证重复发送只写入一次。
 *
 * 另外负责读取随包内置的兜底数据 resources/rawfile/spots_seed.json。
 */
import { relationalStore } from '@kit.ArkData';
import { common } from '@kit.AbilityKit';
import { util } from '@kit.ArkTS';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { RDB_NAME, SEED_RAWFILE } from '../common/constants/AppConstants';
import { Spot, SpotDto, normalizeSpot } from '../model/SpotModels';

const DOMAIN: number = 0x0000;
const TAG: string = 'QyMapStore';

const SQL_CREATE_SPOT: string = 'CREATE TABLE IF NOT EXISTS spot_cache (' +
  'id INTEGER PRIMARY KEY, name TEXT NOT NULL, address TEXT, category TEXT, description TEXT, ' +
  'lat REAL, lng REAL, image_url TEXT, likes INTEGER, created_at TEXT, status TEXT, liked INTEGER)';

const SQL_CREATE_OUTBOX: string = 'CREATE TABLE IF NOT EXISTS outbox (' +
  'client_token TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT)';

/** 随包兜底数据的文件结构 */
interface SeedFile {
  synced_at?: string;
  total?: number;
  data?: SpotDto[];
}

export class LocalStore {
  private static store: relationalStore.RdbStore | null = null;

  /** 在 EntryAbility 中初始化数据库并建表 */
  static async init(context: common.Context): Promise<void> {
    if (LocalStore.store !== null) {
      return;
    }
    try {
      const config: relationalStore.StoreConfig = {
        name: RDB_NAME,
        securityLevel: relationalStore.SecurityLevel.S1
      };
      const store: relationalStore.RdbStore = await relationalStore.getRdbStore(context, config);
      await store.executeSql(SQL_CREATE_SPOT);
      await store.executeSql(SQL_CREATE_OUTBOX);
      LocalStore.store = store;
      hilog.info(DOMAIN, TAG, 'rdb store ready');
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'init rdb failed: %{public}s', JSON.stringify(err));
      LocalStore.store = null;
    }
  }

  /* ------------------------ 点位离线缓存 ------------------------ */

  /** 用最新拉取到的点位整体覆盖缓存 */
  static async cacheSpots(spots: Spot[]): Promise<void> {
    const store: relationalStore.RdbStore | null = LocalStore.store;
    if (store === null) {
      return;
    }
    try {
      await store.executeSql('DELETE FROM spot_cache');
      for (let i = 0; i < spots.length; i++) {
        const spot: Spot = spots[i];
        const bucket: relationalStore.ValuesBucket = {
          'id': spot.id,
          'name': spot.name,
          'address': spot.address,
          'category': spot.category,
          'description': spot.description,
          'lat': spot.lat,
          'lng': spot.lng,
          'image_url': spot.imageUrl,
          'likes': spot.likes,
          'created_at': spot.createdAt,
          'status': spot.status,
          'liked': spot.liked ? 1 : 0
        };
        await store.insert('spot_cache', bucket);
      }
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'cacheSpots failed: %{public}s', JSON.stringify(err));
    }
  }

  /** 读取缓存点位，按创建时间倒序 */
  static async loadCachedSpots(): Promise<Spot[]> {
    const store: relationalStore.RdbStore | null = LocalStore.store;
    const result: Spot[] = [];
    if (store === null) {
      return result;
    }
    try {
      const set: relationalStore.ResultSet =
        await store.querySql('SELECT * FROM spot_cache ORDER BY created_at DESC');
      try {
        while (set.goToNextRow()) {
          const spot = new Spot();
          spot.id = set.getLong(set.getColumnIndex('id'));
          spot.name = set.getString(set.getColumnIndex('name'));
          spot.address = set.getString(set.getColumnIndex('address'));
          spot.category = set.getString(set.getColumnIndex('category'));
          spot.description = set.getString(set.getColumnIndex('description'));
          spot.lat = set.getDouble(set.getColumnIndex('lat'));
          spot.lng = set.getDouble(set.getColumnIndex('lng'));
          spot.imageUrl = set.getString(set.getColumnIndex('image_url'));
          spot.likes = set.getLong(set.getColumnIndex('likes'));
          spot.createdAt = set.getString(set.getColumnIndex('created_at'));
          spot.status = set.getString(set.getColumnIndex('status'));
          spot.liked = set.getLong(set.getColumnIndex('liked')) === 1;
          result.push(spot);
        }
      } finally {
        set.close();
      }
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'loadCachedSpots failed: %{public}s', JSON.stringify(err));
    }
    return result;
  }

  /* ---------------------- 离线提交队列 ---------------------- */

  /** 入队一条待重发的提交（按 client_token 去重） */
  static async enqueue(payloadJson: string, clientToken: string, createdAt: string): Promise<void> {
    const store: relationalStore.RdbStore | null = LocalStore.store;
    if (store === null) {
      return;
    }
    try {
      const bucket: relationalStore.ValuesBucket = {
        'client_token': clientToken,
        'payload': payloadJson,
        'created_at': createdAt
      };
      await store.insert('outbox', bucket, relationalStore.ConflictResolution.ON_CONFLICT_REPLACE);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'enqueue failed: %{public}s', JSON.stringify(err));
    }
  }

  /** 读取队列中全部待重发提交（最早入队的先发） */
  static async loadOutbox(): Promise<string[]> {
    const store: relationalStore.RdbStore | null = LocalStore.store;
    const result: string[] = [];
    if (store === null) {
      return result;
    }
    try {
      const set: relationalStore.ResultSet =
        await store.querySql('SELECT payload FROM outbox ORDER BY created_at ASC');
      try {
        while (set.goToNextRow()) {
          result.push(set.getString(set.getColumnIndex('payload')));
        }
      } finally {
        set.close();
      }
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'loadOutbox failed: %{public}s', JSON.stringify(err));
    }
    return result;
  }

  /** 出队：提交成功或后端判定重复时调用 */
  static async removeFromOutbox(clientToken: string): Promise<void> {
    const store: relationalStore.RdbStore | null = LocalStore.store;
    if (store === null) {
      return;
    }
    try {
      const predicates = new relationalStore.RdbPredicates('outbox');
      predicates.equalTo('client_token', clientToken);
      await store.delete(predicates);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'removeFromOutbox failed: %{public}s', JSON.stringify(err));
    }
  }

  /** 队列长度，用于首页显示「N 条待同步」 */
  static async outboxCount(): Promise<number> {
    const store: relationalStore.RdbStore | null = LocalStore.store;
    if (store === null) {
      return 0;
    }
    try {
      const set: relationalStore.ResultSet = await store.querySql('SELECT COUNT(*) AS total FROM outbox');
      try {
        if (set.goToNextRow()) {
          return set.getLong(set.getColumnIndex('total'));
        }
      } finally {
        set.close();
      }
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'outboxCount failed: %{public}s', JSON.stringify(err));
    }
    return 0;
  }

  /* ------------------------ 兜底数据 ------------------------ */

  /** 读取随包内置的点位快照，保证全程无网也能演示 */
  static loadSeed(context: common.Context): Spot[] {
    const result: Spot[] = [];
    try {
      const bytes: Uint8Array = context.resourceManager.getRawFileContentSync(SEED_RAWFILE);
      const decoder: util.TextDecoder = util.TextDecoder.create('utf-8');
      const text: string = decoder.decodeToString(bytes);
      const seed: SeedFile = JSON.parse(text) as SeedFile;
      const rows: SpotDto[] = seed.data ?? [];
      for (let i = 0; i < rows.length; i++) {
        result.push(normalizeSpot(rows[i]));
      }
      hilog.info(DOMAIN, TAG, 'seed loaded: %{public}d spots', result.length);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'loadSeed failed: %{public}s', JSON.stringify(err));
    }
    return result;
  }
}
