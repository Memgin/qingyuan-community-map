/**
 * 应用主页：底部四个 Tab（地图 / 发现 / AI 向导 / 我的）。
 *
 * 其余页面（点位详情、提交、登录、私人地图）通过 router 跳转，
 * 页面清单登记在 resources/base/profile/main_pages.json 中。
 */
import { common } from '@kit.AbilityKit';
import { STORAGE_LOGGED_IN, STORAGE_OFFLINE, STORAGE_USERNAME } from '../common/utils/Session';
import { initialOf } from '../common/utils/CommonUtil';
import { openChangePassword, openLogin } from '../common/utils/NavUtil';
import { CommunityApi } from '../service/CommunityApi';
import { ReviewNotifier } from '../common/utils/ReviewNotifier';
import { DiscoverTab } from '../view/DiscoverTab';
import { GuideTab } from '../view/GuideTab';
import { MapTab } from '../view/MapTab';
import { MineTab } from '../view/MineTab';

@Entry
@Component
struct Index {
  @State currentIndex: number = 0;
  @StorageLink(STORAGE_OFFLINE) offline: boolean = false;
  @StorageLink(STORAGE_LOGGED_IN) @Watch('onLoginChanged') loggedIn: boolean = false;
  @StorageLink(STORAGE_USERNAME) username: string = '';

  /** 审核结果轮询定时器 id（-1 表示未启动） */
  private reviewTimer: number = -1;

  aboutToAppear(): void {
    // 本地通知需要用户授权：首次启动弹系统对话框（错误 1600004 即由此而来）
    const hostContext = this.getUIContext().getHostContext() as common.UIAbilityContext;
    ReviewNotifier.ensurePermission(hostContext);
    // 先尝试注册服务端推送（Push Kit），失败时自动沿用本地轮询通知
    ReviewNotifier.registerPushToken();
    ReviewNotifier.check();
    // 前台每分钟检查一次；App 完全退到后台时定时器随之停止，回到前台会立即补查
    this.reviewTimer = setInterval(() => {
      ReviewNotifier.check();
    }, 60000);
    // 启动时检测：若当前是管理员重置的临时密码，强制进入改密页
    CommunityApi.checkMustChangePassword().then((mustChange: boolean) => {
      if (mustChange) {
        openChangePassword(this.getUIContext());
      }
    }).catch(() => {
      // 网络异常时跳过检测，不影响正常浏览
    });
  }

  aboutToDisappear(): void {
    if (this.reviewTimer >= 0) {
      clearInterval(this.reviewTimer);
      this.reviewTimer = -1;
    }
  }

  /** 登录成功立刻查一次（不用等一个轮询周期）；退出登录则清空快照 */
  onLoginChanged(): void {
    if (this.loggedIn) {
      ReviewNotifier.check();
    } else {
      ReviewNotifier.reset();
    }
  }

  private goLogin(): void {
    openLogin(this.getUIContext());
  }

  @Builder
  tabItem(label: string, icon: string, index: number) {
    Column({ space: 3 }) {
      Text(icon)
        .fontSize(18)
        .fontColor(this.currentIndex === index ? '#2F6D5A' : '#9AA6A0')
      Text(label)
        .fontSize(11)
        .fontWeight(this.currentIndex === index ? FontWeight.Medium : FontWeight.Normal)
        .fontColor(this.currentIndex === index ? '#2F6D5A' : '#9AA6A0')
    }
    .width('100%')
    .height(54)
    .justifyContent(FlexAlign.Center)
  }

  build() {
    Column() {
      // ---------------- 品牌栏 ----------------
      Row({ space: 10 }) {
        Text('QY')
          .fontSize(14)
          .fontWeight(FontWeight.Bold)
          .fontColor('#FFFFFF')
          .textAlign(TextAlign.Center)
          .width(34)
          .height(34)
          .borderRadius(10)
          .backgroundColor('#2F6D5A')

        Column({ space: 2 }) {
          Text('清远')
            .fontSize(15)
            .fontWeight(FontWeight.Bold)
            .fontColor('#192B2A')
          Text('社区共享地图')
            .fontSize(11)
            .fontColor('#71807A')
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)

        if (this.offline) {
          Text('离线')
            .fontSize(11)
            .fontColor('#8A5A00')
            .padding({ left: 8, right: 8, top: 3, bottom: 3 })
            .backgroundColor('#FFF6E5')
            .borderRadius(10)
        }

        Row({ space: 6 }) {
          Text(initialOf(this.username))
            .fontSize(12)
            .fontColor('#FFFFFF')
            .textAlign(TextAlign.Center)
            .width(24)
            .height(24)
            .borderRadius(12)
            .backgroundColor(this.loggedIn ? '#2F6D5A' : '#B9C2BC')
          Text(this.loggedIn ? this.username : '登录')
            .fontSize(12)
            .fontColor('#192B2A')
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .constraintSize({ maxWidth: 80 })
        }
        .padding({ left: 8, right: 10, top: 4, bottom: 4 })
        .backgroundColor('#FFFDF8')
        .borderRadius(16)
        .border({ width: 1, color: '#DCE1D9' })
        .onClick(() => {
          if (!this.loggedIn) {
            this.goLogin();
          } else {
            this.currentIndex = 3;
          }
        })
      }
      .width('100%')
      .padding({ left: 14, right: 14, top: 10, bottom: 10 })
      .backgroundColor('#F4F3ED')

      // ---------------- 主体 ----------------
      Tabs({ barPosition: BarPosition.End, index: this.currentIndex }) {
        TabContent() {
          MapTab({ active: this.currentIndex === 0 })
        }
        .tabBar(this.tabItem('地图', '◎', 0))

        TabContent() {
          DiscoverTab({ active: this.currentIndex === 1 })
        }
        .tabBar(this.tabItem('发现', '≡', 1))

        TabContent() {
          GuideTab({ active: this.currentIndex === 2 })
        }
        .tabBar(this.tabItem('AI 向导', '✦', 2))

        TabContent() {
          MineTab({ active: this.currentIndex === 3 })
        }
        .tabBar(this.tabItem('我的', '☺', 3))
      }
      .layoutWeight(1)
      .barHeight(54)
      .barMode(BarMode.Fixed)
      .scrollable(false)
      .animationDuration(150)
      .backgroundColor('#F4F3ED')
      .onChange((index: number) => {
        this.currentIndex = index;
      })
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F4F3ED')
  }
}
