import { AbilityConstant, ConfigurationConstant, UIAbility, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { window } from '@kit.ArkUI';
import { PreferenceUtil } from '../common/utils/PreferenceUtil';
import { Session } from '../common/utils/Session';
import { LocalStore } from '../service/LocalStore';
import { SpotRepository } from '../service/SpotRepository';

const DOMAIN: number = 0x0000;
const TAG: string = 'QyMapAbility';

export default class EntryAbility extends UIAbility {

  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(DOMAIN, TAG, '%{public}s', 'Ability onCreate');
    // 1) 轻量持久化：登录 token、提交者身份串、增量同步时间
    PreferenceUtil.init(this.context);
    Session.bootstrap();
    // 2) 全局可用的 AbilityContext，供页面做定位 / 拉起浏览器
    AppStorage.setOrCreate('abilityContext', this.context);
  }

  onDestroy(): void {
    hilog.info(DOMAIN, TAG, '%{public}s', 'Ability onDestroy');
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    hilog.info(DOMAIN, TAG, '%{public}s', 'Ability onWindowStageCreate');
    try {
      this.context.getApplicationContext().setColorMode(ConfigurationConstant.ColorMode.COLOR_MODE_NOT_SET);
    } catch (err) {
      hilog.error(DOMAIN, TAG, 'Failed to set colorMode: %{public}s', JSON.stringify(err));
    }

    // 先建好关系型数据库并重发离线队列，再加载首页，
    // 保证首屏就能读到离线缓存与待同步条数。
    LocalStore.init(this.context)
      .then(() => {
        return SpotRepository.flushOutbox();
      })
      .then((synced: number) => {
        hilog.info(DOMAIN, TAG, 'offline outbox flushed: %{public}d', synced);
        this.loadHome(windowStage);
      })
      .catch((err: Object) => {
        hilog.error(DOMAIN, TAG, 'init local store failed: %{public}s', JSON.stringify(err));
        this.loadHome(windowStage);
      });
  }

  private loadHome(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (err) => {
      if (err.code) {
        hilog.error(DOMAIN, TAG, 'Failed to load the content: %{public}s', JSON.stringify(err));
        return;
      }
      hilog.info(DOMAIN, TAG, '%{public}s', 'Succeeded in loading the content.');
    });
  }

  onWindowStageDestroy(): void {
    hilog.info(DOMAIN, TAG, '%{public}s', 'Ability onWindowStageDestroy');
  }

  onForeground(): void {
    hilog.info(DOMAIN, TAG, '%{public}s', 'Ability onForeground');
    // 回到前台时补发离线队列（可能在后台期间恢复了网络）
    SpotRepository.flushOutbox().catch(() => {
    });
  }

  onBackground(): void {
    hilog.info(DOMAIN, TAG, '%{public}s', 'Ability onBackground');
  }
}
