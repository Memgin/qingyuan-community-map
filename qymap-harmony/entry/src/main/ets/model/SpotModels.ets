/**
 * 数据模型层。
 *
 * 约定：
 * - `XxxDto` 与后端 JSON 一一对应，字段全部可选，因为服务端可能返回 null、
 *   也可能按 `fields=map` 只返回部分字段（见后端 listSpots 的 columns 分支）。
 * - 界面只使用归一化后的模型（Spot / PrivateMap / SessionUser ...），
 *   由 normalizeXxx() 负责补齐默认值，避免空值导致 UI 崩溃。
 */

/* ------------------------------ 点位 ------------------------------ */

/** 后端点位原始结构 */
export interface SpotDto {
  id?: number;
  name?: string;
  address?: string;
  category?: string;
  description?: string;
  lat?: number;
  lng?: number;
  image_url?: string | null;
  likes?: number;
  created_at?: string;
  status?: string;
  /** 登录后列表接口会附带该用户是否已点赞 */
  liked?: boolean;
}

/** 归一化后的点位模型 */
export class Spot {
  id: number = 0;
  name: string = '';
  address: string = '';
  category: string = 'scenic';
  description: string = '';
  lat: number = 0;
  lng: number = 0;
  /** 空串代表没有配图 */
  imageUrl: string = '';
  likes: number = 0;
  createdAt: string = '';
  status: string = 'approved';
  liked: boolean = false;
}

/** 把后端原始点位补全为界面模型 */
export function normalizeSpot(dto: SpotDto): Spot {
  const spot = new Spot();
  spot.id = dto.id ?? 0;
  spot.name = dto.name ?? '';
  spot.address = dto.address ?? '';
  spot.category = dto.category ?? 'scenic';
  spot.description = dto.description ?? '';
  spot.lat = dto.lat ?? 0;
  spot.lng = dto.lng ?? 0;
  spot.imageUrl = dto.image_url ?? '';
  spot.likes = dto.likes ?? 0;
  spot.createdAt = dto.created_at ?? '';
  spot.status = dto.status ?? 'approved';
  spot.liked = dto.liked ?? false;
  return spot;
}

/** GET /api/spots 的响应体 */
export interface SpotListDto {
  data?: SpotDto[];
  page?: number;
  limit?: number;
  total?: number;
  error?: string;
}

/** 点位列表分页结果 */
export class SpotListResult {
  data: Spot[] = [];
  page: number = 1;
  limit: number = 20;
  total: number = 0;
}

/* ------------------------------ 账号 ------------------------------ */

export interface UserDto {
  id?: number;
  username?: string;
}

export interface AuthDto {
  token?: string;
  user?: UserDto;
  error?: string;
}

export interface MeDto {
  user?: UserDto | null;
}

export interface LogoutDto {
  loggedOut?: boolean;
  error?: string;
}

/** 归一化后的当前用户 */
export class SessionUser {
  id: number = 0;
  username: string = '';

  constructor(id: number, username: string) {
    this.id = id;
    this.username = username;
  }
}

/* --------------------------- 提交 / 审核 --------------------------- */

/** POST /api/spots 请求体（字段名与后端 validateSpot 完全一致） */
export interface SubmitSpotPayload {
  name: string;
  address: string;
  category: string;
  description: string;
  lat: number;
  lng: number;
  image_url: string;
  /** 离线队列幂等键：同一条提交重复发送只写入一次 */
  client_token: string;
}

export interface CreateSpotDto {
  id?: number;
  status?: string;
  verified?: boolean;
  autocheck?: string;
  message?: string;
  duplicated?: boolean;
  error?: string;
}

/** 提交结果（用于离线队列判断是否需要出队） */
export class SubmitResult {
  id: number = 0;
  status: string = 'pending';
  verified: boolean = false;
  autocheck: string = '';
  message: string = '';
  duplicated: boolean = false;
}

export interface LikeDto {
  id?: number;
  likes?: number;
  liked?: boolean;
  message?: string;
  error?: string;
}

export class LikeResult {
  id: number = 0;
  likes: number = 0;
  liked: boolean = false;
  message: string = '';
}

export interface ReportDto {
  id?: number;
  message?: string;
  error?: string;
}

/** 举报请求体 */
export interface ReportPayload {
  reason: string;
}

/* --------------------------- 私人地图 --------------------------- */

export interface PrivateMapDto {
  id?: number;
  name?: string;
  description?: string;
  created_at?: string;
  error?: string;
}

export class PrivateMap {
  id: number = 0;
  name: string = '';
  description: string = '';
  createdAt: string = '';
}

export interface PrivateMapListDto {
  data?: PrivateMapDto[];
  error?: string;
}

export interface CreateMapPayload {
  name: string;
  description: string;
}

export interface AddMapSpotPayload {
  spot_id: number;
}

/* ------------------------------ 图片 ------------------------------ */

export interface UploadDto {
  url?: string;
  error?: string;
}

/* --------------------------- AI 推荐 --------------------------- */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface RecommendPayload {
  prompt: string;
  center: GeoPoint;
}

export interface RecommendDto {
  recommendation?: string;
  spotIds?: number[];
  model?: string;
  error?: string;
}

export class RecommendResult {
  recommendation: string = '';
  spotIds: number[] = [];
  model: string = '';
}

/* --------------------------- 离线提交队列 --------------------------- */

/** 离线队列中的一条待重发提交 */
export interface OutboxItem {
  clientToken: string;
  payload: SubmitSpotPayload;
}
