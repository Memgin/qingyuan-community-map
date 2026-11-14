/**
 * 发现页：点位列表。
 *
 * 分页、搜索、分类筛选全部由后端完成（GET /api/spots?page=&limit=&category=&q=），
 * 与网页端行为一致：搜索输入 250ms 防抖，翻页不重复拉取全量数据。
 */
import { common } from '@kit.AbilityKit';
import { CategoryInfo, PAGE_SIZE, categoryColor, categoryIcon, categoryLabel } from '../common/constants/AppConstants';
import { CATEGORIES } from '../common/constants/AppConstants';
import { toast, relativeTime } from '../common/utils/CommonUtil';
import { describeError } from '../common/utils/HttpUtil';
import { openSpotDetail, openSubmit } from '../common/utils/NavUtil';
import { Spot } from '../model/SpotModels';
import { SpotListResult } from '../model/SpotModels';
import { CommunityApi } from '../service/CommunityApi';
import { SpotRepository } from '../service/SpotRepository';
import { SpotCard } from './SpotCard';

@Component
export struct DiscoverTab {
  @Prop active: boolean = false;

  @State spots: Spot[] = [];
  @State total: number = 0;
  @State page: number = 1;
  @State category: string = 'all';
  @State keyword: string = '';
  @State loading: boolean = true;
  @State errorText: string = '';
  @State pendingLikeId: number = -1;

  private searchTimer: number = -1;

  aboutToAppear(): void {
    this.reload();
  }

  private totalPages(): number {
    const pages: number = Math.ceil(this.total / PAGE_SIZE);
    return pages < 1 ? 1 : pages;
  }

  private async reload(): Promise<void> {
    this.loading = true;
    this.errorText = '';
    try {
      const result: SpotListResult = await SpotRepository.loadList(this.page, this.category, this.keyword);
      this.spots = result.data;
      this.total = result.total;
      if (this.spots.length === 0 && this.page > 1) {
        this.page = this.page - 1;
        await this.reload();
        return;
      }
    } catch (err) {
      this.errorText = describeError(err);
      this.spots = [];
      this.total = 0;
    }
    this.loading = false;
  }

  /** 输入防抖：250ms 内的连续输入只触发一次后端搜索 */
  private scheduleSearch(): void {
    if (this.searchTimer !== -1) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => {
      this.page = 1;
      this.reload();
    }, 250);
  }

  private async like(spot: Spot): Promise<void> {
    if (this.pendingLikeId === spot.id) {
      return;
    }
    this.pendingLikeId = spot.id;
    try {
      const result = await CommunityApi.likeSpot(spot.id);
      this.spots = this.spots.map((item: Spot) => {
        if (item.id === spot.id) {
          item.likes = result.likes;
          item.liked = result.liked;
        }
        return item;
      });
      if (result.message.length > 0) {
        toast(this.getUIContext(), result.message);
      }
    } catch (err) {
      toast(this.getUIContext(), describeError(err));
    }
    this.pendingLikeId = -1;
  }

  private openDetail(spot: Spot): void {
    openSpotDetail(this.getUIContext(), spot);
  }

  private goSubmit(): void {
    openSubmit(this.getUIContext());
  }

  @Builder
  header() {
    Column({ space: 10 }) {
      Row({ space: 10 }) {
        TextInput({ text: this.keyword, placeholder: '搜索地点名称或简介' })
          .layoutWeight(1)
          .height(40)
          .fontSize(14)
          .backgroundColor('#FFFDF8')
          .borderRadius(20)
          .border({ width: 1, color: '#DCE1D9' })
          .onChange((value: string) => {
            this.keyword = value;
            this.scheduleSearch();
          })
        Button('+ 提交')
          .fontSize(14)
          .height(40)
          .backgroundColor('#2F6D5A')
          .fontColor('#FFFFFF')
          .onClick(() => {
            this.goSubmit();
          })
      }
      .width('100%')

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
            .padding({ left: 12, right: 12, top: 6, bottom: 6 })
            .borderRadius(16)
            .backgroundColor(this.category === item.key ? item.color : '#FFFDF8')
            .border({ width: 1, color: this.category === item.key ? item.color : '#DCE1D9' })
            .onClick(() => {
              this.category = item.key;
              this.page = 1;
              this.reload();
            })
          }, (item: CategoryInfo) => item.key)
        }
      }
      .scrollable(ScrollDirection.Horizontal)
      .scrollBar(BarState.Off)
      .width('100%')
    }
    .width('100%')
    .padding({ left: 12, right: 12, top: 10, bottom: 6 })
  }

  @Builder
  pager() {
    Row({ space: 12 }) {
      Button('← 上一页')
        .fontSize(13)
        .height(34)
        .backgroundColor('#FFFDF8')
        .fontColor(this.page > 1 ? '#2F6D5A' : '#B9C2BC')
        .border({ width: 1, color: '#DCE1D9' })
        .enabled(this.page > 1)
        .onClick(() => {
          if (this.page > 1) {
            this.page = this.page - 1;
            this.reload();
          }
        })
      Text(`${this.page} / ${this.totalPages()} · 共 ${this.total} 个`)
        .fontSize(13)
        .fontColor('#71807A')
        .layoutWeight(1)
        .textAlign(TextAlign.Center)
      Button('下一页 →')
        .fontSize(13)
        .height(34)
        .backgroundColor('#FFFDF8')
        .fontColor(this.page < this.totalPages() ? '#2F6D5A' : '#B9C2BC')
        .border({ width: 1, color: '#DCE1D9' })
        .enabled(this.page < this.totalPages())
        .onClick(() => {
          if (this.page < this.totalPages()) {
            this.page = this.page + 1;
            this.reload();
          }
        })
    }
    .width('100%')
    .padding({ left: 12, right: 12, top: 8, bottom: 8 })
  }

  build() {
    Column() {
      this.header()

      if (this.loading) {
        Column() {
          LoadingProgress()
            .width(40)
            .height(40)
            .color('#2F6D5A')
          Text('正在从社区地图加载…')
            .fontSize(13)
            .fontColor('#71807A')
            .margin({ top: 10 })
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
      } else if (this.errorText.length > 0) {
        Column({ space: 12 }) {
          Text('加载失败')
            .fontSize(16)
            .fontColor('#192B2A')
          Text(this.errorText)
            .fontSize(13)
            .fontColor('#B33A3A')
            .textAlign(TextAlign.Center)
          Button('重试')
            .fontSize(14)
            .backgroundColor('#2F6D5A')
            .onClick(() => {
              this.reload();
            })
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
        .padding(24)
      } else if (this.spots.length === 0) {
        Column({ space: 10 }) {
          Text('没有找到匹配的点位')
            .fontSize(15)
            .fontColor('#192B2A')
          Text('换个关键词，或者成为第一个分享的人')
            .fontSize(13)
            .fontColor('#71807A')
          Button('+ 添加一个地点')
            .fontSize(14)
            .backgroundColor('#2F6D5A')
            .onClick(() => {
              this.goSubmit();
            })
        }
        .width('100%')
        .layoutWeight(1)
        .justifyContent(FlexAlign.Center)
      } else {
        List({ space: 10 }) {
          ForEach(this.spots, (item: Spot) => {
            ListItem() {
              SpotCard({
                spot: item,
                showStatus: false,
                onOpen: (spot: Spot) => {
                  this.openDetail(spot);
                },
                onLike: (spot: Spot) => {
                  this.like(spot);
                }
              })
            }
          }, (item: Spot) => `${item.id}-${item.likes}-${item.liked}`)
        }
        .width('100%')
        .layoutWeight(1)
        .padding({ left: 12, right: 12 })
        .scrollBar(BarState.Off)

        this.pager()
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F4F3ED')
  }
}
