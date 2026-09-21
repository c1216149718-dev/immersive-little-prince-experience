# 3D 模型与动画改动记录

项目：`D:\immersive-little-prince-experience`，2026-09-06。

## 原有架构与改动边界

React / TypeScript / Vite 负责页面，React Three Fiber / Three.js 负责 3D。`state.ts` 的 `world` 保存逐帧状态，Zustand `useUI` 保存界面状态；`Experience.tsx` 的 Director 按原时间轴装卸场景。B612Scene 继续控制球面移动、交互和相机，FoxScene 继续控制鼠标速度驱动的信任与接近行为。

本次在模型显示层接入 GLB、骨骼及动画，保留页面、章节、滚动、相机和 UI 架构。B612Scene 仅调整资产锚点、单火山触发点和显示层贴地参数。FoxScene 另修复了原麦田 shader 的局部变量 `im` 与 Three.js 内建变量重名导致的编译错误。

## 资产

`asset` 中的原始文件未修改。网页加载 `public/models` 中的派生文件。

| 原文件名 | 网页模型 | 处理 |
| --- | --- | --- |
| 0d3379beee9498f73409876d9d0d20a3.glb | b612.glb | 烘焙旋转、拟合球心、统一尺度；内含椅子、火山、植物、玫瑰；椅子在原连通网格中缩小 |
| b4c22085622af932fb40a7f04e7f6efd.glb | prince.glb | 脚底基点，身高 0.72，朝 -Z，22 骨骼，Idle / 原地 Walk |
| 8a616feea09bf049d95a710b077d686c.glb | fox.glb | 脚底基点，身高 0.88，朝 +Z，23 骨骼，Idle / 原地 Walk |
| b81e1afca37e217e5740f75dcb406106.glb | rose.glb | 单独玫瑰章节，保留源纹理及花朵外形 |

贴图缩至最大 2048，统一哑光材质参数。几何使用 EXT_meshopt_compression 无损压缩；压缩前后解码数据逐字节一致。四个网页 GLB 共 64,522,080 字节，比未压缩派生文件减少 46.04%。原始高面数拓扑保留，因此首次加载与低性能设备渲染仍有成本。

## 模型接口

- `ModelAsset.tsx`：按 BASE_URL 加载，SkeletonUtils.clone 为每个角色保留独立骨架。
- `Prince.tsx`：外层 Root 仍由原控制器驱动，PrinceVisualRoot 内部承载模型、Mixer、姿态及地表高度补偿。步行周期距离 0.40，播放速度与有符号移动速度同步；脚底采样修正仅影响视觉骨架。Sit / Look / Interact 通过骨骼叠加接回原交互。
- `secondaryMotion.ts`：世界速度转换到角色局部坐标；4 段围巾以弹簧阻尼响应前后、侧向、加减速与转向。实际 GLB 围巾贴在胸前，因此向身体方向的摆幅受限。
- `RiggedFox.tsx`：接原 FoxState，头部跟随、耳朵响应、5 段尾巴摆动、接近/后退步态、坐姿及脚底修正。
- `Planet.tsx`：理想导航半径固定 2.4，法线始终径向。`ground-offset.json` 为离线低频地表高度表，仅驱动 PrinceVisualRoot 的局部 Y 偏移；不会以视觉网格或 Raycast Normal 控制行走。
- `RoseVisual.tsx`：成品 GLB 花朵呼吸与悬停效果；原花瓣离场及章节转换仍由 RoseScene 管理。

## 复现

安装依赖后：

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5186 --strictPort
npx.cmd tsc --noEmit
npm.cmd run build
```

生产发布需要上传整个 `dist`，包括 `dist/models`；不能只上传 index.html。

需要重新加工资产时，Python 需 numpy、Pillow：

```powershell
python scripts/prepare_models.py
python scripts/prepare_ground.py
node verification/rig-audit.mjs
node scripts/optimize_models.mjs
Copy-Item verification/optimized-models/*.glb public/models
npm.cmd run build
```

prepare_models 支持指定模型，例如 `python scripts/prepare_models.py prince`。优化脚本读取未压缩派生模型，输出到 verification/optimized-models；重新全量优化前先重新生成未压缩模型。

## 验证证据与范围

- TypeScript 检查与 Vite 生产构建通过。
- `verification/gates.cjs` 使用 Chrome / Playwright、原控制器键盘事件和 R3F 逐帧推进，保存 `gates.json` 与 24 张 gate 截图。覆盖前进、后退、左右转向、斜向、反向、正反整圈、南北极、停步、椅子坐下/保持、玫瑰及火山交互、各章节、狐狸信任到坐下与受惊后退。累计球面路径 71.13；法线 Y 覆盖 -0.99974 至 0.99980；无 pageerror / console error。
- `verification/rig-audit.mjs` 可读取最终压缩 GLB，检查绑定矩阵、权重归一化、静止蒙皮、8 个 Walk 相位的边拉伸、局部惯性旋转不变性及停止收敛。两角色严重边拉伸计数均为 0（判据：长度放大超过 10 倍且新边超过 0.02）。此数值阈值不等同于逐帧服装碰撞检测。
- 脚底采样相对完整足部最低点误差：Prince 约 0.000094，Fox 约 0.000207；该检查针对模型自身动画，不代表每一处岩石和植物细节都参与碰撞。
- 独立复查确认显示层地表偏移与骨骼脚底修正不会重复应用，坐稳后让位于椅子锚点。

截图检查和采样覆盖上述路径及姿态，尚未做低端移动设备性能实测或全帧衣物碰撞检测。原始星球的石块、火山和植物是视觉装饰，仍沿用原自由球面行走方式。

浏览器脚本中的 Playwright 路径是当前机器的 bundled runtime，其他机器运行时需调整 require 路径并安装 Chrome。

`verification/*.original.tsx` 为修改前快照；`asset-audit.json` 记录尺度/中心/骨骼，`optimized-models/report.json` 记录压缩校验，`rig-audit*.json` 记录骨骼测量。早期非 gate 截图仅用于加工过程诊断，最终画面以 gate 截图为准。
