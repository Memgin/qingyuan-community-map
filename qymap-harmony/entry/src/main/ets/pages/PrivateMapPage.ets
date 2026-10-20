/**
 * 私人地图详情页：展示某个私人地图里收藏的点位。
 *
 * 对应后端 GET /api/maps/:id/spots —— 只有地图拥有者能读取，
 * 与网页端「我的私人地图」看到的是同一份数据。
 */
import { toast } from '../common/utils/CommonUtil';
import { describeError } from '../common/utils/HttpUtil';
import { goBack, openSpotDetail, readPrivateMapName, readPrivateMapParam } from '../common/utils/NavUtil';
import { Spot } from '../model/SpotModels';
import { CommunityApi } from '../service/CommunityApi';
import { SpotCard } from '../view/SpotCard';

@Entry
@Component
struct PrivateMapPage {
  @State mapId: number = 0;
  @State mapName: string = '私人地图';
  @State spots: Spot[] = [];
  @State loading: boolean = true;
  @State errorText: string = '';

  aboutToAppear(): void {
    this.mapId = readPrivateMapParam(this.getUIContext());
    this.mapName = readPrivateMapName(this.getUIContext());
    this.load();
  }

  private async load(): Promise<void> {
    this.loading = true;
    this.errorText = '';
    try {
      this.spots = await CommunityApi.listMapSpots(this.mapId);
    } catch (err) {
      this.errorText = describeError(err);
    }
    this.loading = false;
  }

  build() {
    Column() {
      Row({ space: 10 }) {
        Text('‹')
          .fontSize(24)
          .fontColor('#192B2A')
          .width(32)
          .height(32)
          .textAlign(TextAlign.Center)
          .onClick(() => {
            goBack(this.getUIContext());
          })
        Column({ space: 2 }) {
          Text(this.mapName)
            .fontSize(17)
            .fontWeight(FontWeight.Medium)
            .fontColor('#192B2A')
          Text('PRIVATE MAP')
            .fontSize(10)
            .fontColor('#9AA6A0')
            .letterSpacing(2)
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
        Text('↻')
          .fontSize(18)
          .fontColor('#2F6D5A')
          .padding(6)
          .onClick(() => {
            this.load();
          })
      }
      .width('100%')
      .padding({ left: 8, right: 12, top: 10, bottom: 10 })

      if (this.loading) {
        Column() {
          LoadingProgress().width(36).height(36).color('#2F6D5A')
          Text('正在加载收藏…')
            .fontSize(13)
            .fontColor('#71807A')
            .margin({ top: 10 })
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
      } else if (this.errorText.length > 0) {
        Column({ space: 12 }) {
          Text(this.errorText)
            .fontSize(13)
            .fontColor('#B33A3A')
            .textAlign(TextAlign.Center)
          Button('重试')
            .fontSize(14)
            .backgroundColor('#2F6D5A')
            .onClick(() => {
              this.load();
            })
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
        .padding(24)
      } else if (this.spots.length === 0) {
        Column({ space: 10 }) {
          Text('这张私人地图还是空的')
            .fontSize(15)
            .fontColor('#192B2A')
          Text('在点位详情页点「收藏」，就能把地点放进这里。')
            .fontSize(13)
            .fontColor('#71807A')
            .textAlign(TextAlign.Center)
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
        .padding(24)
      } else {
        List({ space: 10 }) {
          ForEach(this.spots, (item: Spot) => {
            ListItem() {
              SpotCard({
                spot: item,
                showStatus: false,
                onOpen: (spot: Spot) => {
                  openSpotDetail(this.getUIContext(), spot);
                },
                onLike: (spot: Spot) => {
                  toast(this.getUIContext(), '请到点位详情页点赞');
                }
              })
            }
          }, (item: Spot) => `pm-${item.id}`)
        }
        .width('100%')
        .layoutWeight(1)
        .padding(16)
        .scrollBar(BarState.Off)
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F4F3ED')
  }
}
