# NLP → MCP → CAE → 轻量结果 → Viewer 技术架构

本文定义 CAE-Agent-Hub 的目标工作流，并按 `Downloads/analysis_v2.html` 第 2.1 节“数据流与分层架构”检查当前代码。目标是让用户通过自然语言描述工程问题，由 AI 客户端调用 MCP 服务访问真实 CAE 软件，完成求解和验证，再把原生结果转换为浏览器可加载的轻量数据。

## 1. 目标与边界

目标链路是：

```mermaid
flowchart LR
    A[用户 NLP 对话] --> B[AI 客户端 / Agent]
    B --> C[任务解析与 CaseSpec]
    C --> D[MCP Server]
    D --> E[CAE 软件 / Solver]
    E --> F[原生结果与日志]
    F --> G[结果解析与验证]
    G --> H[轻量 Result Mesh / History JSON]
    H --> I[React + Three.js Viewer]
    I --> J[浏览器检查、回放与报告]
```

这条链路中，MCP 是 AI 与 CAE 之间的标准接口；Skill 是工程规则和操作知识；CAE 软件负责真实数值计算；Viewer 只消费经过导出和验证的数据。Viewer 不应伪造求解结果，也不应把“进度条完成”当作求解成功。

当前仓库已经包含多种独立 MCP 集成和多个 Viewer 结果格式。本文的重点是把它们统一成一条可追溯的产品链，而不是让浏览器直接承担所有 CAE 软件的私有控制逻辑。

## 2. 参考架构映射

`analysis_v2.html` 第 2.1 节把系统描述为六个环节：

| 环节 | 目标职责 | 本项目的目标组件 |
| --- | --- | --- |
| ① 用户提出任务 | 用自然语言描述几何、材料、边界、工况和输出要求 | AI 客户端聊天窗口 |
| ② AI 翻译任务 | 补全信息、读取 Skill、生成结构化任务并调用工具 | Agent + CaseSpec/任务编排器 |
| ③ CAE 建模与设置 | 导入或生成模型，划分网格，设置材料、边界和求解步 | MCP Server + CAE bridge |
| ④ CAE 真实计算 | 启动求解器、监控作业、保留日志和原生结果 | Solver job runner |
| ⑤ 结果轻量化 | 解析原生输出，合并拓扑/场数据，做验证和摘要 | Result adapter/exporter |
| ⑥ 浏览器检查 | 三维场、时间/模态帧、曲线、指标和证据回放 | React/Vite/Three.js Viewer |

与参考报告中的四层职责对应如下：

| 层 | 应负责什么 | 当前仓库代表实现 |
| --- | --- | --- |
| MCP Servers | 提供可调用的 CAE 工具和受控作业入口 | `MCP/CalculiX/mcp_server.py`、`MCP/Peridigm/server.py`、Abaqus/Ansys 等 |
| Skills | 规定建模、求解、后处理和验证的专业步骤 | `Skill/` 下各软件与分析流程 |
| CAE 应用 | 实际执行网格和数值求解 | `ccx`、Abaqus、Fluent、Peridigm 等外部软件 |
| Viewer | 展示导出的轻量结果，不依赖求解器 | `viewer/components/CaeResultViewer.js`、`viewer/peridigm.jsx` |

## 3. 推荐的端到端数据协议

### 3.1 NLP 到 CaseSpec

Agent 不应把原始句子直接拼成 shell 命令。应先生成可审阅的 `CaseSpec`，至少包含：

```json
{
  "case_id": "uav-2026-0915-01",
  "solver": "fluent",
  "analysis_type": "external_aerodynamics",
  "geometry": {"source": "uav_concept_v4.step"},
  "physics": {
    "velocity_mps": 22,
    "angle_of_attack_deg": 3,
    "sideslip_deg": 0,
    "density_kg_m3": 1.225,
    "dynamic_viscosity_pa_s": 1.7894e-5,
    "turbulence_model": "k-omega-SST"
  },
  "mesh": {"growth_rate": 1.2, "boundary_layers": 10, "y_plus_target": 1},
  "acceptance": {"residual": 1e-5, "monitor_stable": true},
  "outputs": ["surface_fields", "streamlines", "force_history", "report"]
}
```

CaseSpec 要经过参数范围、单位、必填项和用户确认。确认后保存规范版本和哈希；之后的重试只能修复运行环境或恢复同一规格，不能在后台悄悄改变材料、载荷、边界或目标时间。

### 3.2 MCP 作业协议

不同软件的 MCP 工具可以有不同名称，但应提供同一类生命周期：

```text
health → inspect_model → prepare_case → validate_case
       → submit_job → get_status / get_log → cancel_job
       → collect_native_results → verify_results → export_viewer_data
```

每个作业都应返回 `run_id`，并把以下信息写入外部运行目录：CaseSpec、输入快照、软件版本、命令摘要、开始/结束时间、退出状态、日志、原生结果路径、结果摘要、验证结果和导出文件哈希。

### 3.3 Viewer 数据协议

Viewer 需要一个跨求解器的最小契约，而不是直接读取某个软件的 `.odb`、`.frd`、`.cas` 或 Exodus 内部结构。静态结果至少包含：

```json
{
  "schemaVersion": 1,
  "analysisType": "static",
  "source": "CalculiX",
  "units": {"length": "mm", "stress": "MPa", "time": "s"},
  "nodes": [{"label": 1, "coordinates": [0, 0, 0], "deformed": [0, 0, 0]}],
  "elements": [{"label": 1, "type": "S4", "connectivity": [1, 2, 3, 4], "mises": 12.3}],
  "fields": {"primary": "mises", "available": ["mises", "displacement"]},
  "fieldRanges": {"misesMin": 0, "misesMax": 12.3, "maxDisplacement": 0.02},
  "history": [],
  "provenance": {"runId": "...", "verified": true}
}
```

动态、模态和近场动力学结果在同一协议上增加 `dynamicFrames` 或 `modalFrames`。导出器必须明确单位、场含义、变形缩放、是否插值以及验证状态；Viewer 只能显示这些元数据，不能自行推断缺失的物理量或网格连接关系。

## 4. 当前代码已经实现的部分

### 4.1 MCP 与真实求解

CalculiX MCP 已经提供一条相对完整的工具链：健康检查、`.inp` 解析、设计变量修改、`ccx` 求解、`.dat` 结果读取、`result_mesh.json` 导出和受约束优化，见 [mcp_server.py](../MCP/CalculiX/mcp_server.py)。求解器还检查 `.sta/.dat` 和 `*ERROR`，没有盲目信任进程退出码。

Peridigm 模块也有 CaseSpec、模板、受限提交、独立验证和回放数据，见 [Peridigm README](../MCP/Peridigm/README.zh-CN.md)。这条链更接近“有证据的 Agentic 求解”，但它目前是独立 CLI/MCP 工作流，不是首页 Fluent 界面的后端。

### 4.2 原生结果到轻量数据

CalculiX 的 [result_exporter.py](../MCP/CalculiX/tools/result_exporter.py) 已定义 `result_mesh.json` 的基本格式：拓扑来自 `.inp`，节点位移和单元应力来自 `.dat`，并按原始节点/单元标签合并。Viewer 的 `CaeResultViewer` 能读取静态、动态和模态帧，并支持字段切换和播放。

### 4.3 Viewer 读取接口

`viewer/lib/caeProjectStore.js` 已封装 `/__cae/project`、`/__cae/result-mesh`、`/__cae/result-summary`、`/__cae/parameters` 和 `/__cae/run`。Vite 插件也有只对仓库内白名单案例开放的路径校验和 Abaqus 脚本启动逻辑，见 [vite.config.mjs](../viewer/vite.config.mjs)。Peridigm 还有独立的静态回放入口。

## 5. 当前代码缺少或未接通的部分

### 5.1 NLP/Agent 没有接入首页

首页实际入口是 `viewer/main.jsx` 加载的 [TextToCaeWorkspace.js](../viewer/components/TextToCaeWorkspace.js)。它的聊天逻辑只用正则判断“停止/优化/网格”，再用 `setTimeout` 添加一条固定回复；没有 LLM、MCP 客户端、CaseSpec、工具调用或上下文记忆。因此“AI COPILOT”是 UI 文案，不是 NLP 到 MCP 的执行层。

### 5.2 “启动全自动仿真”没有调用求解器

`startSimulation()` 目前只设置 `running=true`、进度 `42%`、当前步骤和消息，见 [TextToCaeWorkspace.js:103](../viewer/components/TextToCaeWorkspace.js:103)。它没有调用 `runCaeSimulation()`，也没有调用任何 MCP 工具，所以不会启动 Fluent、Abaqus、CalculiX 或 Peridigm。

### 5.3 首页 Fluent 数据是硬编码演示

速度 `22.0 m/s`、压力系数 `−0.84`、`CL=0.684`、`CD=0.041`、残差和迭代次数都直接写在 JSX 中。进度、日志、流场插图和“FLUENT GUI · LIVE”也没有来自作业状态的后端数据。文案中的“本地引擎在线”与 Fluent 许可证状态不构成能力检测。

### 5.4 前端 API 与 MCP 是两条未统一的通道

`caeProjectStore.js` 的 `/__cae/run` 直接由 Vite 中间件启动白名单内的 Abaqus 脚本，并等待脚本执行结束；它绕过 MCP，也没有统一的 `run_id`、异步状态、日志流、取消和验证阶段。CalculiX MCP 的工具虽然可被 AI 客户端调用，却没有被 Viewer 的首页连接起来。

### 5.5 建模、导入、参数和结果生命周期不完整

“导入新模型”、历史工程、设置、速度云图/压力云图/流线/网格质量标签，以及“打开工程目录”按钮大多没有 `onClick` 或数据源。右侧参数只存在 React 内存，刷新即丢失，也没有单位校验、CaseSpec 哈希或与求解输入文件的映射。

### 5.6 作业可靠性和证据层仍需补齐

需要补充统一的队列/进程管理、超时、重试、取消、并发限制、工作区隔离、日志尾读、异常分类、软件版本记录、许可证检查、结果完整性校验和权限边界。当前 Vite 中间件适合本地开发演示，不适合作为多用户或长期作业服务。

### 5.7 求解器结果协议还需要统一

CalculiX、Peridigm、Abaqus 和 Fluent 各自有不同字段、拓扑、时间帧和单位。现有导出器可以生成可显示的数据，但缺少统一的 schema 版本治理、单位元数据、字段字典、验证状态、来源哈希和大结果分页/压缩策略。对于 Fluent 还没有实际的结果解析器和轻量化导出器。

## 6. 建议的落地顺序

1. **先固定协议**：定义 `CaseSpec`、`JobStatus`、`ResultManifest` 和 `result_mesh` schema，包含单位、字段语义、来源、验证和版本。
2. **先打通一个开源后端**：用 CalculiX 作为端到端参考实现，复用 MCP 的解析、求解、结果读取和导出工具；先实现“对话 → MCP → ccx → Viewer”。
3. **把首页按钮接入真实作业 API**：按钮提交 CaseSpec，API 返回 `run_id`，前端用轮询或 SSE 获取状态、日志和结果，而不是本地 `setTimeout`。
4. **增加 Agent 编排层**：解析 NLP、补问缺失参数、读取 Skill、调用 MCP 工具、请求确认，并把每一步记录到 run evidence。
5. **再接商业软件**：为 Fluent/Abaqus 等分别实现 bridge、许可证检查、原生结果解析和 `ResultManifest` 适配器，不把软件私有格式泄漏到 Viewer。
6. **最后做生产化**：任务队列、权限、取消、断点恢复、结果存储、压缩/分块传输、审计和端到端测试。

## 7. 验收标准

一条链路只有同时满足以下条件，才可称为“全自动仿真”完成：

- NLP 请求被解析成可审阅且带单位的 CaseSpec；
- Agent 实际调用了目标 MCP 工具，并记录工具输入/输出；
- CAE 软件产生了可验证的原生求解日志和结果；
- 结果适配器完成字段、拓扑、单位和完整性检查；
- Viewer 加载的是本次 `run_id` 对应的轻量数据，而不是硬编码示例；
- 页面能区分 `queued/running/failed/succeeded/verified`，并展示失败原因；
- 报告和回放数据保留来源、版本、哈希与验证边界。

在这些条件满足前，首页的“启动全自动仿真”应标注为“界面原型”或“演示模式”，避免把静态数字和状态动画误认为真实 CAE 计算结果。
