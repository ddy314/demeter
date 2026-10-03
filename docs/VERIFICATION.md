# 本地工程原型验证记录

日期：2026-10-03。范围为本机代码、实际 EPANET 求解和桌面 Chrome 页面。没有调用 Nebius 模型或创建付费云资源。

## 自动检查

| 命令 | 结果 |
|---|---|
| `npm run check` | TypeScript 与 Ruff 通过 |
| `npm run build` | 构建通过；主入口约 291 kB，延迟加载三维模块约 1,033 kB，均为未压缩体积 |
| `npm test` | 28 个 Python 测试通过（19.30 秒）+ 3 个 JavaScript 经营计算测试通过；不是求解性能基准 |

测试覆盖：自交边界与非法压力；场景 JSON 往返和稳定 revision；连通性、树结构、三维管长与高程一致性；禁区不种植/不布管；断开地块无解；独立单管层流解析损失与泵/喷头联立计算对照 EPANET（相对容差 0.2%）；供水流量约束；108 个实际候选及事件不重复；成本与材料小计一致；有限候选 Pareto 性质；扰动结果非全通过；低预算真实无解；取消；接口输入校验；本地指令拒绝歧义；SSE 序号、版本、断点恢复和磁盘导出；预览提供的两棵连通路由树；搜索可视快照的节点覆盖、与候选最低压力一致及不同候选之间确实变化。

测试依赖产生一条 Starlette 关于测试客户端未来迁移 httpx2 的弃用提示，目前测试通过。三维依赖会提示 THREE.Clock 已弃用。开发过程中发现并修复了 Html 跨 React root 的卸载提示，以及将 App 与入口拆开以避免热更新重复 createRoot。最终 `:8000` 构建页的求解和交互没有新增浏览器 error；历史日志中的开发错误不算成最终页面错误。

## 默认示例的实际结果

输入为 `Scene()`：120 × 70 m，32 m 高差，5 级梯田，6 × 8 m 株行距，预算 ¥22,000，最低压力 0.24 MPa，最高运行压力 0.95 MPa，供水上限 220 L/min，每节点目标清水量 4 L，seed 42。场景 revision 为 `be2a23f6a98dd087`。

- 108 个种植/服务节点，199 条候选走廊。
- 完整评估 108 组配置，57 组可行，返回三个不同的代表方案。
- 实际桌面运行单次约 2.1–2.2 秒，包括代表方案的扰动验证；只是本机观测，不承诺其他设备或规模的时长。
- 以下成本为合成目录估算；清水作业时长包含既定的切换、准备与冲洗时间假设。

| 方案 | ID | 成本 / 元 | 时长 / min | 最低活动压力 / MPa | 喷洒能耗 / kWh | 扰动通过数 |
|---|---|---:|---:|---:|---:|---:|
| 均衡 | P004 | 14,688.49 | 8.15 | 0.38727 | 0.1610 | 12/12 |
| 成本优先 | P002 | 14,158.49 | 14.30 | 0.24315 | 0.1182 | 6/12 |
| 效率优先 | P049 | 16,746.64 | 7.97 | 0.42019 | 0.1565 | 12/12 |

成本优先方案仅有很小的最低压力余量，其扰动结果确实比另外两个方案差。通过率仅描述 12 次抽样，不是现实可靠性概率。各代表方案使用同一组样本，便于公平比较。

可复核数据：[完整项目 JSON](../artifacts/demo-project.json)。导出包含 34 个运行事件、完整场景和候选结果。该文件来自实际页面下载；不是手工制作的展示成绩。

## 浏览器实际验证

1. 在开发页面和 FastAPI 提供的正式构建页面加载地形、执行求解；正式页面地址为 `http://127.0.0.1:8000`。
2. 输入 `预算改成1000`，界面预算更新；求解返回无可行解，显示当前目录中水力合格最低成本 ¥14,158。恢复预算后旧结果立即失效。
3. 从页面停止运行任务，日志返回 `CANCELLED`，参数编辑恢复；随后能重新完整求解。
4. 选择成本优先方案，管网、压力统计、泵、分区、材料和 6/12 扰动结果同步切换。
5. 压力模式有实际节点颜色；点击树 T001，在默认均衡方案显示 0.737 MPa、1.25 L/min，与计算结果取整一致。
6. 拖动边界使地块从 8.2 亩、108 节点变为 7.8 亩、106 节点；撤销恢复 8.2 亩、108 节点。三维地形随输入重新建立。
7. CSV 实际下载包含 8 项材料，成本优先方案小计求和为 ¥14,158.49。JSON 实际下载约 886 kB，解析后校验 108 个候选、最终 complete 事件与预算一致。
8. 重新导入已导出的 JSON，恢复输入并清除旧计算结果，等待重新生成。

## 前端重构后的额外验证

白/蓝/灰工作台采用独立地形、植被、管网模块。默认 108 株树使用 28,080 个叶片实例及分枝；选择检测使用每树一个不可见命中体，避免逐叶片拾取。自然材质、白模共享计算几何。没有引入外部模型或纹理请求。

- 新构建页面执行完整求解，仍为 108 个候选、57 个可行配置和 P004/P002/P049 三个代表方案。
- 回放暂停后逐步查看：P001 显示最低压力 0.19 MPa、成本 ¥14,088、1/108 已评估、0 个可行；P005 显示 0.46 MPa、¥14,758、5/108、4 个可行。管网颜色、节点快照与散点图跟随同一事件。键盘推进回放滑块也同步更新。
- 退出回放恢复最终方案数据。自然材质与白模切换，压力模式保留树的材质，仅改变管线/节点光环。
- 果树 T001 点选显示 0.737 MPa、1.25 L/min；近景按钮实际推动相机靠近，返回全景恢复镜头。
- 管段 E68 点选显示内径 32 mm、长度 9.9 m、末端 T001。切换计算候选时清除旧选择，避免旧内径滞留。
- 俯视按钮实际切换至地块顶视方向；供水暂停后动画状态为 paused，恢复后轮喷提示与路径演示重新出现。最终构建页面没有浏览器 error。

[新版工作台](../artifacts/studio-workspace.jpg) · [白模](../artifacts/studio-clay.jpg) · [近景](../artifacts/studio-closeup.jpg) · [回放 P001](../artifacts/studio-replay-001.jpg) · [回放 P005](../artifacts/studio-replay-005.jpg)

供水粒子速度、轮喷演示节奏、叶片摆动和扫描光带为视觉表达；只有候选参数、管网拓扑与压力/出流快照来自计算。没有将动画称为瞬态流动模拟，也没有测量 FPS。

## 未验证和未实现

未进行现场设备/药效验证、跨浏览器与触屏实测、长时间并发或大量历史任务测试、FPS 基准、GPU 性能测试、第三方部署和真实模型调用。CSS 有窄屏布局，但不把它等同于完整移动端验收。现有独立水力对照是一个层流单管案例，不能代替覆盖全部流态和工况的工程验证。设备、水量、施工和准备时间仍需真实资料校准。


## 综合场景与镜头导览（新增）

- 默认入口为预设提示词页，工程工作台保留在 `/#workbench`。大棚、光照、无人机、经营计算的文献与方程见 [DEMO_RESEARCH.md](./DEMO_RESEARCH.md)。
- 新增四项 Python 测试：太阳向量与季节关系、棚内节点不重复计产与透光折算、无人机路径连续/避障/覆盖面积、非法输入拒绝。三个 JS 测试验证现金流、NPV、亏损时无回收期及价格/产量敏感性。
- 三个预设分别完整执行综合分析及 EPANET，复核结果见 [demo-validation.json](../artifacts/demo-validation.json)。复核命令：`PYTHONPATH=. .venv/bin/python scripts/verify_demo.py`。

| 预设 | 大棚 | 平均直射时长 / h | 几何覆盖率 | 航程 / m | 航时下界 / min | 水力可行配置 |
|---|---:|---:|---:|---:|---:|---:|
| 山地综合 | 0 | 12.31 | 98.4% | 1,050.19 | 5.83 | 57 |
| 设施果园 | 3 | 10.00 | 95.2% | 1,155.22 | 6.42 | 81 |
| 冬季植保 | 0 | 10.00 | 98.3% | 1,294.01 | 7.19 | 35 |

浏览器已实际从提示词启动设施预设，观察分层建模、自动推进到经营章节；手动点击设施章节可在暂停推进的状态下平滑切到近景。无人机章节显示飞行器、扫描段及关喷转场，暂停后保持在当前章节。

售价 8 → 9 元/kg 时，年销售额从 ¥30,912 → ¥34,776，年净现金流从 ¥14,613 → ¥18,477，五年 NPV 从约 −¥36,879 → −¥21,451。输入恢复为 8 后，通过页面实际下载综合方案，保存为 [demo-glass-study.json](../artifacts/demo-glass-study.json)：1,046,971 字节，34 个真实运行事件、108 个光照节点、3 座大棚，导出 revision 与水力任务一致。浏览器工具等待下载事件超时，但文件实际下载成功，已从下载目录独立解析核验。

提示词是预设配置；自由文本和语言模型尚未启用。26 秒逐件装配与每章 9 秒导览不作为后端计算耗时。这里验证的是本机演示链路，没有进行帧率、跨设备、喷洒沉积、现场光照或真实收益验证。

最终浏览器补充检查：太阳时滑块用键盘由 14:00 改为 13:30，界面同步更新；光照章节报告 T020 棚膜折算 7.2 h，日平均无遮挡直射为 10 h。依据面板展示全部 9 项原始资料链接与输入假设；工程工作台入口正常打开。

[提示词入口](../artifacts/demo-prompt.jpg) · [设施近景](../artifacts/demo-greenhouse.jpg) · [光照章节](../artifacts/demo-sunlight.jpg) · [无人机章节](../artifacts/demo-drone.jpg)

## 三维逐件装配与界面精简

本次仅调整前端，`npm run check` 与 `npm run build` 均通过。生产构建主包约 290 kB，按需三维包约 1,043 kB。未重新运行未修改的后端测试，也未把浏览器观察作为 FPS 基准。

- 默认进入设施预设与白模。26 秒时间轴控制地表扫描、逐排种植、温室结构、管网与总览，随后自动衔接六章结果导览。
- 桌面 Chrome 从提示词开始，实际完成装配并自动进入结果导览。新增设施为两座储水罐、六块光伏顶棚面板、一套监测柜与传感器；温室细分为基础、54 根立柱、27 道拱架、纵梁、24 段棚膜及端门/通风部件。
- 重播后暂停在 6.8 秒，前部树木完成、后部保持定位点；暂停在 13 秒，显示不同完成程度的拱架且尚未封膜；19.5 秒显示水源向外生长的部分管段。由 19.5 秒回拖至 13 秒，屋面与管网消失，拱架准确回到半成型状态。
- 建构阶段管网按父段完成时刻排定后续管段，避免原先动画在隐藏阶段提前播放。镜头在工序之间平滑移动，暂停或拖动不改变计算结果。
- 主画面移除大段叙述、重复状态、主屏模型接入提示与解释性脚注，保留短叙述、指标和操作。研究来源及模型边界仍可从资料入口查看。
- 上述交互完成后浏览器控制台未捕获到 error。截图：[逐排落位](../artifacts/assembly-orchard.jpg)、[温室半成型](../artifacts/assembly-frame.jpg)、[管网铺设](../artifacts/assembly-pipes.jpg)。

最后补充检查：原工程工作台仍显示完整山地、108 个种植节点并可返回演示；供水近景显示储水、光伏与监测设备；「重播建构」按钮保持横向布局。新增近景截图：[供水设施](../artifacts/assembly-service.jpg)。

## English UI, grounded terrain and larger scenes

The interface, default scene names, accessibility labels, server-generated run messages, validation errors and material CSV headers now use English. CNY values are unchanged; the plot-area display uses hectares. Legacy default scene names stored in the browser migrate to English, preserving user parameters.

All demo presets use a 180 × 105 m canvas, 244 nodes and a 12,351.1 m² polygon (2.25× the prior area). Repeated real study + EPANET runs found 21 feasible hillside configurations, 43 greenhouse configurations and 18 winter configurations, with three representative plans each. See `artifacts/demo-validation.json`. The separate workbench retains the original 120 × 70 m example.

The previous global Delaunay mesh crossed terrace folds near the slanted boundary. An independent barycentric comparison found root/surface mismatches at T049 (2.287 m) and T016 (0.317 m) in the default scene. The replacement triangulates each terrace/riser band with constrained Delaunay triangles. New tests compare every tree root with the rendered triangles and verify polygon coverage for both original and expanded scenes; tolerance is 0.00001 m. Shapely minimum version is now 2.1.

Rendering changes: GPU instance attributes replace per-frame CPU reconstruction of tree matrices; stable trees, terrain, structures and network components are memoized. Demand rendering stops idle frames after a paused camera settles. Dynamic shadows update at most 20 Hz; maximum pixel ratio changes from 1.75 to 1.5. Camera transitions and drone playback clamp the first time step after an idle period.

The full existing suite plus two terrain regression cases passed (30 Python + 3 finance tests); an additional English `rise 25m` API case was subsequently checked with the API suite. TypeScript/Ruff checks and the production build passed. Browser CPU samples are recorded separately; they are observations of the paused scene, not an FPS or active-flight benchmark.

For fields above 180 nodes, canopy geometry uses 160 wider leaves per tree instead of 260 (39,040 versus 63,440 instances for 244 trees). The renderer now survives preset changes: the previous consistent scene stays visible until the next preview is ready, and Start is disabled while the selected scene is pending. The English workbench completed a live 108-node solve with English candidate messages and labels. The Demo navigation button was moved into the header flow to prevent breadcrumb overlap.

Paused-scene CDP observations are in [render-observations.json](../artifacts/render-observations.json). They include different sampling windows and a viewport change, so no controlled FPS improvement is claimed. Screenshots: [English orchard](../artifacts/english-orchard.jpg), [English workbench](../artifacts/english-workbench.jpg).

Final browser checks: the expanded hillside scene shows 244 nodes and 1.24 ha; the GPU growth timeline paused at 7.6 seconds correctly shows completed lower rows and partially formed upper rows. Clay/Natural switching, assembly-to-tour transition and the English Terrain chapter work. No browser console error was captured. The main README is now English, with the Chinese version preserved as `README.zh-CN.md`.
