# 清远社区共享地图 · HarmonyOS 客户端

把已上线的网页项目 [qingyuan-community-map](https://github.com/Memgin/qingyuan-community-map)（在线地址 <https://qymap.pages.dev>）
改造为 **HarmonyOS（ArkTS / ArkUI，Stage 模型）原生应用**。

后端**零改动**直接复用：原生应用发出的 HTTP 请求不受浏览器同源策略限制，
因此网页端、鸿蒙端、管理后台三端共用同一个 Cloudflare Pages Functions 后端、
同一个 D1 数据库、同一个 R2 图片桶、同一套高德核验与智谱 AI 能力。

```
┌──────────────┐   ┌─────────────────┐   ┌──────────────┐
│   网页端      │   │  HarmonyOS App  │   │   管理后台    │
│  index.html  │   │  ArkTS 客户端 ★  │   │  admin.html  │
└──────┬───────┘   └────────┬────────┘   └──────┬───────┘
       └────────────────────┼───────────────────┘
                            │ HTTPS / JSON
              ┌─────────────▼──────────────┐
              │ Cloudflare Pages Functions │
              │ D1 点位/用户 · R2 图片       │
              │ 高德 REST 核验 · 智谱 AI     │
              └────────────────────────────┘
```

---

## 一、运行环境

| 项 | 值 |
| --- | --- |
| DevEco Studio | 26.0.0.821（build 261.23567.138.36.2600821） |
| SDK | HarmonyOS 26.0.0（apiVersion 26），`targetSdkVersion 26.0.0` |
| 最低兼容版本 | `compatibleSdkVersion 6.1.1(24)` |
| 模型 | Stage 模型 + ArkTS + ArkUI 声明式 UI |
| 包名 | `com.qingyuan.communitymap` |

---

## 二、快速开始

### 1. 用 DevEco Studio 打开

DevEco Studio → **File → Open** → 选择本目录（`qingyuan-community-map`）→ 等待 Sync 完成。

### 2. 配置签名（首次必须）

`build-profile.json5` 里的 `signingConfigs` 目前是空的。首次运行前：

**File → Project Structure → Signing Configs → 勾选 "Automatically generate signature" → Sign In**

DevEco 会自动生成调试证书并回填 `signingConfigs`，之后即可直接 Run。

### 3. 运行

- **模拟器 / 真机**：点击 ▶ Run 'entry'。
- **Previewer 预览**：可直接预览 UI，但地图页会自动降级为社区示意图（见第五节）。

### 4. 命令行构建（可选）

```powershell
# 在项目根目录
pwsh -File build.ps1
# 产物：entry/build/default/outputs/default/entry-default-unsigned.hap
```

`build.ps1` 已把 DevEco 自带的 JBR 放在 `PATH` 最前面。
**注意**：如果系统里装了 Oracle JRE/JDK，它的 `java.exe` 会通过 `javapath` 抢先命中，
导致打包工具 `app_packing_tool.jar` 以 `0xC0000005`（访问冲突）崩溃。
脚本里 `$env:Path = "$env:JAVA_HOME\bin;..."` 这一行就是为此存在的，请勿删除。

### 5. 构建验证结果

本工程已在上述环境下完成 **clean build** 验证：

```
> hvigor Finished :entry:default@CompileArkTS...
> hvigor Finished :entry:default@PackageHap...
> hvigor BUILD SUCCESSFUL
产物：entry/build/default/outputs/default/entry-default-unsigned.hap（725 KB）
```

`0 error`。剩余 15 条为**告警**，均为使用这些 API 时不可避免的提示，不影响运行：

| 条数 | 告警 | 说明 |
| --- | --- | --- |
| 12 | `Function may throw exceptions. Special handling is required.` | `fileIo` / `JSON.parse` / `startAbility` 等可能抛异常的调用点提示。代码已在调用层用 `try/catch` 兜住并转成中文提示，属于 ArkTS 静态检查的保守提示。 |
| 3 | `The system capacity of this api 'geoLocationManager' is not supported on all devices` | Location Kit 并非所有设备都具备。`LocationUtil` 已用 `canIUse('SystemCapability.Location.Location.Core')` 做运行时能力判断，不支持时给出中文提示并保留清远市中心。 |

> 未出现任何 `deprecated` 告警：路由与轻提示均通过 `UIContext.getRouter()` /
> `getPromptAction()` 调用，未使用 API 18 起废弃的 `@ohos.router` / `@ohos.promptAction` 全局函数。

---

## 三、目录结构

```
qingyuan-community-map/
├── AppScope/app.json5                   应用级配置（包名、图标、名称）
├── build-profile.json5                  产品与签名配置
├── build.ps1                            命令行构建脚本
├── docs/                                网页端原始文档与可行性评估（参考）
└── entry/src/main/
    ├── module.json5                     模块配置、权限声明、页面清单
    ├── resources/
    │   ├── base/element/color.json       主题色（与网页端 style.css 调色板一致）
    │   ├── base/profile/main_pages.json  路由页面清单
    │   └── rawfile/spots_seed.json       15 条真实点位兜底数据
    └── ets/
        ├── entryability/EntryAbility.ets 入口：初始化存储、补发离线队列、加载首页
        ├── common/
        │   ├── constants/AppConstants.ets 接口地址、分类定义、存储键名
        │   └── utils/                     HttpUtil / PreferenceUtil / Session /
        │                                  LocationUtil / ImageUtil / NavUtil / CommonUtil
        ├── model/SpotModels.ets           DTO 与归一化模型
        ├── service/
        │   ├── CommunityApi.ets           全部后端接口封装
        │   ├── LocalStore.ets             关系型数据库：点位缓存 + 离线队列 + 兜底数据
        │   └── SpotRepository.ets         三级数据来源编排（网络 → 缓存 → 内置快照）
        ├── view/
        │   ├── MapTab.ets                 地图页（Map Kit + 示意图双实现）
        │   ├── CommunityAtlas.ets         Canvas 社区地图示意图
        │   ├── DiscoverTab.ets            列表页（分页 / 搜索 / 分类 / 点赞）
        │   ├── GuideTab.ets               AI 智能推荐页
        │   ├── MineTab.ets                我的（账号 / 我的提交 / 私人地图 / 离线同步）
        │   └── SpotCard.ets               列表卡片（复用组件）
        └── pages/
            ├── Index.ets                  主页面（底部四 Tab）
            ├── SpotDetailPage.ets         点位详情
            ├── SubmitPage.ets             提交点位（表单 + 选图上传 + 坐标）
            ├── LoginPage.ets              登录 / 注册
            └── PrivateMapPage.ets         私人地图详情
```

---

## 四、功能清单与接口对接

| 功能 | 鸿蒙端实现 | 后端接口 |
| --- | --- | --- |
| 地图浏览（图钉 / 点击弹窗 / 一键导航） | `MapTab` + `CommunityAtlas` | `GET /api/spots?fields=map&limit=500` |
| 列表分页 | `DiscoverTab`，后端真分页 | `GET /api/spots?page=&limit=` |
| 关键词搜索（250ms 防抖） | `DiscoverTab.scheduleSearch()` | `GET /api/spots?q=` |
| 分类筛选（景点/美食/商圈/医疗/学校/车站） | 分类 chips | `GET /api/spots?category=` |
| 点赞（登录按账号、未登录按设备串） | `SpotCard` + `CommunityApi.likeSpot` | `POST /api/spots/:id/like` |
| 举报 | 详情页内联表单 | `POST /api/spots/:id/report` |
| 提交点位（高德自动核验） | `SubmitPage` | `POST /api/spots` |
| 图片选择与上传（≤2MB） | `ImageUtil` + `PhotoViewPicker` | `POST /api/uploads` |
| 登录 / 注册 / 退出 / 启动鉴权 | `LoginPage` + `Session` | `/api/auth/*` |
| 我的提交（含审核状态） | `MineTab` | `GET /api/my-spots` |
| 私人地图（创建 / 收藏 / 查看） | `MineTab` + `PrivateMapPage` | `/api/maps`、`/api/maps/:id/spots` |
| AI 智能推荐（文案 + 点位联动） | `GuideTab` | `POST /api/recommend` |
| 增量同步提示 | `SpotRepository.countUpdatesSince` | `GET /api/spots?since=` |
| 离线提交幂等 | `LocalStore` outbox + `client_token` | `POST /api/spots`（`client_token`） |
| 离线缓存兜底 | RelationalStore + rawfile 快照 | — |
| 定位与距离计算 | `LocationUtil`（Location Kit） | — |

---

## 五、地图实现说明（**重要**）

华为 Map Kit 需要先在 **AppGallery Connect** 开通「地图服务」，并把 `client_id`
写进 `module.json5` 的 metadata，同时绑定签名证书指纹。未配置时地图容器是空白的。

因此地图页做了**双实现 + 自动降级**：

1. **原生地图（Map Kit）**：`MapComponent` + `addMarker` + `animateCamera`
   + `markerClick` 事件，支持手势缩放、真实地图瓦片。
2. **社区示意图（`CommunityAtlas`）**：用 ArkUI `Canvas` 按真实经纬度等比投影绘制，
   **不需要任何账号配置**，启动即可交互（点击图钉弹出详情卡）。

启动时先尝试原生地图；若初始化回调报错或 5 秒内没有回调，自动降级到示意图并提示。
右上角第二个按钮可在两种地图之间手动切换。

**启用原生地图的方法**：打开 `entry/src/main/module.json5`，取消注释这段并填入你的 `client_id`：

```json5
"metadata": [
  { "name": "client_id", "value": "你的 AGC client_id" }
]
```

---

## 六、技术要点

| 维度 | 用到的能力 |
| --- | --- |
| UI 布局 | `Tabs` / `List` / `Scroll` / `Flex` 换行 / `Stack` 浮层 / `@Builder` 抽取 / 自定义卡片组件 |
| 多页面与路由 | 5 个 `@Entry` 页面 + `UIContext.getRouter()` + 参数序列化传递（`NavUtil`） |
| 状态管理 | `@State` / `@Prop` / `@Watch` / `@StorageLink` 跨页面共享登录态与离线状态 |
| 网络请求 | `@kit.NetworkKit` `http`，统一超时、统一把非 2xx 转成带中文文案的 `ApiError` |
| 数据持久化 | `Preferences`（token / 身份串 / 同步时间）+ `RelationalStore`（点位缓存 + 离线队列） |
| 文件与图片 | `photoAccessHelper.PhotoViewPicker` 选图 + `fileIo` 二进制读取 + 原始二进制上传 |
| 地图能力 | `@kit.MapKit` MapComponent / Marker / CameraUpdate；Canvas 自绘示意图兜底 |
| 定位 | `@kit.LocationKit` `geoLocationManager` + `abilityAccessCtrl` 动态权限申请 |
| 系统能力 | `startAbility` 拉起浏览器做导航跳转 |
| 工程规范 | 分层架构（constants / model / service / view / pages）、全中文注释、错误与空状态处理 |

**答辩可强调的两个差异化亮点**：

1. **AI 智能推荐**——大模型基于真实点位生成中文推荐，并把文案里提到的点位
   用 `spotIds` 回传，实现「文字 + 地图点位」联动。
2. **高德地址自动核验**——提交点位时后端调用高德 REST 检索 POI，
   命中即自动上线并用高德坐标校正用户随手点的位置，未命中才转人工审核。

---

## 七、已知限制

- **未配置 `client_id` 时不显示华为地图瓦片**，自动降级为社区示意图（见第五节）。
- `@ohos.router` 已在 API 18 起标记废弃（本项目通过 `UIContext.getRouter()` 调用，
  未直接使用全局废弃函数）；更彻底的做法是迁移到 `Navigation` + `NavPathStack`。
- 演示环境需能访问 `qymap.pages.dev`。若现场网络不稳，首页会展示
  RelationalStore 缓存或 15 条内置点位数据，不会白屏。
- 私人地图暂不支持删除点位（后端提供了接口，鸿蒙端未接入交互）。
- 管理员审核功能仍在网页后台完成（`admin.html`），鸿蒙端未做管理入口。

---

## 八、参考文档

- [`docs/web-project-README.md`](docs/web-project-README.md) —— 网页端原始说明与 API 清单
- [`docs/鸿蒙期末项目可行性评估.md`](docs/鸿蒙期末项目可行性评估.md) —— 改造可行性评估与任务拆解
- [`docs/清远社区共享地图项目-完整实施规划文档.md`](docs/清远社区共享地图项目-完整实施规划文档.md) —— 完整实施规划
