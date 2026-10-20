/**
 * 拉起系统能力的小工具。
 */
import { common, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN: number = 0x0000;
const TAG: string = 'QyMapAbility';

/**
 * 用系统浏览器打开外部链接。
 * 典型场景：点击「导航」把坐标交给高德地图的 URL Scheme / 浏览器。
 */
export async function openExternalUrl(context: common.UIAbilityContext, url: string): Promise<boolean> {
  const want: Want = {
    action: 'ohos.want.action.viewData',
    entities: ['entity.system.browsable'],
    uri: url
  };
  try {
    await context.startAbility(want);
    return true;
  } catch (err) {
    hilog.error(DOMAIN, TAG, 'startAbility failed: %{public}s', JSON.stringify(err));
    return false;
  }
}
