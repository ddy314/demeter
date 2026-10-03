# 综合果园演示：文献、模型与可核验边界

检索与实现日期：2026-10-03。覆盖大棚、光照、投入产出、无人机植保。这里将**论文结论、当前实现、演示假设、下一步验证**分别列出；没有把他国温室或其他作物的实验参数直接当作本果园的标定值。

## 研究依据与实现映射

| 方向 | 一手文献 / 技术报告 | 与项目的关系 | 本次实现及边界 |
|---|---|---|---|
| 太阳位置 | Reda, I.; Andreas, A. *Solar Position Algorithm for Solar Radiation Applications*. NREL/TP-560-34302，2008 修订；对应 2004 年 Solar Energy 论文。[机构说明与报告](https://midcdmz.nlr.gov/spa/) | 太阳高度角和方位角应由位置与时间计算，是光照场景的几何依据。 | 本次没有实现完整 SPA，也不宣称其精度；使用下一行 NOAA 的简化公式。 |
| 简化太阳几何 | NOAA, *General Solar Position Calculations*。[原始公式 PDF](https://gml.noaa.gov/grad/solcalc/solareqns.PDF) | 提供太阳赤纬等近似公式，适合明确精度边界的演示。 | 实现日序赤纬谐波式，输入纬度和当地太阳时；太阳位置向量驱动光源与轨迹。固定地块正北朝向，未使用经纬度定位或时区时间换算。 |
| 棚内光分布 | Teitel, M.; Deriugin, M.; Haslavsky, V.; Tanny, J. (2012). *Light distribution in multispan gutter-connected greenhouses: Effects of gutters and roof openings*. Biosystems Engineering 113(2), 120–128。[出版社页面](https://www.sciencedirect.com/science/article/abs/pii/S153751101200116X) | 研究表明屋面、天沟和通风开口会使棚内光照分布不均；外界光照不能直接视为作物收到的光。 | 用单一棚膜透光系数折算直射时长，未模拟骨架/天沟阴影、散射与 PAR。默认 0.72 为可替换假设，不是此论文的拟合结果。 |
| 光照与作物产量 | Marcelis, L.F.M.; Broekhuijsen, A.G.M.; Meinen, E.; Nijs, E.M.F.M.; Raaphorst, M.G.M. (2006). *Quantification of the growth response to light quantity of greenhouse grown crops*. Acta Horticulturae 711, 97–103。[DOI 10.17660/ActaHortic.2006.711.9](https://doi.org/10.17660/ActaHortic.2006.711.9) | 该研究专门检验“增光百分比等于增产百分比”的经验规则，并区分不同温室作物。 | 不将光照时长直接映射为果树产量。当前单株年产与设施产量系数为独立输入，需实际作物、树龄、密度及试验数据校准。 |
| 设施综合管理 | FAO (2013). *Good Agricultural Practices for Greenhouse Vegetable Crops: Principles for Mediterranean Climate Areas*. Plant Production and Protection Paper 217。[FAO 原文](https://www.fao.org/4/i3284e/i3284e.pdf) | 光照应与温湿度、通风、灌溉和作物管理共同考虑。该资料是技术手册，不冒充单篇实验论文。 | 当前只处理设施几何、地形平整度、透光假设及成本；温湿度、通风、结构荷载和生长模型尚未实现。 |
| 往返覆盖路径 | Choset, H.; Pignon, P. (1997). *Coverage Path Planning: The Boustrophedon Cellular Decomposition*。[CMU 原文](https://www.ri.cmu.edu/pub_files/pub4/choset_howie_1997_3/choset_howie_1997_3.pdf) | 用分区与往返扫描构造区域覆盖路径。 | 借鉴往返扫描思想，以固定幅宽裁剪扫描线；本次不是完整 BCD 分解算法，不保证路径全局最短。 |
| 田界与障碍约束 | Plessen, M. (2024，2025 修订). *Path Planning for Spot Spraying with UAVs Combining TSP and Area Coverages*。[arXiv:2408.08001](https://arxiv.org/abs/2408.08001) | 将田界内覆盖、障碍规避、区域间转场统一为路径规划问题。 | 本次用可视图最短路连接扫描段；转场不喷洒。未复现论文的 TSP 优化；多连通分量仅飞最大分量，未覆盖部分计入覆盖率分母。 |
| 喷洒与漂移 | García-Munguía, A. et al. (2024). *A Review of Drone Technology and Operation Processes in Agricultural Crop Spraying*. Drones 8(11), 674。[DOI 10.3390/drones8110674](https://www.mdpi.com/2504-446X/8/11/674) | 总结飞行、喷头、幅宽和环境条件对喷洒作业的影响，以及沉积/漂移评估的重要性。 | 只显示几何航线与开关喷示意。没有药剂配方、剂量、雾滴谱、风场、下洗流、沉积分布或药效预测；几何覆盖率不是药效覆盖率。 |
| 投入产出与敏感性 | *Economic Feasibility Analysis of Greenhouse–Fuel Cell Convergence Systems*. Sustainability 16(1), 74，2024 卷期（2023 年在线发表）。[DOI 10.3390/su16010074](https://www.mdpi.com/2071-1050/16/1/74) | 提供设施系统经济评价与输入敏感性分析的案例；不能据此直接移植设备单价或收益水平。 | 本次采用初始投入、重复年净现金流、静态回收期、五年 NPV，以及收入 ±20% 的情景比较。8% 折现率、费用和产量均为演示假设。 |

正文依据来自论文摘要、出版社提供的可读内容与公开技术报告。没有把访问不到的全文当作已阅读全文，也没有声称复现文献实验。

## 已实现的计算定义

### 光照

地块坐标 x 指向东、y 指向北。太阳时小时角为 `H = 15° × (t − 12)`。赤纬 δ 使用 NOAA 日序近似式。太阳方向为：

```text
s_east  = -cos(δ) sin(H)
s_north = cos(φ) sin(δ) - sin(φ) cos(δ) cos(H)
s_up    = sin(φ) sin(δ) + cos(φ) cos(δ) cos(H)
```

全天 48 个半小时中点采样，剔除太阳在地平线以下的样本。从每株树的地面上方 3 m 沿太阳方向射线步进，水平间距 2 m；若地形超过射线则该样本计为遮挡。树冠互遮、地块以外山体、建筑遮阴与天气未计算。直射时长为可见样本数乘以 0.5 h。棚内“透光折算值”为时长乘输入透光系数，**不是 DLI、辐照量或产量预测**。原始节点数据随导出保存。

### 大棚

每座演示拱棚为 20 × 9 m。枚举台地内候选中心，要求建筑整体落在内缩 2 m 的地块内，与禁区及其他棚保持间隔，地面角点高差不超过 0.8 m。只容纳在棚内的既有种植节点计为保护种植，防止同时按露地和设施重复计算产量。它是果树保护棚概念模型，不是蔬菜产量模型。

### 无人机

作业域：田界内缩 2 m，减去禁区及大棚外扩 3 m 的区域。扫描线按幅宽间距生成，喷洒段裁剪在作业域内；转场通过多边形顶点的可视图求可行最短路，转场关喷。喷洒段缓冲半个幅宽后求并集，再与作业域相交，得到几何覆盖面积。报告实际覆盖比例，边角漏扫与未访问连通分量不会被隐藏。

飞行高度暂固定为最高地面上方 12 m 的绝对高度；这里不推荐该高度用于真实植保。总航时下界为三维路径长度除以输入航速，不包含起降、转弯减速、补液和换电。动画以 6 倍速度播放。没有输出飞控任务、绕行动态障碍或真实药液沉积结果。

### 经营

```text
年产量 = 单株产量 × (露地株数 + 棚内株数 × 设施产量系数)
年销售额 R = 年产量 × 销售单价
初始投入 I = EPANET 方案材料估算 + 大棚面积 × 大棚建设单价
年经营支出 C = 株数 × 单株年经营成本 + 露天作业面积(亩) × 植保服务单价 × 年次数
年净现金流 N = R − C − 0.04 I
第 t 年累计现金流 = −I + tN
五年 NPV = −I + Σ(t=1..5) N / (1.08)^t
静态回收期 = I/N，仅 N>0 时显示
```

预设假设：35 kg/株·年、¥8/kg、¥110/株·年经营成本、设施产量系数 1.2、大棚 ¥150/m²、植保 ¥18/亩·次且 6 次/年。经营成本视为汇总输入，未按电价单列水泵电费；可以日后用详细台账替换。投入不含苗木建园、土地、融资、税、残值；对应已有成熟果园的新增设施情景。设施预设的五年 NPV 可以为负，界面照实展示，不为了演示美化收益。

## 演示与实际求解的关系

三段提示词绑定显式场景配置，当前不是开放式语言模型理解。点击开始会新建 EPANET 任务，并调用 `/api/study` 计算新增因素。26 秒逐件装配与每章 9 秒导览是观看节奏，独立于后端计算时间；只有计算成功才进入结果导览。点击章节会暂停自动推进并切换相机；暂停不取消后台求解，返回提示词会尝试取消未完成任务。

导览解说从当前几何、光照、方案和经营结果拼接，不虚构评估数量。三维视图中的流动亮点、透明喷雾和镜头运动为解释性动画。原工程工作台仍在 `/#workbench`。

## 后续验证顺序

1. 引入当地气象、真实经纬度/坡向，对照 pvlib/SPA 和现场 PAR 传感器；补冠层与棚架遮阴。
2. 选择具体作物与树龄，标定光合有效辐射、生长和产量模型，独立验证后再连接光照与收益。
3. 引入实测 DEM/冠层高度、仿地轨迹、速度/转弯/续航约束，随后再接下洗流、风场和沉积模型。
4. 用设备报价、果园台账、当地服务费和价格分布替换演示经济参数，加入树龄曲线和风险分析。

装配时间轴支持暂停、回退与重播；它控制地表裁切、独立树木缩放、逐拱架描绘、屋面安装和管网拓扑依赖顺序。新增储水罐、光伏顶棚、监测柜是视觉设施，没有改变既有研究计算；综合 JSON 中 `visual_facilities.included_in_economics` 为 `false`。
