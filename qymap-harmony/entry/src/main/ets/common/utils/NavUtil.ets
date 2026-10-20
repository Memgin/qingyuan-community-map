/**
 * 页面跳转参数封装。
 *
 * router 的 params 类型是 Object，直接传递多个基础类型字段在 ArkTS 里
 * 需要反复做类型断言。这里统一把点位序列化成 JSON 字符串传递，
 * 接收端解析后归一化，避免类型转换出错。
 */
import { UIContext, router } from '@kit.ArkUI';
import { Spot, SpotDto, normalizeSpot } from '../../model/SpotModels';

const KEY_SPOT: string = 'spotJson';
const KEY_MAP_ID: string = 'mapId';
const KEY_MAP_NAME: string = 'mapName';

/** 把点位转成后端风格的 DTO，便于复用 normalizeSpot 反序列化 */
export function spotToJson(spot: Spot): string {
  const dto: SpotDto = {
    id: spot.id,
    name: spot.name,
    address: spot.address,
    category: spot.category,
    description: spot.description,
    lat: spot.lat,
    lng: spot.lng,
    image_url: spot.imageUrl,
    likes: spot.likes,
    created_at: spot.createdAt,
    status: spot.status,
    liked: spot.liked
  };
  return JSON.stringify(dto);
}

/** 跳转到点位详情页 */
export function openSpotDetail(ui: UIContext, spot: Spot): void {
  const params: Record<string, Object> = {};
  params[KEY_SPOT] = spotToJson(spot);
  const options: router.RouterOptions = { url: 'pages/SpotDetailPage', params: params };
  ui.getRouter().pushUrl(options);
}

/** 详情页读取点位参数 */
export function readSpotParam(ui: UIContext): Spot {
  try {
    const raw: Record<string, Object> = ui.getRouter().getParams() as Record<string, Object>;
    const text: Object = raw[KEY_SPOT];
    if (text === undefined || text === null) {
      return new Spot();
    }
    const dto: SpotDto = JSON.parse(text as string) as SpotDto;
    return normalizeSpot(dto);
  } catch (err) {
    return new Spot();
  }
}

/** 跳转到私人地图详情页 */
export function openPrivateMap(ui: UIContext, id: number, name: string): void {
  const params: Record<string, Object> = {};
  params[KEY_MAP_ID] = id;
  params[KEY_MAP_NAME] = name;
  const options: router.RouterOptions = { url: 'pages/PrivateMapPage', params: params };
  ui.getRouter().pushUrl(options);
}

/** 私人地图页读取参数 */
export function readPrivateMapParam(ui: UIContext): number {
  try {
    const raw: Record<string, Object> = ui.getRouter().getParams() as Record<string, Object>;
    const value: Object = raw[KEY_MAP_ID];
    if (value === undefined || value === null) {
      return 0;
    }
    return value as number;
  } catch (err) {
    return 0;
  }
}

/** 私人地图页读取名称（仅用于标题展示） */
export function readPrivateMapName(ui: UIContext): string {
  try {
    const raw: Record<string, Object> = ui.getRouter().getParams() as Record<string, Object>;
    const value: Object = raw[KEY_MAP_NAME];
    if (value === undefined || value === null) {
      return '私人地图';
    }
    return value as string;
  } catch (err) {
    return '私人地图';
  }
}

/** 跳转到登录页 */
export function openLogin(ui: UIContext): void {
  const options: router.RouterOptions = { url: 'pages/LoginPage' };
  ui.getRouter().pushUrl(options);
}

/** 跳转到提交页 */
export function openSubmit(ui: UIContext): void {
  const options: router.RouterOptions = { url: 'pages/SubmitPage' };
  ui.getRouter().pushUrl(options);
}

/** 返回上一页 */
export function goBack(ui: UIContext): void {
  ui.getRouter().back();
}
