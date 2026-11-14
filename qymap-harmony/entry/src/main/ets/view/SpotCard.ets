/**
 * 点位列表卡片：列表页、我的提交、私人地图共用。
 */
import { categoryColor, categoryIcon, categoryLabel, statusLabel } from '../common/constants/AppConstants';
import { relativeTime } from '../common/utils/CommonUtil';
import { Spot } from '../model/SpotModels';

@Component
export struct SpotCard {
  @Prop spot: Spot = new Spot();
  /** 是否展示审核状态（我的提交页面需要） */
  @Prop showStatus: boolean = false;
  /** 是否展示「编辑」入口（我的提交页面需要，配合 onEdit 使用） */
  @Prop showEdit: boolean = false;
  onOpen: (spot: Spot) => void = () => {
  };
  onLike: (spot: Spot) => void = () => {
  };
  onEdit: (spot: Spot) => void = () => {
  };

  build() {
    Row({ space: 12 }) {
      // 分类色条
      Column()
        .width(4)
        .height(52)
        .borderRadius(2)
        .backgroundColor(categoryColor(this.spot.category))

      Column({ space: 6 }) {
        Row({ space: 8 }) {
          Text(categoryIcon(this.spot.category))
            .fontSize(11)
            .fontColor('#FFFFFF')
            .textAlign(TextAlign.Center)
            .width(18)
            .height(18)
            .borderRadius(9)
            .backgroundColor(categoryColor(this.spot.category))
          Text(this.spot.name)
            .fontSize(16)
            .fontWeight(FontWeight.Medium)
            .fontColor('#192B2A')
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
            .layoutWeight(1)
          if (this.showStatus) {
            Text(statusLabel(this.spot.status))
              .fontSize(11)
              .fontColor(this.spot.status === 'approved' ? '#2F6D5A' : '#8A5A00')
              .backgroundColor(this.spot.status === 'approved' ? '#E7F1EC' : '#FFF6E5')
              .padding({ left: 8, right: 8, top: 2, bottom: 2 })
              .borderRadius(8)
          }
        }
        .width('100%')

        Text(`${categoryLabel(this.spot.category)} · ${this.spot.address}`)
          .fontSize(12)
          .fontColor('#71807A')
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .width('100%')

        Text(this.spot.description)
          .fontSize(13)
          .fontColor('#4A5A54')
          .maxLines(2)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .width('100%')

        if (this.spot.createdAt.length > 0) {
          Text(relativeTime(this.spot.createdAt))
            .fontSize(11)
            .fontColor('#9AA6A0')
            .width('100%')
        }
      }
      .layoutWeight(1)
      .alignItems(HorizontalAlign.Start)

      Column({ space: 4 }) {
        Text(this.spot.liked ? '♥' : '♡')
          .fontSize(20)
          .fontColor(this.spot.liked ? '#EB765E' : '#9AA6A0')
        Text(String(this.spot.likes))
          .fontSize(12)
          .fontColor('#71807A')
        if (this.showEdit) {
          Text('编辑')
            .fontSize(10)
            .fontColor('#2F6D5A')
            .padding({ left: 6, right: 6, top: 3, bottom: 3 })
            .borderRadius(8)
            .border({ width: 1, color: '#DCE1D9' })
            .onClick(() => {
              this.onEdit(this.spot);
            })
        }
      }
      .width(44)
      .onClick(() => {
        this.onLike(this.spot);
      })
    }
    .width('100%')
    .padding(14)
    .backgroundColor('#FFFDF8')
    .borderRadius(14)
    .border({ width: 1, color: '#DCE1D9' })
    .onClick(() => {
      this.onOpen(this.spot);
    })
  }
}
