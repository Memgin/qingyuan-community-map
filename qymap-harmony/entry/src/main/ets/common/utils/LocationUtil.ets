/**
 * 定位能力封装（Location Kit）。
 *
 * 流程：动态申请定位权限 → 单次定位 → 返回经纬度。
 * 任何一步失败都返回可展示的中文提示，不会让页面抛异常。
 */
import { abilityAccessCtrl, common, Permissions } from '@kit.AbilityKit';
import { geoLocationManager } from '@kit.LocationKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN: number = 0x0000;
const TAG: string = 'QyMapLocation';

export class GeoResult {
  ok: boolean = false;
  lat: number = 0;
  lng: number = 0;
  message: string = '';
}

export async function locateOnce(context: common.UIAbilityContext): Promise<GeoResult> {
  const result = new GeoResult();
  // Location Kit 并非所有设备都具备（如部分平板/车机），先做能力查询再调用，
  // 避免在不支持的设备上直接抛 801 能力不支持错误。
  if (!canIUse('SystemCapability.Location.Location.Core')) {
    result.message = '当前设备不支持定位能力，已显示清远市中心';
    return result;
  }
  try {
    const atManager: abilityAccessCtrl.AtManager = abilityAccessCtrl.createAtManager();
    const permissions: Permissions[] = [
      'ohos.permission.APPROXIMATELY_LOCATION',
      'ohos.permission.LOCATION'
    ];
    const grant = await atManager.requestPermissionsFromUser(context, permissions);
    let granted: boolean = false;
    for (let i = 0; i < grant.authResults.length; i++) {
      if (grant.authResults[i] === 0) {
        granted = true;
        break;
      }
    }
    if (!granted) {
      result.message = '未获得定位权限，已显示清远市中心';
      return result;
    }
    const request: geoLocationManager.CurrentLocationRequest = {
      priority: geoLocationManager.LocationRequestPriority.FIRST_FIX,
      scenario: geoLocationManager.LocationRequestScenario.UNSET,
      maxAccuracy: 200,
      timeoutMs: 8000
    };
    const location: geoLocationManager.Location = await geoLocationManager.getCurrentLocation(request);
    result.ok = true;
    result.lat = location.latitude;
    result.lng = location.longitude;
    result.message = '已定位到当前位置';
    return result;
  } catch (err) {
    hilog.error(DOMAIN, TAG, 'locate failed: %{public}s', JSON.stringify(err));
    result.message = '定位失败，请确认已开启系统定位服务';
    return result;
  }
}
