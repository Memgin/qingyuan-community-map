/**
 * AI 向导页：用自然语言提问，大模型从已上线点位里整理推荐。
 *
 * 对接的是后端 POST /api/recommend（智谱 glm-4.7-flash，带降级链与 25 秒超时）。
 * 后端除了返回中文文案，还会返回 spotIds（文案里提到的点位 id），
 * 这里据此把对应点位高亮展示，做到「文字 + 点位」联动。
 */
import { MAP_CENTER_LAT, MAP_CENTER_LNG, categoryColor, categoryIcon, categoryLabel } from '../common/constants/AppConstants';
import { toast } from '../common/utils/CommonUtil';
import { describeError } from '../common/utils/HttpUtil';
import { openSpotDetail } from '../common/utils/NavUtil';
import { GeoPoint, RecommendResult, Spot } from '../model/SpotModels';
import { CommunityApi } from '../service/CommunityApi';

@Component
export struct GuideTab {
  @Prop active: boolean = false;

  @State prompt: string = '';
  @State asking: boolean = false;
  @State recommendation: string = '';
  @State model: string = '';
  @State matched: Spot[] = [];
  @State errorText: string = '';

  private examples: string[] = [
    '周末带孩子去哪玩',
    '想找一个安静的徒步地方',
    '附近有什么好吃的小店',
    '坐城际前想在附近转转'
  ];

  private async ask(text: string): Promise<void> {
    const question: string = text.trim();
    if (question.length < 2) {
      toast(this.getUIContext(), '请输入至少 2 个字的推荐需求');
      return;
    }
    this.asking = true;
    this.errorText = '';
    this.recommendation = '';
    this.matched = [];
    try {
      const center: GeoPoint = { lat: MAP_CENTER_LAT, lng: MAP_CENTER_LNG };
      const result: RecommendResult = await CommunityApi.recommend(question, center);
      this.recommendation = result.recommendation;
      this.model = result.model;
      // 文案里命中的点位，用地图接口的轻量数据补齐详情
      if (result.spotIds.length > 0) {
        const all: Spot[] = await CommunityApi.mapSpots();
        const ids: number[] = result.spotIds;
        this.matched = all.filter((item: Spot) => ids.indexOf(item.id) >= 0);
      }
    } catch (err) {
      this.errorText = describeError(err);
    }
    this.asking = false;
  }

  private openDetail(spot: Spot): void {
    openSpotDetail(this.getUIContext(), spot);
  }

  build() {
    Scroll() {
      Column({ space: 14 }) {
        // ---------------- 标题 ----------------
        Column({ space: 6 }) {
          Text('AI GUIDE')
            .fontSize(11)
            .fontColor('#2F6D5A')
            .letterSpacing(2)
          Text('不知道去哪？问问清远。')
            .fontSize(22)
            .fontWeight(FontWeight.Bold)
            .fontColor('#192B2A')
          Text('描述你的需求，模型会从已上线的真实点位里整理一份推荐，并在地图上高亮对应地点。')
            .fontSize(13)
            .fontColor('#71807A')
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)

        // ---------------- 输入 ----------------
        TextArea({ text: this.prompt, placeholder: '例如：周末想找一个安静的徒步地方（2-200 字）' })
          .width('100%')
          .height(88)
          .fontSize(14)
          .backgroundColor('#FFFDF8')
          .borderRadius(12)
          .border({ width: 1, color: '#DCE1D9' })
          .onChange((value: string) => {
            this.prompt = value;
          })

        Button(this.asking ? '正在思考…' : '开始推荐 →')
          .width('100%')
          .height(44)
          .fontSize(15)
          .backgroundColor('#2F6D5A')
          .fontColor('#FFFFFF')
          .enabled(!this.asking)
          .onClick(() => {
            this.ask(this.prompt);
          })

        // ---------------- 快捷提问 ----------------
        Flex({ wrap: FlexWrap.Wrap }) {
          ForEach(this.examples, (item: string) => {
            Text(item)
              .fontSize(12)
              .fontColor('#4A5A54')
              .padding({ left: 10, right: 10, top: 6, bottom: 6 })
              .margin({ right: 8, bottom: 8 })
              .backgroundColor('#FFFDF8')
              .borderRadius(14)
              .border({ width: 1, color: '#DCE1D9' })
              .onClick(() => {
                this.prompt = item;
                this.ask(item);
              })
          }, (item: string) => item)
        }
        .width('100%')

        // ---------------- 结果 ----------------
        if (this.asking) {
          Row({ space: 10 }) {
            LoadingProgress().width(26).height(26).color('#2F6D5A')
            Text('正在从社区点位中整理推荐…')
              .fontSize(13)
              .fontColor('#71807A')
          }
          .width('100%')
          .padding(14)
          .backgroundColor('#FFFDF8')
          .borderRadius(12)
        }

        if (this.errorText.length > 0) {
          Column({ space: 8 }) {
            Text('推荐失败')
              .fontSize(14)
              .fontColor('#B33A3A')
            Text(this.errorText)
              .fontSize(13)
              .fontColor('#B33A3A')
            Text('AI 模型高峰期可能限流，稍后再试即可。')
              .fontSize(12)
              .fontColor('#71807A')
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
          .padding(14)
          .backgroundColor('#FDECEC')
          .borderRadius(12)
        }

        if (this.recommendation.length > 0) {
          Column({ space: 10 }) {
            Row({ space: 8 }) {
              Text('推荐结果')
                .fontSize(15)
                .fontWeight(FontWeight.Medium)
                .fontColor('#192B2A')
                .layoutWeight(1)
              if (this.model.length > 0) {
                Text(this.model)
                  .fontSize(11)
                  .fontColor('#2F6D5A')
                  .padding({ left: 8, right: 8, top: 2, bottom: 2 })
                  .backgroundColor('#E7F1EC')
                  .borderRadius(8)
              }
            }
            .width('100%')

            Text(this.recommendation)
              .fontSize(14)
              .lineHeight(24)
              .fontColor('#2A3A34')
              .width('100%')
              .copyOption(CopyOptions.LocalDevice)
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
          .padding(14)
          .backgroundColor('#FFFDF8')
          .borderRadius(12)
          .border({ width: 1, color: '#DCE1D9' })
        }

        if (this.matched.length > 0) {
          Column({ space: 8 }) {
            Text(`文案中提到的 ${this.matched.length} 个点位`)
              .fontSize(13)
              .fontColor('#71807A')
              .width('100%')
            ForEach(this.matched, (item: Spot) => {
              Row({ space: 10 }) {
                Text(categoryIcon(item.category))
                  .fontSize(12)
                  .fontColor('#FFFFFF')
                  .textAlign(TextAlign.Center)
                  .width(22)
                  .height(22)
                  .borderRadius(11)
                  .backgroundColor(categoryColor(item.category))
                Column({ space: 2 }) {
                  Text(item.name)
                    .fontSize(14)
                    .fontColor('#192B2A')
                    .maxLines(1)
                    .textOverflow({ overflow: TextOverflow.Ellipsis })
                  Text(categoryLabel(item.category))
                    .fontSize(11)
                    .fontColor('#71807A')
                }
                .layoutWeight(1)
                .alignItems(HorizontalAlign.Start)
                Text('详情 ›')
                  .fontSize(12)
                  .fontColor('#2F6D5A')
              }
              .width('100%')
              .padding(10)
              .backgroundColor('#FFFDF8')
              .borderRadius(10)
              .border({ width: 1, color: '#DCE1D9' })
              .onClick(() => {
                this.openDetail(item);
              })
            }, (item: Spot) => String(item.id))
          }
          .width('100%')
        }
      }
      .width('100%')
      .padding(16)
      .alignItems(HorizontalAlign.Start)
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F4F3ED')
    .scrollBar(BarState.Off)
  }
}
