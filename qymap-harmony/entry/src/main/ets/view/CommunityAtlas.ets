/**
 * 社区地图示意图（Canvas 原生绘制）。
 *
 * 为什么需要它：华为 Map Kit 需要先在 AppGallery Connect 开通「地图服务」并配置
 * client_id，未配置时地图容器是空白的。为了「打开就能看到内容」，这里用 ArkUI
 * 的 Canvas 画一张按真实经纬度投影的社区示意图：
 * - 按等比缩放把所有点位投影到画布，保证不会因为拉伸而失真；
 * - 点位颜色与网页端分类配色一致；
 * - 点击点位回调给上层，弹出详情卡片。
 *
 * 配置好 Map Kit 后，地图页会自动优先使用原生地图，这张示意图作为兜底与预览。
 */
import { CategoryInfo, CATEGORIES, categoryColor, categoryIcon } from '../common/constants/AppConstants';
import { Spot } from '../model/SpotModels';

@Component
export struct CommunityAtlas {
  @Prop @Watch('redraw') spots: Spot[] = [];
  @Prop @Watch('redraw') selectedId: number = -1;
  onPick: (spot: Spot) => void = () => {
  };

  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private ctx: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);
  private ready: boolean = false;

  redraw(): void {
    if (this.ready) {
      this.draw();
    }
  }

  /** 经纬度 → 画布坐标（等比缩放，居中） */
  private project(spot: Spot, minLat: number, maxLat: number, minLng: number, maxLng: number,
    width: number, height: number): number[] {
    const spanLng: number = Math.max(maxLng - minLng, 0.02);
    const spanLat: number = Math.max(maxLat - minLat, 0.02);
    const scale: number = Math.min(width / spanLng, height / spanLat) * 0.78;
    const centerLng: number = (minLng + maxLng) / 2;
    const centerLat: number = (minLat + maxLat) / 2;
    const x: number = width / 2 + (spot.lng - centerLng) * scale;
    const y: number = height / 2 - (spot.lat - centerLat) * scale;
    return [x, y];
  }

  private draw(): void {
    const ctx: CanvasRenderingContext2D = this.ctx;
    const width: number = ctx.width;
    const height: number = ctx.height;
    if (width <= 0 || height <= 0) {
      return;
    }

    // 底色
    ctx.fillStyle = '#F4F3ED';
    ctx.fillRect(0, 0, width, height);

    // 网格
    ctx.strokeStyle = '#E4E7DE';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 44) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 北江：从东北流向西南的示意河道
    ctx.strokeStyle = '#CBDCE4';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(width * 0.88, height * 0.02);
    ctx.bezierCurveTo(width * 0.72, height * 0.26, width * 0.62, height * 0.52, width * 0.30, height * 0.98);
    ctx.stroke();
    ctx.fillStyle = '#9FB8C4';
    ctx.font = '12vp sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('北江', width * 0.52, height * 0.62);

    // 计算投影范围
    if (this.spots.length === 0) {
      ctx.fillStyle = '#71807A';
      ctx.font = '14vp sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('暂无点位数据', width / 2, height / 2);
      return;
    }
    let minLat: number = this.spots[0].lat;
    let maxLat: number = this.spots[0].lat;
    let minLng: number = this.spots[0].lng;
    let maxLng: number = this.spots[0].lng;
    for (let i = 1; i < this.spots.length; i++) {
      const spot: Spot = this.spots[i];
      minLat = Math.min(minLat, spot.lat);
      maxLat = Math.max(maxLat, spot.lat);
      minLng = Math.min(minLng, spot.lng);
      maxLng = Math.max(maxLng, spot.lng);
    }

    // 点位
    for (let i = 0; i < this.spots.length; i++) {
      const spot: Spot = this.spots[i];
      const point: number[] = this.project(spot, minLat, maxLat, minLng, maxLng, width, height);
      const isSelected: boolean = spot.id === this.selectedId;
      const radius: number = isSelected ? 11 : 7;

      ctx.beginPath();
      ctx.arc(point[0], point[1], radius + 3, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(point[0], point[1], radius, 0, Math.PI * 2);
      ctx.fillStyle = categoryColor(spot.category);
      ctx.fill();

      // 选中的点位显示名称气泡
      if (isSelected) {
        ctx.font = '13vp sans-serif';
        ctx.textAlign = 'center';
        const label: string = spot.name.length > 12 ? `${spot.name.substring(0, 12)}…` : spot.name;
        const textWidth: number = ctx.measureText(label).width;
        const boxWidth: number = textWidth + 18;
        const boxHeight: number = 26;
        const boxX: number = point[0] - boxWidth / 2;
        const boxY: number = point[1] - radius - boxHeight - 8;
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#DCE1D9';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(boxX, boxY, boxWidth, boxHeight);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#192B2A';
        ctx.fillText(label, point[0], boxY + 18);
      }
    }
  }

  /** 命中测试：返回距离点击位置最近且在阈值内的点位 */
  private hitTest(x: number, y: number): Spot | null {
    if (this.spots.length === 0) {
      return null;
    }
    const width: number = this.ctx.width;
    const height: number = this.ctx.height;
    let minLat: number = this.spots[0].lat;
    let maxLat: number = this.spots[0].lat;
    let minLng: number = this.spots[0].lng;
    let maxLng: number = this.spots[0].lng;
    for (let i = 1; i < this.spots.length; i++) {
      const spot: Spot = this.spots[i];
      minLat = Math.min(minLat, spot.lat);
      maxLat = Math.max(maxLat, spot.lat);
      minLng = Math.min(minLng, spot.lng);
      maxLng = Math.max(maxLng, spot.lng);
    }
    let best: Spot | null = null;
    let bestDistance: number = 34;
    for (let i = 0; i < this.spots.length; i++) {
      const spot: Spot = this.spots[i];
      const point: number[] = this.project(spot, minLat, maxLat, minLng, maxLng, width, height);
      const dx: number = point[0] - x;
      const dy: number = point[1] - y;
      const distance: number = Math.sqrt(dx * dx + dy * dy);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = spot;
      }
    }
    return best;
  }

  build() {
    Stack({ alignContent: Alignment.BottomEnd }) {
      Canvas(this.ctx)
        .width('100%')
        .height('100%')
        .onReady(() => {
          this.ready = true;
          this.draw();
        })
        .onClick((event: ClickEvent) => {
          const hit: Spot | null = this.hitTest(event.x, event.y);
          if (hit !== null) {
            this.onPick(hit);
          }
        })

      // 分类图例
      Column({ space: 6 }) {
        ForEach(CATEGORIES.slice(1), (item: CategoryInfo) => {
          Row({ space: 6 }) {
            Text(item.icon)
              .fontSize(11)
              .fontColor('#FFFFFF')
              .textAlign(TextAlign.Center)
              .width(18)
              .height(18)
              .borderRadius(9)
              .backgroundColor(item.color)
            Text(item.label)
              .fontSize(11)
              .fontColor('#192B2A')
          }
        }, (item: CategoryInfo) => item.key)
      }
      .padding(8)
      .margin({ right: 10, bottom: 10 })
      .backgroundColor('#FFFDF8CC')
      .borderRadius(10)
      .border({ width: 1, color: '#DCE1D9' })
    }
    .width('100%')
    .height('100%')
  }
}
