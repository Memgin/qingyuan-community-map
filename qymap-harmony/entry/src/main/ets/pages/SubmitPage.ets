/**
 * 提交点位页。
 *
 * 完整闭环：填表 → 选图上传（POST /api/uploads）→ 提交点位（POST /api/spots）。
 * 提交后由后端调用高德接口自动核验地址：命中 POI 立即上线（approved），
 * 未命中则转入人工审核（pending）。
 * 断网时整条提交进入离线队列，联网后自动重发，client_token 保证不会重复写入。
 */
import { common } from '@kit.AbilityKit';
import { CategoryInfo, CATEGORIES, SPOT_LAT_MAX, SPOT_LAT_MIN, SPOT_LNG_MAX, SPOT_LNG_MIN, MAP_CENTER_LAT, MAP_CENTER_LNG, categoryColor } from '../common/constants/AppConstants';
import { toast } from '../common/utils/CommonUtil';
import { describeError } from '../common/utils/HttpUtil';
import { goBack, openLogin } from '../common/utils/NavUtil';
import { locateOnce } from '../common/utils/LocationUtil';
import { Session } from '../common/utils/Session';
import { PickedImage, pickOneImage } from '../common/utils/ImageUtil';
import { Spot, SubmitSpotPayload } from '../model/SpotModels';
import { CommunityApi } from '../service/CommunityApi';
import { SpotRepository, SubmitOutcome } from '../service/SpotRepository';
import { CommunityAtlas } from '../view/CommunityAtlas';

@Entry
@Component
struct SubmitPage {
  @State name: string = '';
  @State address: string = '';
  @State category: string = 'scenic';
  @State description: string = '';
  @State lat: number = MAP_CENTER_LAT;
  @State lng: number = MAP_CENTER_LNG;
  @State imageUri: string = '';
  @State imageSizeText: string = '';
  @State locating: boolean = false;
  @State submitting: boolean = false;
  @State uploading: boolean = false;
  @State message: string = '';
  @State messageOk: boolean = false;

  private picked: PickedImage | null = null;

  private async chooseImage(): Promise<void> {
    try {
      const image: PickedImage | null = await pickOneImage();
      if (image === null) {
        return;
      }
      this.picked = image;
      this.imageUri = image.uri;
      this.imageSizeText = `${Math.round(image.size / 1024)} KB · ${image.contentType}`;
    } catch (err) {
      toast(this.getUIContext(), describeError(err));
    }
  }

  private async useLocation(): Promise<void> {
    this.locating = true;
    const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
    const geo = await locateOnce(context);
    this.locating = false;
    if (geo.ok) {
      this.lat = geo.lat;
      this.lng = geo.lng;
    }
    toast(this.getUIContext(), geo.message);
  }

  private validate(): string {
    const name: string = this.name.trim();
    if (name.length < 2 || name.length > 40) {
      return '地点名称长度应为 2-40 个字符';
    }
    const address: string = this.address.trim();
    if (address.length < 2 || address.length > 120) {
      return '请填写有效的地址（2-120 字）';
    }
    const description: string = this.description.trim();
    if (description.length < 2 || description.length > 120) {
      return '一句话介绍长度应为 2-120 个字符';
    }
    if (this.lat < SPOT_LAT_MIN || this.lat > SPOT_LAT_MAX ||
      this.lng < SPOT_LNG_MIN || this.lng > SPOT_LNG_MAX) {
      return '坐标不在清远范围内，请重新选择位置';
    }
    return '';
  }

  private async submit(): Promise<void> {
    const problem: string = this.validate();
    if (problem.length > 0) {
      this.messageOk = false;
      this.message = problem;
      return;
    }
    if (!Session.isLoggedIn()) {
      this.messageOk = false;
      this.message = '请先登录后再提交地点';
      openLogin(this.getUIContext());
      return;
    }
    this.submitting = true;
    this.message = '';

    // 1) 有配图先上传，失败不阻塞提交（图片可后续补）
    let imageUrl: string = '';
    if (this.picked !== null) {
      this.uploading = true;
      try {
        imageUrl = await CommunityApi.uploadImage(this.picked.bytes, this.picked.contentType);
      } catch (err) {
        toast(this.getUIContext(), `图片上传失败，将继续提交文字信息：${describeError(err)}`);
      }
      this.uploading = false;
    }

    // 2) 提交点位（网络异常时进入离线队列）
    const payload: SubmitSpotPayload = {
      name: this.name.trim(),
      address: this.address.trim(),
      category: this.category,
      description: this.description.trim(),
      lat: this.lat,
      lng: this.lng,
      image_url: imageUrl,
      client_token: SpotRepository.newClientToken()
    };
    try {
      const outcome: SubmitOutcome = await SpotRepository.submit(payload);
      this.messageOk = true;
      if (outcome.queued) {
        this.message = outcome.message;
      } else {
        const tail: string = outcome.verified
          ? '高德核验通过，已自动上线。'
          : '已提交，等待人工审核。';
        this.message = `${outcome.message}（${tail}）`;
      }
      this.clearForm();
    } catch (err) {
      this.messageOk = false;
      this.message = describeError(err);
    }
    this.submitting = false;
  }

  private clearForm(): void {
    this.name = '';
    this.address = '';
    this.description = '';
    this.imageUri = '';
    this.imageSizeText = '';
    this.picked = null;
    this.lat = MAP_CENTER_LAT;
    this.lng = MAP_CENTER_LNG;
  }

  /** 预览用：把当前坐标包成一个点位，交给示意图渲染 */
  private preview(): Spot[] {
    const spot = new Spot();
    spot.id = -1;
    spot.name = this.name.length > 0 ? this.name : '新点位';
    spot.category = this.category;
    spot.lat = this.lat;
    spot.lng = this.lng;
    return [spot];
  }

  @Builder
  fieldLabel(text: string) {
    Text(text)
      .fontSize(12)
      .fontColor('#71807A')
      .width('100%')
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
        Text('分享一个清远好地方')
          .fontSize(17)
          .fontWeight(FontWeight.Medium)
          .fontColor('#192B2A')
          .layoutWeight(1)
      }
      .width('100%')
      .padding({ left: 8, right: 12, top: 10, bottom: 10 })

      Scroll() {
        Column({ space: 14 }) {
          Column({ space: 6 }) {
            Text('NEW PLACE')
              .fontSize(11)
              .fontColor('#2F6D5A')
              .letterSpacing(2)
            Text('提交后会先由后端调用高德接口核验地址，命中即自动上线。')
              .fontSize(13)
              .fontColor('#71807A')
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)

          // ---------------- 表单 ----------------
          Column({ space: 14 }) {
            Column({ space: 6 }) {
              this.fieldLabel('地点名称')
              TextInput({ text: this.name, placeholder: '例如：北江边的日落位' })
                .height(42)
                .fontSize(14)
                .backgroundColor('#F4F3ED')
                .borderRadius(10)
                .onChange((value: string) => {
                  this.name = value;
                })
            }
            .width('100%')

            Column({ space: 6 }) {
              this.fieldLabel('地址或地标名')
              TextInput({ text: this.address, placeholder: '例如：清远站、飞来湖公园' })
                .height(42)
                .fontSize(14)
                .backgroundColor('#F4F3ED')
                .borderRadius(10)
                .onChange((value: string) => {
                  this.address = value;
                })
            }
            .width('100%')

            Column({ space: 6 }) {
              this.fieldLabel('地点分类')
              Flex({ wrap: FlexWrap.Wrap }) {
                ForEach(CATEGORIES.slice(1), (item: CategoryInfo) => {
                  Text(`${item.icon} ${item.label}`)
                    .fontSize(13)
                    .fontColor(this.category === item.key ? '#FFFFFF' : '#192B2A')
                    .padding({ left: 12, right: 12, top: 7, bottom: 7 })
                    .margin({ right: 8, bottom: 8 })
                    .backgroundColor(this.category === item.key ? categoryColor(item.key) : '#F4F3ED')
                    .borderRadius(16)
                    .onClick(() => {
                      this.category = item.key;
                    })
                }, (item: CategoryInfo) => item.key)
              }
              .width('100%')
            }
            .width('100%')

            Column({ space: 6 }) {
              this.fieldLabel('一句话介绍')
              TextArea({ text: this.description, placeholder: '说说这里为什么值得来（2-120 字）' })
                .height(76)
                .fontSize(14)
                .backgroundColor('#F4F3ED')
                .borderRadius(10)
                .onChange((value: string) => {
                  this.description = value;
                })
            }
            .width('100%')

            Column({ space: 6 }) {
              this.fieldLabel('地点图片（可选，最大 2MB，JPG / PNG / WebP）')
              Row({ space: 10 }) {
                Button(this.imageUri.length > 0 ? '重新选择图片' : '选择图片')
                  .fontSize(13)
                  .height(38)
                  .backgroundColor('#FFFDF8')
                  .fontColor('#2F6D5A')
                  .border({ width: 1, color: '#2F6D5A' })
                  .onClick(() => {
                    this.chooseImage();
                  })
                if (this.imageUri.length > 0) {
                  Text(this.imageSizeText)
                    .fontSize(12)
                    .fontColor('#71807A')
                    .layoutWeight(1)
                }
              }
              .width('100%')

              if (this.imageUri.length > 0) {
                Image(this.imageUri)
                  .width('100%')
                  .height(140)
                  .objectFit(ImageFit.Cover)
                  .borderRadius(12)
              }
            }
            .width('100%')
            .alignItems(HorizontalAlign.Start)
          }
          .width('100%')
          .padding(16)
          .backgroundColor('#FFFDF8')
          .borderRadius(16)
          .border({ width: 1, color: '#DCE1D9' })

          // ---------------- 坐标 ----------------
          Column({ space: 10 }) {
            Row({ space: 10 }) {
              Text('坐标位置')
                .fontSize(13)
                .fontWeight(FontWeight.Medium)
                .fontColor('#192B2A')
                .layoutWeight(1)
              Button(this.locating ? '定位中…' : '⌖ 使用我的位置')
                .fontSize(12)
                .height(34)
                .backgroundColor('#2F6D5A')
                .fontColor('#FFFFFF')
                .enabled(!this.locating)
                .onClick(() => {
                  this.useLocation();
                })
            }
            .width('100%')

            Row({ space: 10 }) {
              TextInput({ text: this.lat.toFixed(6), placeholder: '纬度' })
                .type(InputType.NUMBER_DECIMAL)
                .height(38)
                .fontSize(13)
                .layoutWeight(1)
                .backgroundColor('#F4F3ED')
                .borderRadius(10)
                .onChange((value: string) => {
                  const parsed: number = Number.parseFloat(value);
                  if (!Number.isNaN(parsed)) {
                    this.lat = parsed;
                  }
                })
              TextInput({ text: this.lng.toFixed(6), placeholder: '经度' })
                .type(InputType.NUMBER_DECIMAL)
                .height(38)
                .fontSize(13)
                .layoutWeight(1)
                .backgroundColor('#F4F3ED')
                .borderRadius(10)
                .onChange((value: string) => {
                  const parsed: number = Number.parseFloat(value);
                  if (!Number.isNaN(parsed)) {
                    this.lng = parsed;
                  }
                })
            }
            .width('100%')

            Text('核验通过时后端会用高德返回的坐标自动校正位置，这里不需要非常精确。')
              .fontSize(11)
              .fontColor('#9AA6A0')
              .width('100%')

            Column() {
              CommunityAtlas({
                spots: this.preview(),
                selectedId: -1,
                onPick: (spot: Spot) => {
                  this.lat = spot.lat;
                  this.lng = spot.lng;
                }
              })
            }
            .width('100%')
            .height(150)
            .borderRadius(12)
            .clip(true)
            .border({ width: 1, color: '#DCE1D9' })
          }
          .width('100%')
          .padding(16)
          .backgroundColor('#FFFDF8')
          .borderRadius(16)
          .border({ width: 1, color: '#DCE1D9' })

          // ---------------- 提交 ----------------
          if (this.message.length > 0) {
            Text(this.message)
              .fontSize(13)
              .fontColor(this.messageOk ? '#2F6D5A' : '#B33A3A')
              .width('100%')
              .padding(12)
              .backgroundColor(this.messageOk ? '#E7F1EC' : '#FDECEC')
              .borderRadius(12)
          }

          Button(this.submitting
            ? (this.uploading ? '正在上传图片…' : '正在提交…')
            : '提交，加入社区地图 →')
            .width('100%')
            .height(46)
            .fontSize(15)
            .backgroundColor('#2F6D5A')
            .fontColor('#FFFFFF')
            .enabled(!this.submitting)
            .onClick(() => {
              this.submit();
            })

          Text('提交内容会与网页端共享：在网页管理后台也能看到并审核这条点位。')
            .fontSize(11)
            .fontColor('#9AA6A0')
            .width('100%')
            .textAlign(TextAlign.Center)
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
