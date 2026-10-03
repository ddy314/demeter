# Demeter 山地果园工程规划文献依据

检索日期：2026 年 10 月 3 日。服务于本项目的实现方案见 [详细计划](./PLAN.md)。

本次是面向工程选型的定向检索，不是系统综述。优先采用论文出版页、作者公开论文和官方工程文档。部分出版页直接打开失败，但搜索工具返回了出版方的正文片段；下文逐项标明阅读范围。尚未取得全文的文献不作为精确设备参数或复现实验结果的来源。

核心判断：固定喷药管网具有研究基础；地形、管径、泵、分区和运行方式需要联合考虑。已有论文不能直接证明本项目在具体果园里能节省多少人工，更不能把水力达标等同于病虫害防治达标。

## 文献与实现的对应关系

| 编号 | 文献 | 已核验的依据 | 在项目中的用途 | 适用边界与阅读范围 |
|---|---|---|---|---|
| R01 | Yu & He, 2026, *Design and Performance Study of a Terrain-Adaptive Fixed Pipeline Pesticide Application System for Mountain Orchards*. Agronomy 16, 816. [出版页](https://www.mdpi.com/2073-4395/16/8/816)，DOI 10.3390/agronomy16080816 | 研究坡地分区固定管网和高压雾化；现场对象为福建梨园 | 支持山地固定管网选题，提示高差、分区、喷头和沉积验证必须一起考虑 | 出版方索引返回摘要、方法、结论片段。其 8 MPa 工况及管材耐压表述需另行核对厂家资料；不直接作为苹果园默认参数 |
| R02 | Sinha et al., 2020, *Development and Performance Evaluation of a Pneumatic Solid Set Canopy Delivery System for High-Density Apple Orchards*. Transactions of the ASABE 63(1), 37–48. [出版页](https://elibrary.asabe.org/abstract.asp?aid=51117)，DOI 10.13031/trans.13411 | 比较液压与气动输送，研究沿管压力及冠层沉积 | 要计算管路损失，也要明确设备属于哪种输送系统 | 已读出版方摘要。密植苹果、特定树形；气动储液结构不能用单相稳态水力模型完整模拟 |
| R03 | Ranjan et al., 2021, *Effect of Emitter Modifications on Spray Performance of a Solid Set Canopy Delivery System in a High-Density Apple Orchard*. Sustainability 13, 13248. [出版页](https://www.mdpi.com/2071-1050/13/23/13248)，DOI 10.3390/su132313248 | 喷头改型与冠层不同部位、叶片正反面的沉积有关 | 设备库记录喷头、安装高度、冠层适配条件；验证要分层采样 | 已读出版方索引中的引言、结果片段。不能把几何覆盖圆换算成真实沉积，也不能推广为所有树形有效 |
| R04 | Chen et al., 2023, *Fixed Spraying Systems Application in Citrus Orchards: Nozzle Type and Nozzle Position Effects on Droplet Deposition and Pest Control*. Agronomy 13, 2828. [出版页](https://www.mdpi.com/2073-4395/13/11/2828)，DOI 10.3390/agronomy13112828 | 比较喷头类型及安装位置；所读实验使用 0.3 MPa | 证明喷头配置需绑定特定实验工况；用于设计验证维度 | 已读出版方索引中的方法片段。柑橘实验，不能把这一压力当作苹果园通用值 |
| R05 | Owen-Smith et al., 2019, *Spray coverage and pest management efficacy of a solid set canopy delivery system in high density apples*. Pest Management Science. [出版页](https://onlinelibrary.wiley.com/doi/full/10.1002/ps.5421)，DOI 10.1002/ps.5421 | 研究密植苹果固定喷雾与防治效果 | 后续田间验证应同时考虑覆盖与实际防治效果 | 仅核验出版元数据及摘要片段，未取得全文；本计划不引用其具体增益数字 |
| R06 | Zhao et al., 2019, *Synchronization Optimization of Pipeline Layout and Pipe Diameter Selection in a Self-Pressurized Drip Irrigation Network System Based on the Genetic Algorithm*. Water 11, 489. [出版页](https://www.mdpi.com/2073-4441/11/3/489)，DOI 10.3390/w11030489 | 将管网布置与管径联合编码优化 | 优化变量同时包含拓扑和离散管径；避免先定最短管线再盲目配管 | 已核验出版页元数据及原论文摘要。对象是自压滴灌，迁移的是优化结构，不是喷药参数 |
| R07 | Liu et al., 2025, *Multi-objective optimization of pressure in self-pressurized irrigation networks based on meta-heuristic algorithm with valve openings*. Computers and Electronics in Agriculture 237, 110542. [出版页](https://www.sciencedirect.com/science/article/abs/pii/S0168169925006489)，DOI 10.1016/j.compag.2025.110542 | 以阀门开度参与压力均衡和可靠性优化 | 第二阶段加入阀门或分区变量，并比较成本、运行时间、压力裕量 | 已读出版方索引摘要与亮点，未取得全文；不能据此宣称 NSGA-II 普遍优于其他算法 |
| R08 | Deb, Pratap, Agarwal & Meyarivan, 2002, *A Fast and Elitist Multiobjective Genetic Algorithm: NSGA-II*. IEEE Transactions on Evolutionary Computation 6(2), 182–197. [原论文 PDF](https://web.njit.edu/~horacio/Math451H/download/2002-6-2-DEB-NSGA-II.pdf)，DOI 10.1109/4235.996017 | 非支配排序、精英保留、拥挤度与约束处理 | 在可行解中搜索成本与运行时间的折中，显示真实代际数据 | 已读原论文摘要及算法正文片段；有限代数得到的是近似非支配集，不保证全局最优 |
| R09 | Shewchuk, 1996, *Triangle: Engineering a 2D Quality Mesh Generator and Delaunay Triangulator*. [作者论文](https://www.cs.cmu.edu/~quake/tripaper/triangle1.html) | 受约束三角剖分可处理边界、孔洞和质量约束 | 地块及梯田边界作为几何约束，生成可解释的地形网格 | 已读作者论文引言；三角剖分本身不推断高程。参考算法不等于采用 Triangle 软件，其[许可另有限制](https://www.cs.cmu.edu/afs/cs/project/quake/public/www/triangle.html) |
| R10 | Yao et al., ICLR 2023, *ReAct: Synergizing Reasoning and Acting in Language Models*. [论文](https://arxiv.org/abs/2210.03629) | 语言模型可通过动作与外部工具结果迭代完成任务 | 采用有限工具集合、结构化反馈和有上限的重试闭环 | 已读论文摘要；论文不是本项目工程正确性证据，界面展示工具事件和结果摘要即可 |
| R11 | *Nemotron-Research-Tool-N1: Tool-Using Language Models with Reinforced Reasoning*, 2025. [论文](https://arxiv.org/abs/2505.00024) | 专门研究模型工具使用能力 | 把模型评测重点放在参数正确性、约束保持和工具调用，而非泛化聊天 | 已读摘要；研究模型与平台在售模型可能不同，不继承其基准成绩，不据此固定部署型号 |

## 官方工程与平台资料

| 编号 | 来源 | 对项目的直接约束 |
|---|---|---|
| D01 | [EPA EPANET 2.2 手册](https://usepa.github.io/EPANET2.2/)及[官方项目说明](https://www.epa.gov/water-research/epanet) | 可表达节点、管道、泵、阀门及压力相关出流。作为稳态水力校核工具；不提供本项目所需的冠层沉积、雾化或水锤完整模型 |
| D02 | [EPA WNTR 水力仿真文档](https://usepa.github.io/WNTR/hydraulics.html) | WNTR 包含不同求解器；项目若采用 Darcy–Weisbach，优先封装 EPANET 2.2 并明确求解器。不能以为 WNTRSimulator 与 EpanetSimulator 的能力完全相同 |
| C03 | [Token Factory 官方快速开始](https://docs.tokenfactory.nebius.com/quickstart) | 官方提供 API 接入和账户流程；实际模型可用性、工具调用、结构化输出需小规模实测 |

## 从论文进入代码的审核规则

1. **支持选题的论文，与提供设备参数的资料分开。** 论文说明路线有研究价值；真实型号的压力流量曲线、管材等级和价格仍需设备资料。
2. **每个参数有出处和单位。** 记录 `source_url`、页码或章节、`value`、`unit`、适用作物、设备型号、工况与核验状态。
3. **论文之间不拼接不兼容的部件。** 气动储液、液压固定喷头、人工喷枪接口作为不同系统类型；不同研究的泵、管、喷头不任意混搭。
4. **相关研究不给本项目自动背书。** 保留“论文观察”“仿真结果”“现场实测”三种标签；节省人工、减少农药等指标没有本项目证据就不显示百分比。
5. **公式实现通过可手算案例与独立求解器检验。** 引用了论文不代表实现正确，也不代表输入准确。
6. **成果定位为工程初步方案。** 粗略地形生成的方案应显示高程不确定性；设备采购与施工版本需要测量、匹配的设备参数和现场复核。

## 下一步需要补齐的证据

- [ ] 获取 R01、R06、R07 的完整可用文本，记录实际使用公式的位置，核对单位及边界条件。
- [ ] 选一个液压固定喷头体系，收集至少一条可核验的压力流量曲线，以及与之匹配的泵、管、阀资料。
- [ ] 对目标果园典型树形、株行距、梯田宽度、高差和作业方式做最小访谈；不要直接套密植果园假设。
- [ ] 若要展示人工收益，先定义原作业流程和拟采用流程，再采集作业时间，不采用宣传百分比。
- [ ] 优先安排清水台架与实测压力验证；冠层沉积验证需独立实验方案，不能由网页视觉效果代替。

检索结果已足以确定软件架构和开发顺序；设备参数与田间收益仍属于后续验证事项。


## 综合场景新增方向

大棚、光照、作物光响应、无人机覆盖/喷洒与投入产出评价，见[新增文献与实现映射](./DEMO_RESEARCH.md)。其中列出 9 项论文或原始技术报告、可核验链接、计算公式及本次实现边界。
