/**
 * 登录 / 注册页。
 *
 * 与网页端共用同一套账号体系（POST /api/auth/login、/api/auth/register），
 * 网页注册的账号在 App 上可以直接登录，「我的提交」「私人地图」两端一致。
 */
import { toast } from '../common/utils/CommonUtil';
import { describeError } from '../common/utils/HttpUtil';
import { goBack } from '../common/utils/NavUtil';
import { SessionUser } from '../model/SpotModels';
import { CommunityApi } from '../service/CommunityApi';

@Entry
@Component
struct LoginPage {
  @State registerMode: boolean = false;
  @State username: string = '';
  @State password: string = '';
  @State submitting: boolean = false;
  @State errorText: string = '';

  private async submit(): Promise<void> {
    const name: string = this.username.trim();
    if (name.length < 2 || name.length > 24) {
      this.errorText = '用户名需为 2-24 个字符';
      return;
    }
    if (this.password.length < 8) {
      this.errorText = '密码至少 8 位';
      return;
    }
    this.submitting = true;
    this.errorText = '';
    try {
      const user: SessionUser = this.registerMode
        ? await CommunityApi.register(name, this.password)
        : await CommunityApi.login(name, this.password);
      toast(this.getUIContext(), `欢迎，${user.username}`);
      goBack(this.getUIContext());
    } catch (err) {
      this.errorText = describeError(err);
    }
    this.submitting = false;
  }

  build() {
    Column() {
      // 顶部返回
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
        Text(this.registerMode ? '注册清远地图账号' : '登录清远地图')
          .fontSize(17)
          .fontWeight(FontWeight.Medium)
          .fontColor('#192B2A')
          .layoutWeight(1)
      }
      .width('100%')
      .padding({ left: 8, right: 16, top: 10, bottom: 10 })

      Scroll() {
        Column({ space: 16 }) {
          Column({ space: 8 }) {
            Text('ACCOUNT')
              .fontSize(11)
              .fontColor('#2F6D5A')
              .letterSpacing(2)
            Text(this.registerMode ? '创建一个账号，开始共建地图。' : '登录后与网页端共享同一份数据。')
              .fontSize(20)
              .fontWeight(FontWeight.Bold)
              .fontColor('#192B2A')
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)

          Column({ space: 12 }) {
            Column({ space: 6 }) {
              Text('用户名')
                .fontSize(12)
                .fontColor('#71807A')
                .width('100%')
              TextInput({ text: this.username, placeholder: '2-24 个字符' })
                .height(42)
                .fontSize(14)
                .backgroundColor('#F4F3ED')
                .borderRadius(10)
                .onChange((value: string) => {
                  this.username = value;
                })
            }
            .width('100%')

            Column({ space: 6 }) {
              Text('密码')
                .fontSize(12)
                .fontColor('#71807A')
                .width('100%')
              TextInput({ text: this.password, placeholder: '至少 8 位' })
                .type(InputType.Password)
                .height(42)
                .fontSize(14)
                .backgroundColor('#F4F3ED')
                .borderRadius(10)
                .onChange((value: string) => {
                  this.password = value;
                })
            }
            .width('100%')
          }
          .width('100%')
          .padding(16)
          .backgroundColor('#FFFDF8')
          .borderRadius(16)
          .border({ width: 1, color: '#DCE1D9' })

          if (this.errorText.length > 0) {
            Text(this.errorText)
              .fontSize(13)
              .fontColor('#B33A3A')
              .width('100%')
              .padding(12)
              .backgroundColor('#FDECEC')
              .borderRadius(10)
          }

          Button(this.submitting ? '请稍候…' : (this.registerMode ? '注册并登录' : '登录'))
            .width('100%')
            .height(44)
            .fontSize(15)
            .backgroundColor('#2F6D5A')
            .fontColor('#FFFFFF')
            .enabled(!this.submitting)
            .onClick(() => {
              this.submit();
            })

          Text(this.registerMode ? '已有账号？去登录' : '还没有账号？注册一个')
            .fontSize(13)
            .fontColor('#2F6D5A')
            .width('100%')
            .textAlign(TextAlign.Center)
            .padding(10)
            .onClick(() => {
              this.registerMode = !this.registerMode;
              this.errorText = '';
            })

          Column({ space: 6 }) {
            Text('说明')
              .fontSize(12)
              .fontWeight(FontWeight.Medium)
              .fontColor('#192B2A')
            Text('· 密码由后端使用 PBKDF2 + 随机盐哈希存储，不保存明文')
              .fontSize(11)
              .fontColor('#71807A')
            Text('· 登录 token 保存在本机 Preferences 中，重启应用后保持登录')
              .fontSize(11)
              .fontColor('#71807A')
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
          .padding(14)
          .backgroundColor('#FFFDF8')
          .borderRadius(14)
          .border({ width: 1, color: '#DCE1D9' })
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
