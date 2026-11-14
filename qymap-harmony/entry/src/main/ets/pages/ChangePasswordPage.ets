/**
 * 强制修改密码页。
 *
 * 管理员重置密码后，用户以临时密码 12345 登录时进入本页。
 * 与网页端约定一致：不设置新密码就不能使用任何功能，
 * 因此本页拦截系统返回键且不提供关闭按钮，改密成功才会离开。
 */
import { toast } from '../common/utils/CommonUtil';
import { describeError } from '../common/utils/HttpUtil';
import { goBack } from '../common/utils/NavUtil';
import { CommunityApi } from '../service/CommunityApi';

@Entry
@Component
struct ChangePasswordPage {
  @State newPassword: string = '';
  @State confirmPassword: string = '';
  @State submitting: boolean = false;
  @State errorText: string = '';

  /** 拦截系统返回手势 / 返回键：改密完成前不允许离开本页 */
  onBackPress(): boolean {
    return true;
  }

  private async submit(): Promise<void> {
    const pwd: string = this.newPassword;
    if (pwd.length < 8) {
      this.errorText = '新密码至少 8 位';
      return;
    }
    if (!/[a-zA-Z]/.test(pwd) || !/[0-9]/.test(pwd)) {
      this.errorText = '新密码需同时包含字母和数字';
      return;
    }
    if (pwd !== this.confirmPassword) {
      this.errorText = '两次输入的密码不一致';
      return;
    }
    this.submitting = true;
    this.errorText = '';
    try {
      await CommunityApi.changePassword(pwd);
      toast(this.getUIContext(), '新密码已生效');
      goBack(this.getUIContext());
    } catch (err) {
      this.errorText = describeError(err);
    }
    this.submitting = false;
  }

  build() {
    Column() {
      Column({ space: 8 }) {
        Text('SECURITY')
          .fontSize(11)
          .fontColor('#2F6D5A')
          .letterSpacing(2)
        Text('设置新密码')
          .fontSize(20)
          .fontWeight(FontWeight.Bold)
          .fontColor('#192B2A')
        Text('当前使用的是管理员重置的临时密码，设置新密码后才能继续使用各项功能。')
          .fontSize(13)
          .fontColor('#71807A')
          .lineHeight(20)
      }
      .width('100%')
      .alignItems(HorizontalAlign.Start)

      Scroll() {
        Column({ space: 14 }) {
          Column({ space: 12 }) {
            Column({ space: 6 }) {
              Text('新密码')
                .fontSize(12)
                .fontColor('#71807A')
                .width('100%')
              TextInput({ text: this.newPassword, placeholder: '至少 8 位，需包含字母和数字' })
                .type(InputType.Password)
                .height(42)
                .fontSize(14)
                .backgroundColor('#F4F3ED')
                .borderRadius(10)
                .onChange((value: string) => {
                  this.newPassword = value;
                })
            }
            .width('100%')

            Column({ space: 6 }) {
              Text('确认新密码')
                .fontSize(12)
                .fontColor('#71807A')
                .width('100%')
              TextInput({ text: this.confirmPassword, placeholder: '再次输入新密码' })
                .type(InputType.Password)
                .height(42)
                .fontSize(14)
                .backgroundColor('#F4F3ED')
                .borderRadius(10)
                .onChange((value: string) => {
                  this.confirmPassword = value;
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

          Button(this.submitting ? '请稍候…' : '保存并继续')
            .width('100%')
            .height(44)
            .fontSize(15)
            .backgroundColor('#2F6D5A')
            .fontColor('#FFFFFF')
            .enabled(!this.submitting)
            .onClick(() => {
              this.submit();
            })

          Text('· 改密完成后即可正常使用点赞、提交、收藏等功能\n· 新密码与网页端登录密码相同，两端通用')
            .fontSize(11)
            .fontColor('#71807A')
            .width('100%')
            .lineHeight(18)
        }
        .width('100%')
        .padding(16)
      }
      .layoutWeight(1)
      .scrollBar(BarState.Off)
    }
    .width('100%')
    .height('100%')
    .padding({ top: 30, left: 16, right: 16, bottom: 16 })
    .backgroundColor('#F4F3ED')
  }
}
