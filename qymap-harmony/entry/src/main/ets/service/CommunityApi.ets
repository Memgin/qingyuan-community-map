/**
 * 后端接口封装。
 *
 * 与「清远社区共享地图」已上线后端一一对应，方法名后面的注释标注了
 * 对应的 REST 路径，便于和网页端 / 管理后台对照。
 */
import {
  API_BASE,
  MAP_SPOT_LIMIT,
  PAGE_SIZE
} from '../common/constants/AppConstants';
import { buildUrl, httpDelete, httpGet, httpPostBinary, httpPostJson, parseResponse } from '../common/utils/HttpUtil';
import { Session } from '../common/utils/Session';
import {
  AddMapSpotPayload,
  AuthDto,
  CreateMapPayload,
  CreateSpotDto,
  GeoPoint,
  LikeDto,
  LikeResult,
  LogoutDto,
  MeDto,
  PrivateMap,
  PrivateMapDto,
  PrivateMapListDto,
  RecommendDto,
  RecommendPayload,
  RecommendResult,
  ReportDto,
  ReportPayload,
  SessionUser,
  Spot,
  SpotDto,
  SpotListDto,
  SpotListResult,
  SubmitResult,
  SubmitSpotPayload,
  UploadDto,
  UserDto,
  normalizeSpot
} from '../model/SpotModels';

/** 把后端点位数组归一化 */
function normalizeList(rows: SpotDto[] | undefined): Spot[] {
  const result: Spot[] = [];
  if (rows === undefined) {
    return result;
  }
  for (let i = 0; i < rows.length; i++) {
    result.push(normalizeSpot(rows[i]));
  }
  return result;
}

/** 从用户 DTO 生成会话用户 */
function toSessionUser(dto: UserDto | undefined): SessionUser {
  if (dto === undefined) {
    return new SessionUser(0, '');
  }
  return new SessionUser(dto.id ?? 0, dto.username ?? '');
}

export class CommunityApi {

  /* --------------------------- 点位浏览 --------------------------- */

  /** GET /api/spots?page=&limit=&category=&q= —— 后端真分页 + 后端搜索 */
  static async listSpots(page: number, category: string, keyword: string): Promise<SpotListResult> {
    const query: Record<string, string> = {};
    query['page'] = String(page);
    query['limit'] = String(PAGE_SIZE);
    if (category.length > 0 && category !== 'all') {
      query['category'] = category;
    }
    if (keyword.length > 0) {
      query['q'] = keyword;
    }
    const response = await httpGet(buildUrl(`${API_BASE}/spots`, query), Session.authHeaders());
    const dto: SpotListDto = parseResponse<SpotListDto>(response);
    const result = new SpotListResult();
    result.data = normalizeList(dto.data);
    result.page = dto.page ?? page;
    result.limit = dto.limit ?? PAGE_SIZE;
    result.total = dto.total ?? result.data.length;
    return result;
  }

  /** GET /api/spots?fields=map&limit=500 —— 地图图钉用的轻量字段 */
  static async mapSpots(): Promise<Spot[]> {
    const query: Record<string, string> = {};
    query['fields'] = 'map';
    query['limit'] = String(MAP_SPOT_LIMIT);
    const response = await httpGet(buildUrl(`${API_BASE}/spots`, query), Session.authHeaders());
    const dto: SpotListDto = parseResponse<SpotListDto>(response);
    return normalizeList(dto.data);
  }

  /** GET /api/spots?since=<时间> —— 增量同步，只返回之后新增或变更的点位 */
  static async syncSpots(since: string): Promise<SpotListResult> {
    const query: Record<string, string> = {};
    query['since'] = since;
    query['page'] = '1';
    query['limit'] = String(PAGE_SIZE);
    const response = await httpGet(buildUrl(`${API_BASE}/spots`, query), Session.authHeaders());
    const dto: SpotListDto = parseResponse<SpotListDto>(response);
    const result = new SpotListResult();
    result.data = normalizeList(dto.data);
    result.page = dto.page ?? 1;
    result.limit = dto.limit ?? PAGE_SIZE;
    result.total = dto.total ?? result.data.length;
    return result;
  }

  /* ----------------------------- 账号 ----------------------------- */

  /** POST /api/auth/login */
  static async login(username: string, password: string): Promise<SessionUser> {
    const payload: Record<string, string> = {};
    payload['username'] = username;
    payload['password'] = password;
    const response = await httpPostJson(`${API_BASE}/auth/login`, JSON.stringify(payload),
      Session.baseHeaders());
    const dto: AuthDto = parseResponse<AuthDto>(response);
    const user: SessionUser = toSessionUser(dto.user);
    Session.setLogin(dto.token ?? '', user);
    return user;
  }

  /** POST /api/auth/register */
  static async register(username: string, password: string): Promise<SessionUser> {
    const payload: Record<string, string> = {};
    payload['username'] = username;
    payload['password'] = password;
    const response = await httpPostJson(`${API_BASE}/auth/register`, JSON.stringify(payload),
      Session.baseHeaders());
    const dto: AuthDto = parseResponse<AuthDto>(response);
    const user: SessionUser = toSessionUser(dto.user);
    Session.setLogin(dto.token ?? '', user);
    return user;
  }

  /** GET /api/auth/me —— 启动时校验本地 token 是否仍然有效 */
  static async currentUser(): Promise<SessionUser | null> {
    if (!Session.isLoggedIn()) {
      return null;
    }
    const response = await httpGet(`${API_BASE}/auth/me`, Session.authHeaders());
    const dto: MeDto = parseResponse<MeDto>(response);
    if (dto.user === undefined || dto.user === null) {
      return null;
    }
    return toSessionUser(dto.user);
  }

  /** POST /api/auth/logout */
  static async logout(): Promise<void> {
    try {
      const response = await httpPostJson(`${API_BASE}/auth/logout`, '{}', Session.authHeaders());
      parseResponse<LogoutDto>(response);
    } finally {
      Session.clearLogin();
    }
  }

  /* --------------------------- 提交点位 --------------------------- */

  /** POST /api/spots —— 提交后由后端做高德自动核验，命中即自动上线 */
  static async submitSpot(payload: SubmitSpotPayload): Promise<SubmitResult> {
    const response = await httpPostJson(`${API_BASE}/spots`, JSON.stringify(payload),
      Session.submitHeaders());
    const dto: CreateSpotDto = parseResponse<CreateSpotDto>(response);
    const result = new SubmitResult();
    result.id = dto.id ?? 0;
    result.status = dto.status ?? 'pending';
    result.verified = dto.verified ?? false;
    result.autocheck = dto.autocheck ?? '';
    result.message = dto.message ?? '';
    result.duplicated = dto.duplicated ?? false;
    return result;
  }

  /** DELETE /api/spots/:id —— 只能删除自己提交的点位 */
  static async deleteSpot(id: number): Promise<void> {
    const response = await httpDelete(`${API_BASE}/spots/${id}`, Session.authHeaders());
    parseResponse<Record<string, string>>(response);
  }

  /** GET /api/my-spots —— 我提交的点位（含待审核状态） */
  static async mySpots(): Promise<Spot[]> {
    const response = await httpGet(`${API_BASE}/my-spots`, Session.authHeaders());
    const dto: SpotListDto = parseResponse<SpotListDto>(response);
    return normalizeList(dto.data);
  }

  /* --------------------------- 互动 --------------------------- */

  /** POST /api/spots/:id/like —— 登录后按账号记，未登录用 X-Actor-Token */
  static async likeSpot(id: number): Promise<LikeResult> {
    const response = await httpPostJson(`${API_BASE}/spots/${id}/like`, '{}', Session.actorHeaders());
    const dto: LikeDto = parseResponse<LikeDto>(response);
    const result = new LikeResult();
    result.id = dto.id ?? id;
    result.likes = dto.likes ?? 0;
    result.liked = dto.liked ?? false;
    result.message = dto.message ?? '';
    return result;
  }

  /** POST /api/spots/:id/report */
  static async reportSpot(id: number, reason: string): Promise<string> {
    const payload: ReportPayload = { reason: reason };
    const response = await httpPostJson(`${API_BASE}/spots/${id}/report`, JSON.stringify(payload),
      Session.actorHeaders());
    const dto: ReportDto = parseResponse<ReportDto>(response);
    return dto.message ?? '举报已提交';
  }

  /* --------------------------- 图片 --------------------------- */

  /** POST /api/uploads —— 原始二进制体 + Content-Type，返回可访问的图片地址 */
  static async uploadImage(data: ArrayBuffer, contentType: string): Promise<string> {
    const response = await httpPostBinary(`${API_BASE}/uploads`, data, contentType,
      Session.authHeaders());
    const dto: UploadDto = parseResponse<UploadDto>(response);
    return dto.url ?? '';
  }

  /* -------------------------- 私人地图 -------------------------- */

  /** GET /api/maps */
  static async listMaps(): Promise<PrivateMap[]> {
    const response = await httpGet(`${API_BASE}/maps`, Session.authHeaders());
    const dto: PrivateMapListDto = parseResponse<PrivateMapListDto>(response);
    const result: PrivateMap[] = [];
    const rows: PrivateMapDto[] = dto.data ?? [];
    for (let i = 0; i < rows.length; i++) {
      const item = new PrivateMap();
      item.id = rows[i].id ?? 0;
      item.name = rows[i].name ?? '';
      item.description = rows[i].description ?? '';
      item.createdAt = rows[i].created_at ?? '';
      result.push(item);
    }
    return result;
  }

  /** POST /api/maps */
  static async createMap(name: string, description: string): Promise<PrivateMap> {
    const payload: CreateMapPayload = { name: name, description: description };
    const response = await httpPostJson(`${API_BASE}/maps`, JSON.stringify(payload),
      Session.authHeaders());
    const dto: PrivateMapDto = parseResponse<PrivateMapDto>(response);
    const item = new PrivateMap();
    item.id = dto.id ?? 0;
    item.name = dto.name ?? name;
    item.description = description;
    return item;
  }

  /** POST /api/maps/:id/spots —— 收藏点位到私人地图 */
  static async addSpotToMap(mapId: number, spotId: number): Promise<void> {
    const payload: AddMapSpotPayload = { spot_id: spotId };
    const response = await httpPostJson(`${API_BASE}/maps/${mapId}/spots`, JSON.stringify(payload),
      Session.authHeaders());
    parseResponse<Record<string, number>>(response);
  }

  /** GET /api/maps/:id/spots */
  static async listMapSpots(mapId: number): Promise<Spot[]> {
    const response = await httpGet(`${API_BASE}/maps/${mapId}/spots`, Session.authHeaders());
    const dto: SpotListDto = parseResponse<SpotListDto>(response);
    return normalizeList(dto.data);
  }

  /* --------------------------- AI 推荐 --------------------------- */

  /** POST /api/recommend —— 大模型根据需求从已上线点位中整理推荐路线 */
  static async recommend(prompt: string, center: GeoPoint): Promise<RecommendResult> {
    const payload: RecommendPayload = { prompt: prompt, center: center };
    const response = await httpPostJson(`${API_BASE}/recommend`, JSON.stringify(payload),
      Session.baseHeaders());
    const dto: RecommendDto = parseResponse<RecommendDto>(response);
    const result = new RecommendResult();
    result.recommendation = dto.recommendation ?? '';
    result.spotIds = dto.spotIds ?? [];
    result.model = dto.model ?? '';
    return result;
  }
}
