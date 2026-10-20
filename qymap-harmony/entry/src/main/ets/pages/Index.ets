/**
 * 应用主页：底部四个 Tab（地图 / 发现 / AI 向导 / 我的）。
 *
 * 其余页面（点位详情、提交、登录、私人地图）通过 router 跳转，
 * 页面清单登记在 resources/base/profile/main_pages.json 中。
 */
import { STORAGE_LOGGED_IN, STORAGE_OFFLINE, STORAGE_USERNAME } from '../common/utils/Session';
import { initialOf } from '../common/utils/CommonUtil';
import { openLogin } from '../common/utils/NavUtil';
import { DiscoverTab } from '../view/DiscoverTab';
import { GuideTab } from '../view/GuideTab';
import { MapTab } from '../view/MapTab';
import { MineTab } from '../view/MineTab';

@Entry
@Component
struct Index {
  @State currentIndex: number = 0;
  @StorageLink(STORAGE_OFFLINE) offline: boolean = false;
  @StorageLink(STORAGE_LOGGED_IN) loggedIn: boolean = false;
  @StorageLink(STORAGE_USERNAME) username: string = '';

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
