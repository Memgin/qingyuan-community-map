/**
 * 点位详情页。
 *
 * 数据由上一页通过 router params 传入（见 NavUtil.spotToJson），
 * 页面负责点赞、举报、收藏到私人地图、导航等交互。
 */
import { common } from '@kit.AbilityKit';
import {
  categoryColor,
  categoryIcon,
  categoryLabel,
  navigationUrl,
  statusLabel
} from '../common/constants/AppConstants';
import { toast, relativeTime, distanceMeters, formatDistance } from '../common/utils/CommonUtil';
import { describeError } from '../common/utils/HttpUtil';
import { goBack, openLogin, readSpotParam } from '../common/utils/NavUtil';
import { openExternalUrl } from '../common/utils/AbilityUtil';
import { locateOnce } from '../common/utils/LocationUtil';
import { Session } from '../common/utils/Session';
import { LikeResult, PrivateMap, Spot } from '../model/SpotModels';
import { CommunityApi } from '../service/CommunityApi';
import { CommunityAtlas } from '../view/CommunityAtlas';

@Entry
@Component
struct SpotDetailPage {
  @State spot: Spot = new Spot();
  @State maps: PrivateMap[] = [];
  @State showReport: boolean = false;
  @State showMapPicker: boolean = false;
  @State reportReason: string = '';
  @State busy: boolean = false;
  @State distanceText: string = '';
  @State distanceLoading: boolean = false;

  aboutToAppear(): void {
    this.spot = readSpotParam(this.getUIContext());
  }

  private async like(): Promise<void> {
    if (this.busy) {
      return;
    }
    this.busy = true;
    try {
      const result: LikeResult = await CommunityApi.likeSpot(this.spot.id);
      this.spot.likes = result.likes;
      this.spot.liked = result.liked;
      toast(this.getUIContext(), result.message.length > 0 ? result.message : '点赞成功');
    } catch (err) {
      toast(this.getUIContext(), describeError(err));
    }
    this.busy = false;
  }

  private async submitReport(): Promise<void> {
    const reason: string = this.reportReason.trim();
    if (reason.length < 2 || reason.length > 200) {
      toast(this.getUIContext(), '举报原因需为 2-200 个字符');
      return;
    }
    try {
      const message: string = await CommunityApi.reportSpot(this.spot.id, reason);
      this.showReport = false;
      this.reportReason = '';
      toast(this.getUIContext(), message);
    } catch (err) {
      toast(this.getUIContext(), describeError(err));
    }
  }

  private async openMapPicker(): Promise<void> {
    if (!Session.isLoggedIn()) {
      toast(this.getUIContext(), '请先登录后再收藏');
      openLogin(this.getUIContext());
      return;
    }
    try {
      this.maps = await CommunityApi.listMaps();
    } catch (err) {
      toast(this.getUIContext(), describeError(err));
      return;
    }
    if (this.maps.length === 0) {
      toast(this.getUIContext(), '还没有私人地图，请到「我的」页面创建');
      return;
    }
    this.showMapPicker = true;
  }

  private async addToMap(item: PrivateMap): Promise<void> {
    try {
      await CommunityApi.addSpotToMap(item.id, this.spot.id);
      this.showMapPicker = false;
      toast(this.getUIContext(), `已收藏到「${item.name}」`);
    } catch (err) {
      toast(this.getUIContext(), describeError(err));
    }
  }

  private async navigate(): Promise<void> {
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    const ok: boolean = await openExternalUrl(context,
      navigationUrl(this.spot.name, this.spot.lat, this.spot.lng));
    if (!ok) {
      toast(this.getUIContext(), '未找到可用的地图应用');
    }
  }

  /** 计算当前位置到该点位的直线距离（Location Kit） */
  private async measureDistance(): Promise<void> {
    this.distanceLoading = true;
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    const geo = await locateOnce(context);
    this.distanceLoading = false;
    if (!geo.ok) {
      toast(this.getUIContext(), geo.message);
      return;
    }
    const meters: number = distanceMeters(geo.lat, geo.lng, this.spot.lat, this.spot.lng);
    this.distanceText = `距你约 ${formatDistance(meters)}`;
  }

  @Builder
  infoRow(label: string, value: string) {
    Row({ space: 10 }) {
      Text(label)
        .fontSize(12)
        .fontColor('#9AA6A0')
        .width(56)
      Text(value)
        .fontSize(13)
        .fontColor('#2A3A34')
        .layoutWeight(1)
    }
    .width('100%')
    .alignItems(VerticalAlign.Top)
  }

  build() {
    Column() {
      // ---------------- 顶栏 ----------------
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
        Text('点位详情')
          .fontSize(17)
          .fontWeight(FontWeight.Medium)
          .fontColor('#192B2A')
          .layoutWeight(1)
        Text(this.spot.liked ? '♥' : '♡')
          .fontSize(20)
          .fontColor(this.spot.liked ? '#EB765E' : '#9AA6A0')
          .padding(6)
          .onClick(() => {
            this.like();
          })
      }
      .width('100%')
      .padding({ left: 8, right: 12, top: 10, bottom: 10 })
      .backgroundColor('#F4F3ED')

      Scroll() {
        Column({ space: 14 }) {
          // ---------------- 配图 ----------------
          if (this.spot.imageUrl.length > 0) {
            Image(this.spot.imageUrl)
              .width('100%')
              .height(200)
              .objectFit(ImageFit.Cover)
              .borderRadius(16)
              .alt($r('app.media.startIcon'))
          }

          // ---------------- 标题区 ----------------
          Column({ space: 10 }) {
            Row({ space: 10 }) {
              Text(categoryIcon(this.spot.category))
                .fontSize(13)
                .fontColor('#FFFFFF')
                .textAlign(TextAlign.Center)
                .width(24)
                .height(24)
                .borderRadius(12)
                .backgroundColor(categoryColor(this.spot.category))
              Text(this.spot.name)
                .fontSize(21)
                .fontWeight(FontWeight.Bold)
                .fontColor('#192B2A')
                .layoutWeight(1)
            }
            .width('100%')

            Text(this.spot.description)
              .fontSize(14)
              .lineHeight(23)
              .fontColor('#4A5A54')
              .width('100%')

            Row({ space: 8 }) {
              Text(categoryLabel(this.spot.category))
                .fontSize(11)
                .fontColor(categoryColor(this.spot.category))
                .padding({ left: 9, right: 9, top: 3, bottom: 3 })
                .backgroundColor('#FFFDF8')
                .borderRadius(9)
                .border({ width: 1, color: categoryColor(this.spot.category) })
              Text(statusLabel(this.spot.status))
                .fontSize(11)
                .fontColor('#2F6D5A')
                .padding({ left: 9, right: 9, top: 3, bottom: 3 })
                .backgroundColor('#E7F1EC')
                .borderRadius(9)
              if (this.spot.createdAt.length > 0) {
                Text(relativeTime(this.spot.createdAt))
                  .fontSize(11)
                  .fontColor('#9AA6A0')
              }
            }
            .width('100%')
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
          .padding(16)
          .backgroundColor('#FFFDF8')
          .borderRadius(16)
          .border({ width: 1, color: '#DCE1D9' })

          // ---------------- 位置信息 ----------------
          Column({ space: 10 }) {
            this.infoRow('地址', this.spot.address)
            this.infoRow('坐标', `${this.spot.lat.toFixed(6)}, ${this.spot.lng.toFixed(6)}`)
            this.infoRow('点赞', `${this.spot.likes} 次`)

            Row({ space: 8 }) {
              Text(this.distanceText.length > 0 ? this.distanceText : '计算到我这里的距离')
                .fontSize(12)
                .fontColor('#2F6D5A')
                .layoutWeight(1)
              if (this.distanceLoading) {
                LoadingProgress().width(18).height(18).color('#2F6D5A')
              } else {
                Text('计算')
                  .fontSize(12)
                  .fontColor('#2F6D5A')
              }
            }
            .width('100%')
            .padding(10)
            .backgroundColor('#E7F1EC')
            .borderRadius(10)
            .onClick(() => {
              this.measureDistance();
            })

            // 单点位定位示意图
            Column() {
              CommunityAtlas({
                spots: [this.spot],
                selectedId: this.spot.id,
                onPick: (spot: Spot) => {
                }
              })
            }
            .width('100%')
            .height(160)
            .borderRadius(12)
            .clip(true)
            .border({ width: 1, color: '#DCE1D9' })
          }
          .width('100%')
          .padding(16)
          .backgroundColor('#FFFDF8')
          .borderRadius(16)
          .border({ width: 1, color: '#DCE1D9' })

          // ---------------- 操作 ----------------
          Row({ space: 10 }) {
            Button(this.spot.liked ? '♥ 已点赞' : '♡ 点赞')
              .fontSize(14)
              .height(42)
              .layoutWeight(1)
              .backgroundColor(this.spot.liked ? '#EB765E' : '#2F6D5A')
              .fontColor('#FFFFFF')
              .enabled(!this.busy)
              .onClick(() => {
                this.like();
              })
            Button('导航')
              .fontSize(14)
              .height(42)
              .layoutWeight(1)
              .backgroundColor('#FFFDF8')
              .fontColor('#2F6D5A')
              .border({ width: 1, color: '#2F6D5A' })
              .onClick(() => {
                this.navigate();
              })
            Button('收藏')
              .fontSize(14)
              .height(42)
              .layoutWeight(1)
              .backgroundColor('#FFFDF8')
              .fontColor('#2F6D5A')
              .border({ width: 1, color: '#2F6D5A' })
              .onClick(() => {
                this.showMapPicker ? this.showMapPicker = false : this.openMapPicker();
              })
          }
          .width('100%')

          // ---------------- 收藏选择 ----------------
          if (this.showMapPicker) {
            Column({ space: 8 }) {
              Text('选择要收藏到的私人地图')
                .fontSize(13)
                .fontColor('#71807A')
                .width('100%')
              ForEach(this.maps, (item: PrivateMap) => {
                Row({ space: 8 }) {
                  Text('☆').fontSize(14).fontColor('#F2C75B')
                  Text(item.name)
                    .fontSize(14)
                    .fontColor('#192B2A')
                    .layoutWeight(1)
                  Text('收藏 ›')
                    .fontSize(12)
                    .fontColor('#2F6D5A')
                }
                .width('100%')
                .padding(10)
                .backgroundColor('#FFFDF8')
                .borderRadius(10)
                .border({ width: 1, color: '#DCE1D9' })
                .onClick(() => {
                  this.addToMap(item);
                })
              }, (item: PrivateMap) => String(item.id))
            }
            .width('100%')
            .padding(14)
            .backgroundColor('#F9F8F3')
            .borderRadius(14)
          }

          // ---------------- 举报 ----------------
          if (this.showReport) {
            Column({ space: 10 }) {
              Text('举报这个点位')
                .fontSize(13)
                .fontColor('#71807A')
                .width('100%')
              TextInput({ text: this.reportReason, placeholder: '说明原因（2-200 字）' })
                .height(40)
                .fontSize(13)
                .backgroundColor('#FFFDF8')
                .borderRadius(10)
                .onChange((value: string) => {
                  this.reportReason = value;
                })
              Row({ space: 10 }) {
                Button('取消')
                  .fontSize(13)
                  .height(36)
                  .layoutWeight(1)
                  .backgroundColor('#FFFDF8')
                  .fontColor('#71807A')
                  .border({ width: 1, color: '#DCE1D9' })
                  .onClick(() => {
                    this.showReport = false;
                  })
                Button('提交举报')
                  .fontSize(13)
                  .height(36)
                  .layoutWeight(1)
                  .backgroundColor('#B33A3A')
                  .fontColor('#FFFFFF')
                  .onClick(() => {
                    this.submitReport();
                  })
              }
              .width('100%')
            }
            .width('100%')
            .padding(14)
            .backgroundColor('#FDECEC')
            .borderRadius(14)
          } else {
            Text('举报不实或违规内容')
              .fontSize(12)
              .fontColor('#9AA6A0')
              .width('100%')
              .textAlign(TextAlign.Center)
              .padding(10)
              .onClick(() => {
                this.showReport = true;
              })
          }
        }
        .width('100%')
        .padding(16)
      }
      .layoutWeight(1)
      .scrollBar(BarState.Off)
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F4F3ED')
  }
}
