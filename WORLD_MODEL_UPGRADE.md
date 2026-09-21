# 六星球模型升级与桌面端验收

项目：`D:\immersive-little-prince-experience`，日期：2026-09-09。

本轮将六颗程序化星球替换为提供的 GLB，保留章节顺序、演绎时间、相机路径和正文。删除底部暂停/继续/单幕回放卡片，保留下滚继续与侧栏章节跳转；从头播放只在终幕完成后出现。三个原本位于上方的星球标题移至下方，避免新模型遮挡人物脸部。只按桌面端验收。

## 资产与减面结果

编号通过贴图与八方向预览对照参考图确定，未按编号顺序直接套用章节。

| 角色 | 原始文件 | 原始三角面 | 最终三角面 | 最终文件 MB |
|---|---|---:|---:|---:|
| 国王 | 1.glb | 1,499,994 | 220,000 | 16.34 |
| 爱慕虚荣者 | 6.glb | 999,310 | 170,724 | 15.69 |
| 酒鬼 | 5.glb | 1,500,000 | 308,898 | 16.95 |
| 商人 | 4.glb | 998,738 | 232,048 | 17.27 |
| 点灯人 | 3.glb | 999,832 | 170,748 | 14.35 |
| 地理学家 | 2.glb | 1,499,732 | 272,102 | 15.62 |

总计 **7,497,606 → 1,374,520 三角面，减少 81.67%**；文件 **492.65 → 96.23 MB，减少 80.47%**。MB 使用十进制。原始文件 SHA-256 全部保持不变。

每个资产是一个融合网格、一个材质，没有骨骼和动画。每个资产三张 4096 图集缩为三张 2048 PNG；共享图集无法直接按人物/地面/装饰各自设置分辨率。重采样会损失细节，PNG 编码和 Meshopt 压缩才是无损阶段。本轮保留原有法线贴图，没有重新烘焙，也未引入 KTX2。

流水线先按 UV/法线属性误差进行几何边折叠，保留上部中央人物区域的原始三角面，再压紧顶点、缩图、执行 Meshopt，并逐字节解码校验。没有用压缩后的文件大小冒充减面。源节点 +90° X 变换与材质绑定保留，未破坏性烘焙旋转。

国王先完成 POC：请求 110k/160k 的候选实际约 162k，帐篷、旗帜、红毯附近出现明显失真，因此选用 220k。120k 请求的窄保护候选未用于视觉验收。其余资产设置 0.001 属性误差上限，达不到建议面数时保留更高面数，优先保护人物、薄杆与道具。原始/优化同光照截图已对照，主要轮廓保持。

## 展示、交互与资源

`src/three/world-models.json` 保存源编号、实测球体中心/半径、目标半径及 yaw。以球体拟合尺寸归一化，避免路灯高度拉低整颗星球尺寸。缩放为 `radius / bodyRadius`，偏移为源节点变换后的负球心。额外 pitch/roll 均为 0。

| 角色 | 相机正面基础 yaw（弧度） | 球体目标半径 |
|---|---:|---:|
| 国王 | 0 | 1.55 |
| 爱慕虚荣者 | 0.55 | 1.50 |
| 酒鬼 | 0 | 1.50 |
| 商人 | 0.20 | 1.60 |
| 点灯人 | 0 | 1.30 |
| 地理学家 | 0 | 1.60 |

模型展示层补偿相机水平视角，让参考展示面朝向相机；没有持续自转暴露背面。八方向源资产贴图投影在 `verification/world-orientation/`，其观察方位不等同于 Three.js 模型旋转的正负号；最终角度以真实 GLB 渲染及网站镜头检查为准。

交互使用独立球形代理，悬停提升局部灯光，不依赖融合网格内部节点名。无骨骼资产无法单独转头或翻纸，本轮没有伪造此类角色动画。

常态仅当前和相邻星球驻留，实测最多 3 个加载完成的模型；窗口边缘为 2 个。`t >= 8.35` 后清空星球模型，背景转场继续保留。请求可中止，过期解析结果立即释放；共享几何/材质/纹理去重释放并关闭 ImageBitmap。模型未到位时只等待故事时间，保留渲染与加载提示；错误显示重试入口。

三张 RGBA 图集含 mipmap 估算 64 MiB/模型。Three.js 的 AO 通道变体可能形成四个 GPU 纹理对象，上限估算约 85.33 MiB/模型，不能将文件 MB 当显存。浏览器测试记录的是 renderer 资源计数，不能等同于精确显存。

## 验收证据与边界

- `verification/world-assets.json`：原始属性、纹理、映射与哈希。
- `verification/world-optimization-report.json`：逐资产顶点、三角面、文件大小、误差、保护范围和预算例外。
- `verification/world-models/independent-validation.json`：独立解析最终文件，索引、数值、节点与材质一致性检查。
- `verification/world-models/browser-report.json`：六星球进入/主要展示/离开共 18 个画面，反向滚动忽略、正向继续、暂停时间冻结、侧栏反复跳转及终幕回放。无浏览器错误，返回星球无黑纹理；重播后星球缓存清空。
- `verification/world-models/all-worlds-contact.jpg`：18 张桌面截图总览，原图为同目录 `角色-enter/main/exit.png`。
- `verification/world-models/production-report.json`：生产页面经实际按钮进入国王演绎，六个 HTTP 资源均为 200，字节与 `public`、`dist` 完全一致。
- `verification/world-models/loading-focus-report.json`：真实延迟请求验证等待提示、时间冻结及加载后自动继续；模拟焦点状态并触发 blur/focus 验证暂停恢复。无头浏览器无法完成系统级标签焦点转移，未将模拟测试宣称为真实窗口验证。
- TypeScript 和生产构建通过。

浏览器使用 Chrome headless + SwiftShader（当前没有 Browser 插件，使用 Playwright）。截图帧使用受控时钟以固定镜头位置，生产冒烟测试使用正常播放。资源驻留已验证，但软件渲染不代表用户独立显卡的 FPS；未宣称达到硬件 60fps，也未据此增加多级 LOD。慢网络首次获取约 14–17 MB 的单个模型仍可能等待。

源 GLB 本身仍与参考图存在差异：爱慕虚荣者镜面是蓝色浮雕状表面，并非真实反射；国王局部面部细节及其他 AI 生成背面瑕疵保留。这里通过展示角度控制可见范围，没有重做原始角色。星球进出屏幕边缘属于原镜头横移过程。

## 重建与启动

在项目目录执行；Python 需安装 numpy、Pillow，当前机器可使用 Codex bundled Python。所有几何处理始终读取 `asset` 原文件，不对已优化 GLB 再减面。

```powershell
python scripts/inspect_world_models.py
node scripts/optimize_world_models.mjs --source=1 --target=220000 --error=0.001 --lockMin=0.82 --lockMax=1 --lockX=0.13
node scripts/optimize_world_models.mjs --source=2 --target=140000 --error=0.001
node scripts/optimize_world_models.mjs --source=3 --target=80000 --error=0.001
node scripts/optimize_world_models.mjs --source=4 --target=140000 --error=0.001
node scripts/optimize_world_models.mjs --source=5 --target=100000 --error=0.001
node scripts/optimize_world_models.mjs --source=6 --target=100000 --error=0.001
python scripts/publish_world_models.py
node scripts/verify_world_models.mjs
npx.cmd tsc --noEmit
npm.cmd run build
npm.cmd run preview -- --host 127.0.0.1 --port 5193
```

最终发布必须包含整个 `dist/models/worlds/`；singlefile 插件不会把 GLB 嵌入 HTML。开发预览使用 `npm.cmd run dev -- --host 127.0.0.1 --port 5192`。
