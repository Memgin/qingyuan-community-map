/**
 * 编辑地点页。
 *
 * 按产品约定：名称/地址/坐标属于「地点事实」，锁定不可修改，
 * 因此编辑不会影响审核状态；仅允许调整分类与配图。
 * 保存后后端会刷新 updated_at，增量同步把变更推给网页端。
 */
import { CategoryInfo, CATEGORIES } from '../common/constants/AppConstants';
import { toast } from '../common/utils/CommonUtil';
import { describeError } from '../common/utils/HttpUtil';
import { goBack, readSpotParam } from '../common/utils/NavUtil';
import { PickedImage, pickOneImage } from '../common/utils/ImageUtil';
import { Session } from '../common/utils/Session';
import { Spot } from '../model/SpotModels';
import { CommunityApi } from '../service/CommunityApi';

@Entry
@Component
struct EditSpotPage {
  @State spot: Spot = new Spot();
  @State category: string = 'scenic';
  /** 新选的配图本地路径，空串表示保留原图 */
  @State newImageUri: string = '';
  @State newImageMeta: string = '';
  @State saving: boolean = false;
  @State message: string = '';
  @State messageOk: boolean = false;
  private picked: PickedImage | null = null;

  aboutToAppear(): void {
    const loaded: Spot = readSpotParam(this.getUIContext());
    if (loaded.id > 0) {
      this.spot = loaded;
      this.category = loaded.category;
    }
  }

  private async chooseImage(): Promise<void> {
    try {
      const image: PickedImage | null = await pickOneImage();
      if (image === null) {
        return;
      }
      this.picked = image;
      this.newImageUri = image.uri;
      this.newImageMeta = `新图：${Math.round(image.size / 1024)} KB · ${image.contentType}`;
    } catch (err) {
      toast(this.getUIContext(), describeError(err));
    }
  }

  private async save(): Promise<void> {
    if (this.saving) {
      return;
    }
    if (!Session.isLoggedIn()) {
      toast(this.getUIContext(), '请先登录');
      return;
    }
    this.saving = true;
    this.message = '';
    try {
      // 换了图先上传（失败则终止，避免只改分类却弄丢原图语义不清晰）
      let imageUrl: string | null = null;
      if (this.picked !== null) {
        imageUrl = await CommunityApi.uploadImage(this.picked.bytes, this.picked.contentType);
      }
      await CommunityApi.updateSpot(this.spot.id, this.category, imageUrl);
      this.messageOk = true;
      this.message = '已保存，变更会自动同步到网页端';
      toast(this.getUIContext(), '保存成功');
      goBack(this.getUIContext());
    } catch (err) {
      this.messageOk = false;
      this.message = describeError(err);
    }
    this.saving = false;
  }

  @Builder
  private fieldLabel(text: string) {
    Text(text)
      .fontSize(12)
      .fontWeight(FontWeight.Medium)
      .fontColor('#4A5A54')
  }

  build() {
    Column() {
      // ---------------- 顶栏 ----------------
      Row({ space: 10 }) {
        Text('‹')
          .fontSize(24)
          .fontColor('#2F6D5A')
          .width(36)
          .height(36)
          .textAlign(TextAlign.Center)
          .onClick(() => {
            goBack(this.getUIContext());
          })
        Text('编辑地点')
          .fontSize(17)
          .fontWeight(FontWeight.Bold)
          .fontColor('#192B2A')
          .layoutWeight(1)
      }
      .width('100%')
      .padding({ left: 12, right: 14, top: 10, bottom: 10 })

      Scroll() {
        Column({ space: 14 }) {
          // ---------------- 锁定的地点信息 ----------------
          Column({ space: 6 }) {
            this.fieldLabel('地点（不可修改）')
            Text(this.spot.name)
              .fontSize(16)
              .fontWeight(FontWeight.Medium)
              .fontColor('#192B2A')
              .width('100%')
            Text(this.spot.address)
              .fontSize(12)
              .fontColor('#71807A')
              .width('100%')
            Text('名称、地址与坐标不可修改，编辑不影响审核状态')
              .fontSize(11)
              .fontColor('#9AA6A0')
              .width('100%')
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
          .padding(14)
          .backgroundColor('#F4F3ED')
          .borderRadius(12)

          // ---------------- 分类 ----------------
          Column({ space: 8 }) {
            this.fieldLabel('地点分类')
            Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.Start }) {
              ForEach(CATEGORIES.filter((item: CategoryInfo) => item.key !== 'all'), (item: CategoryInfo) => {
                Text(`${item.icon} ${item.label}`)
                  .fontSize(12)
                  .fontColor(this.category === item.key ? '#FFFFFF' : '#4A5A54')
                  .backgroundColor(this.category === item.key ? item.color : '#F4F3ED')
                  .padding({ left: 12, right: 12, top: 7, bottom: 7 })
                  .borderRadius(16)
                  .margin({ right: 8, bottom: 8 })
                  .onClick(() => {
                    this.category = item.key;
                  })
              }, (item: CategoryInfo) => item.key)
            }
            .width('100%')
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)

          // ---------------- 配图 ----------------
          Column({ space: 8 }) {
            this.fieldLabel('配图')
            if (this.newImageUri.length > 0) {
              Image(this.newImageUri)
                .height(150)
                .width('100%')
                .borderRadius(12)
                .objectFit(ImageFit.Cover)
            } else if (this.spot.imageUrl.length > 0) {
              Image(this.spot.imageUrl)
                .height(150)
                .width('100%')
                .borderRadius(12)
                .objectFit(ImageFit.Cover)
            }
            Button(this.spot.imageUrl.length > 0 || this.newImageUri.length > 0 ? '更换配图' : '上传配图')
              .fontSize(13)
              .height(38)
              .backgroundColor('#FFFDF8')
              .fontColor('#2F6D5A')
              .border({ width: 1, color: '#2F6D5A' })
              .onClick(() => {
                this.chooseImage();
              })
            if (this.newImageMeta.length > 0) {
              Text(this.newImageMeta)
                .fontSize(11)
                .fontColor('#9AA6A0')
            }
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)

          if (this.message.length > 0) {
            Text(this.message)
              .fontSize(12)
              .fontColor(this.messageOk ? '#2F6D5A' : '#B33A3A')
              .width('100%')
          }

          Button(this.saving ? '保存中…' : '保存修改')
            .fontSize(15)
            .height(46)
            .width('100%')
            .backgroundColor('#2F6D5A')
            .fontColor('#FFFFFF')
            .enabled(!this.saving)
            .onClick(() => {
              this.save();
            })
        }
        .width('100%')
        .padding(16)
      }
      .layoutWeight(1)
      .width('100%')
      .scrollBar(BarState.Off)
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F4F3ED')
  }
}
