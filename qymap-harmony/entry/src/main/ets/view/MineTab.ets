/**
 * 我的页面：账号、我的提交、私人地图、离线同步状态。
 */
import { categoryColor, categoryIcon, statusLabel } from '../common/constants/AppConstants';
import { toast, initialOf, relativeTime } from '../common/utils/CommonUtil';
import { describeError } from '../common/utils/HttpUtil';
import { openLogin, openPrivateMap, openSpotDetail, openSubmit } from '../common/utils/NavUtil';
import { STORAGE_LOGGED_IN, STORAGE_PENDING_SYNC, STORAGE_USERNAME, Session } from '../common/utils/Session';
import { PrivateMap, Spot } from '../model/SpotModels';
import { CommunityApi } from '../service/CommunityApi';
import { SpotRepository } from '../service/SpotRepository';
import { SpotCard } from './SpotCard';

@Component
export struct MineTab {
  @Prop @Watch('onActiveChanged') active: boolean = false;
  @StorageLink(STORAGE_LOGGED_IN) loggedIn: boolean = false;
  @StorageLink(STORAGE_USERNAME) username: string = '';
  @StorageLink(STORAGE_PENDING_SYNC) pendingSync: number = 0;

  @State mySpots: Spot[] = [];
  @State maps: PrivateMap[] = [];
  @State loading: boolean = false;
  @State errorText: string = '';
  @State newMapName: string = '';

  aboutToAppear(): void {
    this.refresh();
  }

  /** 切回本页时刷新（提交或登录后数据会变） */
  onActiveChanged(): void {
    if (this.active) {
      this.refresh();
    }
  }

  private async refresh(): Promise<void> {
    this.loading = true;
    this.errorText = '';
    if (!Session.isLoggedIn()) {
      this.mySpots = [];
      this.maps = [];
      this.loading = false;
      await SpotRepository.refreshPendingCount();
      return;
    }
    try {
      this.mySpots = await SpotRepository.loadMySpots();
      this.maps = await CommunityApi.listMaps();
    } catch (err) {
      this.errorText = describeError(err);
    }
    await SpotRepository.refreshPendingCount();
    this.loading = false;
  }

  private goLogin(): void {
    openLogin(this.getUIContext());
  }

  private goSubmit(): void {
    openSubmit(this.getUIContext());
  }

  private openMap(item: PrivateMap): void {
    openPrivateMap(this.getUIContext(), item.id, item.name);
  }

  private openDetail(spot: Spot): void {
    openSpotDetail(this.getUIContext(), spot);
  }

  private async createMap(): Promise<void> {
    const name: string = this.newMapName.trim();
    if (name.length < 2) {
      toast(this.getUIContext(), '私人地图名称至少 2 个字');
      return;
    }
    try {
      const created: PrivateMap = await CommunityApi.createMap(name, '');
      this.newMapName = '';
      this.maps = await CommunityApi.listMaps();
      toast(this.getUIContext(), `已创建「${created.name}」`);
    } catch (err) {
      toast(this.getUIContext(), describeError(err));
    }
  }

  private async syncNow(): Promise<void> {
    const synced: number = await SpotRepository.flushOutbox();
    if (synced > 0) {
      toast(this.getUIContext(), `已同步 ${synced} 条离线提交`);
    } else {
      toast(this.getUIContext(), '没有待同步的提交');
    }
    this.refresh();
  }

  private async logout(): Promise<void> {
    try {
      await CommunityApi.logout();
    } catch (err) {
      Session.clearLogin();
    }
    this.mySpots = [];
    this.maps = [];
    toast(this.getUIContext(), '已退出登录');
  }

  @Builder
  guestCard() {
    Column({ space: 12 }) {
      Text(initialOf(''))
        .fontSize(22)
        .fontColor('#FFFFFF')
        .textAlign(TextAlign.Center)
        .width(56)
        .height(56)
        .borderRadius(28)
        .backgroundColor('#2F6D5A')
      Text('还没有登录')
        .fontSize(17)
        .fontWeight(FontWeight.Medium)
        .fontColor('#192B2A')
      Text('登录后可以提交点位、收藏到私人地图，并与网页端共享同一份数据。')
        .fontSize(13)
        .fontColor('#71807A')
        .textAlign(TextAlign.Center)
      Row({ space: 10 }) {
        Button('登录 / 注册')
          .fontSize(14)
          .height(40)
          .layoutWeight(1)
          .backgroundColor('#2F6D5A')
          .fontColor('#FFFFFF')
          .onClick(() => {
            this.goLogin();
          })
        Button('先逛逛')
          .fontSize(14)
          .height(40)
          .layoutWeight(1)
          .backgroundColor('#FFFDF8')
          .fontColor('#2F6D5A')
          .border({ width: 1, color: '#2F6D5A' })
          .onClick(() => {
            this.goSubmit();
          })
      }
      .width('100%')
    }
    .width('100%')
    .padding(18)
    .backgroundColor('#FFFDF8')
    .borderRadius(16)
    .border({ width: 1, color: '#DCE1D9' })
  }

  @Builder
  userCard() {
    Column({ space: 12 }) {
      Row({ space: 12 }) {
        Text(initialOf(this.username))
          .fontSize(20)
          .fontColor('#FFFFFF')
          .textAlign(TextAlign.Center)
          .width(52)
          .height(52)
          .borderRadius(26)
          .backgroundColor('#2F6D5A')
        Column({ space: 4 }) {
          Text(this.username.length > 0 ? this.username : '已登录用户')
            .fontSize(17)
            .fontWeight(FontWeight.Medium)
            .fontColor('#192B2A')
          Text('与网页端共用同一账号 · 点赞状态跨端同步')
            .fontSize(12)
            .fontColor('#71807A')
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Start)
      }
      .width('100%')

      Row({ space: 10 }) {
        Column({ space: 2 }) {
          Text(String(this.mySpots.length))
            .fontSize(18)
            .fontColor('#2F6D5A')
          Text('我的提交')
            .fontSize(11)
            .fontColor('#71807A')
        }
        .layoutWeight(1)
        Column({ space: 2 }) {
          Text(String(this.maps.length))
            .fontSize(18)
            .fontColor('#2F6D5A')
          Text('私人地图')
            .fontSize(11)
            .fontColor('#71807A')
        }
        .layoutWeight(1)
        Column({ space: 2 }) {
          Text(String(this.pendingSync))
            .fontSize(18)
            .fontColor(this.pendingSync > 0 ? '#EB765E' : '#2F6D5A')
          Text('待同步')
            .fontSize(11)
            .fontColor('#71807A')
        }
        .layoutWeight(1)
      }
      .width('100%')

      Row({ space: 10 }) {
        Button('＋ 提交点位')
          .fontSize(14)
          .height(38)
          .layoutWeight(1)
          .backgroundColor('#2F6D5A')
          .fontColor('#FFFFFF')
          .onClick(() => {
            this.goSubmit();
          })
        Button('立即同步')
          .fontSize(14)
          .height(38)
          .layoutWeight(1)
          .backgroundColor('#FFFDF8')
          .fontColor('#2F6D5A')
          .border({ width: 1, color: '#2F6D5A' })
          .onClick(() => {
            this.syncNow();
          })
        Button('退出')
          .fontSize(14)
          .height(38)
          .backgroundColor('#FFFDF8')
          .fontColor('#B33A3A')
          .border({ width: 1, color: '#E7C3C3' })
          .onClick(() => {
            this.logout();
          })
      }
      .width('100%')
    }
    .width('100%')
    .padding(18)
    .backgroundColor('#FFFDF8')
    .borderRadius(16)
    .border({ width: 1, color: '#DCE1D9' })
  }

  @Builder
  privateMaps() {
    Column({ space: 10 }) {
      Text('私人地图')
        .fontSize(15)
        .fontWeight(FontWeight.Medium)
        .fontColor('#192B2A')
        .width('100%')
      Row({ space: 8 }) {
        TextInput({ text: this.newMapName, placeholder: '例如：周末带家人去' })
          .layoutWeight(1)
          .height(38)
          .fontSize(13)
          .backgroundColor('#F4F3ED')
          .borderRadius(10)
          .onChange((value: string) => {
            this.newMapName = value;
          })
        Button('创建')
          .fontSize(13)
          .height(38)
          .backgroundColor('#2F6D5A')
          .fontColor('#FFFFFF')
          .onClick(() => {
            this.createMap();
          })
      }
      .width('100%')

      if (this.maps.length === 0) {
        Text('还没有私人地图，创建一个把喜欢的点位收进去。')
          .fontSize(12)
          .fontColor('#9AA6A0')
          .width('100%')
      } else {
        ForEach(this.maps, (item: PrivateMap) => {
          Row({ space: 10 }) {
            Text('☆')
              .fontSize(16)
              .fontColor('#F2C75B')
            Column({ space: 2 }) {
              Text(item.name)
                .fontSize(14)
                .fontColor('#192B2A')
              Text(relativeTime(item.createdAt))
                .fontSize(11)
                .fontColor('#9AA6A0')
            }
            .layoutWeight(1)
            .alignItems(HorizontalAlign.Start)
            Text('查看 ›')
              .fontSize(12)
              .fontColor('#2F6D5A')
          }
          .width('100%')
          .padding(10)
          .backgroundColor('#F9F8F3')
          .borderRadius(10)
          .onClick(() => {
            this.openMap(item);
          })
        }, (item: PrivateMap) => String(item.id))
      }
    }
    .width('100%')
    .padding(16)
    .backgroundColor('#FFFDF8')
    .borderRadius(16)
    .border({ width: 1, color: '#DCE1D9' })
  }

  build() {
    Scroll() {
      Column({ space: 14 }) {
        if (this.loggedIn) {
          this.userCard()
        } else {
          this.guestCard()
        }

        if (this.pendingSync > 0) {
          Row({ space: 8 }) {
            Text('⚠')
              .fontSize(14)
              .fontColor('#8A5A00')
            Text(`有 ${this.pendingSync} 条离线提交等待联网后自动重发`)
              .fontSize(12)
              .fontColor('#8A5A00')
              .layoutWeight(1)
            Text('立即同步')
              .fontSize(12)
              .fontColor('#2F6D5A')
              .onClick(() => {
                this.syncNow();
              })
          }
          .width('100%')
          .padding(12)
          .backgroundColor('#FFF6E5')
          .borderRadius(12)
        }

        if (this.errorText.length > 0) {
          Text(this.errorText)
            .fontSize(12)
            .fontColor('#B33A3A')
            .width('100%')
            .padding(12)
            .backgroundColor('#FDECEC')
            .borderRadius(12)
        }

        if (this.loggedIn) {
          Column({ space: 10 }) {
            Row() {
              Text('我的提交')
                .fontSize(15)
                .fontWeight(FontWeight.Medium)
                .fontColor('#192B2A')
                .layoutWeight(1)
              Text(`${this.mySpots.length} 条`)
                .fontSize(12)
                .fontColor('#71807A')
            }
            .width('100%')

            if (this.loading) {
              LoadingProgress().width(28).height(28).color('#2F6D5A')
            } else if (this.mySpots.length === 0) {
              Text('还没有提交过点位，去分享一个身边的好地方吧。')
                .fontSize(12)
                .fontColor('#9AA6A0')
                .width('100%')
            } else {
              ForEach(this.mySpots, (item: Spot) => {
                SpotCard({
                  spot: item,
                  showStatus: true,
                  onOpen: (spot: Spot) => {
                    this.openDetail(spot);
                  },
                  onLike: (spot: Spot) => {
                  }
                })
              }, (item: Spot) => `my-${item.id}-${item.status}`)
            }
          }
          .width('100%')
        }

        if (this.loggedIn) {
          this.privateMaps()
        }

        // 数据说明
        Column({ space: 6 }) {
          Text('数据说明')
            .fontSize(13)
            .fontWeight(FontWeight.Medium)
            .fontColor('#192B2A')
          Text('· 点位、账号、图片、AI 推荐与网页端 qymap.pages.dev 共用同一套后端')
            .fontSize(12)
            .fontColor('#71807A')
          Text('· 提交点位时由后端调用高德接口自动核验地址，命中即自动上线')
            .fontSize(12)
            .fontColor('#71807A')
          Text('· 断网时展示本地缓存与内置点位快照，提交会进入离线队列')
            .fontSize(12)
            .fontColor('#71807A')
          Text(`· 待审核点位状态：${statusLabel('pending')} / ${statusLabel('approved')} / ${statusLabel('rejected')}`)
            .fontSize(12)
            .fontColor('#71807A')
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)
        .padding(16)
        .backgroundColor('#FFFDF8')
        .borderRadius(16)
        .border({ width: 1, color: '#DCE1D9' })
      }
      .width('100%')
      .padding(16)
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F4F3ED')
    .scrollBar(BarState.Off)
  }
}
