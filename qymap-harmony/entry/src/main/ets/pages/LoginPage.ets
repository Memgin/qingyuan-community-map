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
import { Session } from '../common/utils/Session';
import { CommunityApi } from '../service/CommunityApi';

@Entry
@Component
struct LoginPage {
  @State registerMode: boolean = false;
  @State forgotMode: boolean = false;
  @State username: string = '';
  @State password: string = '';
  @State forgotNote: string = '';
  @State forgotMessage: string = '';
  @State submitting: boolean = false;
  @State errorText: string = '';

  private async submit(): Promise<void> {
    const name: string = this.username.trim();
    if (name.length < 2 || name.length > 24) {
      this.errorText = '用户名需为 2-24 个字符';
      return;
    }
    // 密码长度策略只在注册时生效；登录不限制（临时密码 12345 等合法密码可能较短）
    if (this.registerMode && this.password.length < 8) {
      this.errorText = '密码至少 8 位，需包含字母和数字';
      return;
    }
    this.submitting = true;
    this.errorText = '';
    try {
      const user: SessionUser = this.registerMode
        ? await CommunityApi.register(name, this.password)
        : await CommunityApi.login(name, this.password);
      // 管理员重置过的临时密码：登录成功后强制进入改密页（替换登录页，不可返回）
      if (Session.isMustChangePassword()) {
        this.getUIContext().getRouter().replaceUrl({ url: 'pages/ChangePasswordPage' });
        return;
      }
      toast(this.getUIContext(), `欢迎，${user.username}`);
      goBack(this.getUIContext());
    } catch (err) {
      this.errorText = describeError(err);
    }
    this.submitting = false;
  }

  /** 提交找回密码申请（与网页端同一接口，审批后临时密码 12345 经推送下发） */
  private async submitForgot(): Promise<void> {
    const name: string = this.username.trim();
    if (name.length < 2) {
      this.forgotMessage = '请填写正确的用户名';
      return;
    }
    this.submitting = true;
    this.forgotMessage = '提交中……';
    try {
      const reply: string = await CommunityApi.requestPasswordReset(name, this.forgotNote.trim());
      this.forgotMessage = reply;
    } catch (err) {
      this.forgotMessage = describeError(err);
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
        Text(this.forgotMode ? '申请重置密码' : (this.registerMode ? '注册清远地图账号' : '登录清远地图'))
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
            Text(this.forgotMode ? '提交后等待管理员审核，通过后临时密码会推送到你的设备。' : (this.registerMode ? '创建一个账号，开始共建地图。' : '登录后与网页端共享同一份数据。'))
              .fontSize(20)
              .fontWeight(FontWeight.Bold)
              .fontColor('#192B2A')
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)

          if (!this.forgotMode) {
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

          Text('忘记密码？')
            .fontSize(13)
            .fontColor('#2F6D5A')
            .width('100%')
            .textAlign(TextAlign.Center)
            .padding(6)
            .onClick(() => {
              this.forgotMode = true;
              this.errorText = '';
              this.forgotMessage = '';
            })

          } else {
          Column({ space: 12 }) {
            Column({ space: 6 }) {
              Text('你的用户名')
                .fontSize(12)
                .fontColor('#71807A')
                .width('100%')
              TextInput({ text: this.username, placeholder: '要找回的账号用户名' })
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
              Text('补充说明（可选）')
                .fontSize(12)
                .fontColor('#71807A')
                .width('100%')
              TextInput({ text: this.forgotNote, placeholder: '如注册时间、常用地点，便于管理员确认身份' })
                .height(42)
                .fontSize(14)
                .backgroundColor('#F4F3ED')
                .borderRadius(10)
                .onChange((value: string) => {
                  this.forgotNote = value;
                })
            }
            .width('100%')
          }
          .width('100%')
          .padding(16)
          .backgroundColor('#FFFDF8')
          .borderRadius(16)
          .border({ width: 1, color: '#DCE1D9' })

          if (this.forgotMessage.length > 0) {
            Text(this.forgotMessage)
              .fontSize(13)
              .fontColor('#2F6D5A')
              .width('100%')
              .padding(12)
              .backgroundColor('#EAF3EE')
              .borderRadius(10)
          }

          Button(this.submitting ? '提交中……' : '提交申请')
            .width('100%')
            .height(44)
            .fontSize(15)
            .backgroundColor('#2F6D5A')
            .fontColor('#FFFFFF')
            .enabled(!this.submitting)
            .onClick(() => {
              this.submitForgot();
            })

          Text('← 返回登录')
            .fontSize(13)
            .fontColor('#2F6D5A')
            .width('100%')
            .textAlign(TextAlign.Center)
            .padding(10)
            .onClick(() => {
              this.forgotMode = false;
              this.forgotMessage = '';
              this.errorText = '';
            })

          Text('审核通过后你的临时密码为 12345，会推送到你之前登录过的设备；用它登录后系统会要求你立即设置新密码。')
            .fontSize(11)
            .fontColor('#71807A')
            .width('100%')
            .lineHeight(18)
          }

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
