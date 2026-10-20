/**
 * 地图页：社区点位在地图上的分布。
 *
 * 地图有两套渲染实现，互为兜底：
 * 1. 华为 Map Kit 原生地图（MapComponent）—— 需要先在 AppGallery Connect 开通
 *    「地图服务」并把 client_id 写进 module.json5 的 metadata；
 * 2. 社区示意图（CommunityAtlas）—— 用 Canvas 按真实经纬度投影，无需任何配置，
 *    在没有 client_id 的机器上也能正常展示与交互。
 *
 * 启动后先尝试原生地图，若初始化回调报错或 5 秒内没有回调，则自动降级到示意图，
 * 用户也可以在右上角手动切换。
 */
import { AsyncCallback, BusinessError } from '@kit.BasicServicesKit';
import { common } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { map, mapCommon, MapComponent } from '@kit.MapKit';
import {
  CATEGORIES,
  CategoryInfo,
  MAP_CENTER_LAT,
  MAP_CENTER_LNG,
  MAP_DEFAULT_ZOOM,
  categoryColor,
  categoryIcon,
  categoryLabel,
  navigationUrl
} from '../common/constants/AppConstants';
import { toast } from '../common/utils/CommonUtil';
import { locateOnce } from '../common/utils/LocationUtil';
import { openExternalUrl } from '../common/utils/AbilityUtil';
import { openSpotDetail } from '../common/utils/NavUtil';
import { Session } from '../common/utils/Session';
import { Spot } from '../model/SpotModels';
import { SpotLoad, SpotRepository } from '../service/SpotRepository';
import { CommunityAtlas } from './CommunityAtlas';

const DOMAIN: number = 0x0000;
const TAG: string = 'QyMapTab';

@Component
export struct MapTab {
  /** 由首页传入：当前 Tab 是否可见，切回来时按需刷新 */
  @Prop active: boolean = false;

  @State spots: Spot[] = [];
  @State shown: Spot[] = [];
  @State category: string = 'all';
  @State selected: Spot | null = null;
  @State loading: boolean = true;
  @State offlineMode: boolean = false;
  @State banner: string = '';
  @State errorText: string = '';
  @State nativeMap: boolean = true;
  @State locating: boolean = false;

  private controller: map.MapComponentController | null = null;
  private markers: map.Marker[] = [];
  private markerSpots: Spot[] = [];
  private mapReady: boolean = false;

  private mapOptions: mapCommon.MapOptions = {
    position: {
      target: { latitude: MAP_CENTER_LAT, longitude: MAP_CENTER_LNG },
      zoom: MAP_DEFAULT_ZOOM
    },
    zoomControlsEnabled: false,
    myLocationControlsEnabled: false,
    compassControlsEnabled: false
  };

  private mapCallback: AsyncCallback<map.MapComponentController> =
    (err: BusinessError, controller: map.MapComponentController) => {
      if (err !== undefined && err !== null) {
        hilog.warn(DOMAIN, TAG, 'map init failed: %{public}s', JSON.stringify(err));
        this.fallbackToAtlas();
        return;
      }
      this.controller = controller;
      this.mapReady = true;
      controller.on('markerClick', (marker: map.Marker) => {
        this.onMarkerClick(marker);
      });
      this.syncMarkers();
    };

  aboutToAppear(): void {
    this.load();
    // 原生地图需要 AGC 配置；超时未就绪则自动降级，避免用户看到一片空白
    setTimeout(() => {
      if (!this.mapReady && this.nativeMap) {
        hilog.warn(DOMAIN, TAG, 'map not ready in 5s, fallback to atlas');
        this.fallbackToAtlas();
      }
    }, 5000);
  }

  private fallbackToAtlas(): void {
    if (!this.nativeMap) {
      return;
    }
    this.nativeMap = false;
    toast(this.getUIContext(), '未检测到华为地图授权，已切换到社区示意图');
  }

  private context(): common.UIAbilityContext {
    return this.getUIContext().getHostContext() as common.UIAbilityContext;
  }

  /** 拉取地图点位：网络 → 本地缓存 → 内置兜底数据 */
  private async load(): Promise<void> {
    this.loading = true;
    this.errorText = '';
    const previousSync: string = Session.getLastSync();
    const load: SpotLoad = await SpotRepository.loadMapSpots(this.context());
    this.spots = load.spots;
    this.offlineMode = load.offline;
    if (load.error.length > 0 && !load.offline) {
      this.errorText = load.error;
    }
    this.applyFilter();
    this.loading = false;

    // 增量同步：提示其他端（网页 / 其他手机）新提交的点位
    if (previousSync.length > 0) {
      const count: number = await SpotRepository.countUpdatesSince(previousSync);
      this.banner = count > 0 ? `有 ${count} 个新点位，点击刷新` : '';
    }
  }

  private applyFilter(): void {
    if (this.category === 'all') {
      this.shown = this.spots;
    } else {
      this.shown = this.spots.filter((item: Spot) => item.category === this.category);
    }
    const current: Spot | null = this.selected;
    if (current !== null) {
      const keep: Spot | undefined = this.shown.find((item: Spot) => item.id === current.id);
      this.selected = keep === undefined ? null : keep;
    }
    this.syncMarkers();
  }

  private async syncMarkers(): Promise<void> {
    const controller: map.MapComponentController | null = this.controller;
    if (controller === null || !this.nativeMap) {
      return;
    }
    controller.clear();
    this.markers = [];
    this.markerSpots = [];
    for (let i = 0; i < this.shown.length; i++) {
      const spot: Spot = this.shown[i];
      const options: mapCommon.MarkerOptions = {
        position: { latitude: spot.lat, longitude: spot.lng },
        title: spot.name,
        clickable: true,
        visible: true
      };
      const marker: map.Marker = await controller.addMarker(options);
      this.markers.push(marker);
      this.markerSpots.push(spot);
    }
    this.fitBounds();
  }

  /** 把相机移动到刚好覆盖全部点位的范围 */
  private fitBounds(): void {
    const realController: map.MapComponentController | null = this.controller;
    if (realController === null || this.shown.length === 0) {
      return;
    }
    let minLat: number = this.shown[0].lat;
    let maxLat: number = this.shown[0].lat;
    let minLng: number = this.shown[0].lng;
    let maxLng: number = this.shown[0].lng;
    for (let i = 1; i < this.shown.length; i++) {
      const spot: Spot = this.shown[i];
      minLat = Math.min(minLat, spot.lat);
      maxLat = Math.max(maxLat, spot.lat);
      minLng = Math.min(minLng, spot.lng);
      maxLng = Math.max(maxLng, spot.lng);
    }
    if (this.shown.length === 1 || (maxLat - minLat < 0.0005 && maxLng - minLng < 0.0005)) {
      const center: mapCommon.LatLng = { latitude: minLat, longitude: minLng };
      realController.animateCamera(map.newLatLng(center, 15), 600);
      return;
    }
    const bounds: mapCommon.LatLngBounds = {
      southwest: { latitude: minLat, longitude: minLng },
      northeast: { latitude: maxLat, longitude: maxLng }
    };
    realController.animateCamera(map.newLatLngBounds(bounds, 60), 600);
  }

  private onMarkerClick(marker: map.Marker): void {
    for (let i = 0; i < this.markers.length; i++) {
      if (this.markers[i] === marker) {
        this.selected = this.markerSpots[i];
        return;
      }
    }
  }

  private async locateMe(): Promise<void> {
    this.locating = true;
    const result = await locateOnce(this.context());
    this.locating = false;
    toast(this.getUIContext(), result.message);
    if (result.ok && this.controller !== null) {
      const center: mapCommon.LatLng = { latitude: result.lat, longitude: result.lng };
      this.controller.animateCamera(map.newLatLng(center, 15), 600);
    }
  }

  private openDetail(spot: Spot): void {
    openSpotDetail(this.getUIContext(), spot);
  }

  private async navigateTo(spot: Spot): Promise<void> {
    const ok: boolean = await openExternalUrl(this.context(), navigationUrl(spot.name, spot.lat, spot.lng));
    if (!ok) {
      toast(this.getUIContext(), '未找到可用的地图应用');
    }
  }

  @Builder
  categoryChips() {
    Scroll() {
      Row({ space: 8 }) {
        ForEach(CATEGORIES, (item: CategoryInfo) => {
          Row({ space: 6 }) {
            Text(item.icon)
              .fontSize(12)
              .fontColor(this.category === item.key ? '#FFFFFF' : item.color)
            Text(item.label)
              .fontSize(13)
              .fontColor(this.category === item.key ? '#FFFFFF' : '#192B2A')
          }
          .padding({ left: 12, right: 12, top: 7, bottom: 7 })
          .borderRadius(18)
          .backgroundColor(this.category === item.key ? item.color : '#FFFDF8')
          .border({ width: 1, color: this.category === item.key ? item.color : '#DCE1D9' })
          .onClick(() => {
            this.category = item.key;
            this.applyFilter();
          })
        }, (item: CategoryInfo) => item.key)
      }
      .padding({ left: 12, right: 12 })
    }
    .scrollable(ScrollDirection.Horizontal)
    .scrollBar(BarState.Off)
    .width('100%')
  }

  @Builder
  mapTools() {
    Column({ space: 10 }) {
      Button('⌖')
        .fontSize(18)
        .width(42)
        .height(42)
        .backgroundColor('#FFFDF8')
        .fontColor('#2F6D5A')
        .borderRadius(21)
        .border({ width: 1, color: '#DCE1D9' })
        .enabled(!this.locating)
        .onClick(() => {
          this.locateMe();
        })
      Button(this.nativeMap ? '示' : '图')
        .fontSize(13)
        .width(42)
        .height(42)
        .backgroundColor('#FFFDF8')
        .fontColor('#192B2A')
        .borderRadius(21)
        .border({ width: 1, color: '#DCE1D9' })
        .onClick(() => {
          this.nativeMap = !this.nativeMap;
          if (this.nativeMap) {
            this.mapReady = false;
          } else {
            this.controller = null;
          }
        })
      Button('↻')
        .fontSize(18)
        .width(42)
        .height(42)
        .backgroundColor('#2F6D5A')
        .fontColor('#FFFFFF')
        .borderRadius(21)
        .onClick(() => {
          this.load();
        })
    }
  }

  @Builder
  selectedCard(spot: Spot) {
    Column({ space: 10 }) {
      Row({ space: 8 }) {
        Text(categoryIcon(spot.category))
          .fontSize(12)
          .fontColor('#FFFFFF')
          .textAlign(TextAlign.Center)
          .width(20)
          .height(20)
          .borderRadius(10)
          .backgroundColor(categoryColor(spot.category))
        Text(spot.name)
          .fontSize(17)
          .fontWeight(FontWeight.Medium)
          .fontColor('#192B2A')
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text('✕')
          .fontSize(15)
          .fontColor('#9AA6A0')
          .padding(4)
          .onClick(() => {
            this.selected = null;
          })
      }
      .width('100%')

      Text(`${categoryLabel(spot.category)} · ${spot.address}`)
        .fontSize(12)
        .fontColor('#71807A')
        .width('100%')
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })

      Text(spot.description)
        .fontSize(13)
        .fontColor('#4A5A54')
        .width('100%')
        .maxLines(2)
        .textOverflow({ overflow: TextOverflow.Ellipsis })

      Row({ space: 10 }) {
        Button('查看详情')
          .fontSize(14)
          .height(36)
          .layoutWeight(1)
          .backgroundColor('#2F6D5A')
          .fontColor('#FFFFFF')
          .onClick(() => {
            this.openDetail(spot);
          })
        Button('导航')
          .fontSize(14)
          .height(36)
          .layoutWeight(1)
          .backgroundColor('#FFFDF8')
          .fontColor('#2F6D5A')
          .border({ width: 1, color: '#2F6D5A' })
          .onClick(() => {
            this.navigateTo(spot);
          })
      }
      .width('100%')
    }
    .width('100%')
    .padding(14)
    .backgroundColor('#FFFDF8')
    .borderRadius(16)
    .shadow({ radius: 18, color: '#1E36301F', offsetY: 6 })
  }

  build() {
    Stack({ alignContent: Alignment.TopStart }) {
      // ---------------- 地图层 ----------------
      Column() {
        if (this.nativeMap) {
          MapComponent({ mapOptions: this.mapOptions, mapCallback: this.mapCallback })
            .width('100%')
            .height('100%')
        } else {
          CommunityAtlas({
            spots: this.shown,
            selectedId: this.selected === null ? -1 : (this.selected as Spot).id,
            onPick: (spot: Spot) => {
              this.selected = spot;
            }
          })
        }
      }
      .width('100%')
      .height('100%')

      // ---------------- 顶部筛选 ----------------
      Column({ space: 8 }) {
        this.categoryChips()

        if (this.banner.length > 0) {
          Row() {
            Text(this.banner)
              .fontSize(13)
              .fontColor('#8A5A00')
              .layoutWeight(1)
            Text('刷新')
              .fontSize(13)
              .fontColor('#2F6D5A')
              .fontWeight(FontWeight.Medium)
              .onClick(() => {
                this.banner = '';
                this.load();
              })
          }
          .width('100%')
          .padding({ left: 12, right: 12, top: 8, bottom: 8 })
          .backgroundColor('#FFF6E5')
          .borderRadius(10)
        }

        if (this.offlineMode) {
          Text('离线模式：展示本地缓存 / 内置点位数据')
            .fontSize(12)
            .fontColor('#8A5A00')
            .width('100%')
            .padding({ left: 12, right: 12, top: 6, bottom: 6 })
            .backgroundColor('#FFF6E5')
            .borderRadius(10)
        }

        if (this.errorText.length > 0) {
          Text(this.errorText)
            .fontSize(12)
            .fontColor('#B33A3A')
            .width('100%')
            .padding({ left: 12, right: 12, top: 6, bottom: 6 })
            .backgroundColor('#FDECEC')
            .borderRadius(10)
        }

        Row({ space: 8 }) {
          Text(this.loading ? '正在加载点位…' : `共 ${this.shown.length} 个点位 · 点击图钉查看`)
            .fontSize(12)
            .fontColor('#FFFFFF')
            .padding({ left: 10, right: 10, top: 4, bottom: 4 })
            .backgroundColor('#192B2ACC')
            .borderRadius(10)
        }
      }
      .width('100%')
      .padding({ top: 10 })

      // ---------------- 右侧工具条 ----------------
      Column() {
        this.mapTools()
      }
      .width('100%')
      .height('100%')
      .alignItems(HorizontalAlign.End)
      .justifyContent(FlexAlign.Center)
      .padding({ right: 12 })
      .hitTestBehavior(HitTestMode.Transparent)

      // ---------------- 底部详情卡 ----------------
      Column() {
        if (this.selected !== null) {
          this.selectedCard(this.selected as Spot)
        }
      }
      .width('100%')
      .height('100%')
      .justifyContent(FlexAlign.End)
      .padding(12)
      .hitTestBehavior(HitTestMode.Transparent)
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F4F3ED')
  }
}
