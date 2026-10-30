# CAE MCP 接入清单：软件分类、连接方式与输入参数

本文依据当前仓库 `MCP/` 下的服务入口、工具函数、调用实现及相关说明整理，统计的是代码覆盖范围，不代表当前机器上的软件均已安装、授权或连接成功。本次为静态代码核对，未逐一启动软件验证。

## 1. 数量与统计口径

按软件／产品组去重，仓库覆盖 **19 项：7 项开源软件或开源调用路径、12 项商业软件／产品组**。其中包含建模、前处理和后处理工具，不能表述为“19 个求解器”。

- **16 项**有项目自身的适配入口；另外 **CFX、MAPDL、Lumerical 3 项**来自收录的 PyAnsys 源码。
- Abaqus 与 Abaqus 2020 兼容版本合并统计。
- Fluent、AEDT、Mechanical 的自建适配器与 PyAnsys 适配器合并统计。
- Workbench／Mechanical 合并为一个产品组。
- HyperWorks 按一个产品组统计，包含直接提交 OptiStruct、Radioss 的能力，不再重复累计这些求解器。
- FreeCAD、ParaView、ANSA 等纳入工具覆盖统计，但不计作独立求解器。
- Gmsh 作为 Elmer 链路的网格依赖，没有另算独立 MCP 接入。
- MCP 公共基础库、Skill 指令和仅用于结果回放的数据，不单独计为软件接入。

[PyAnsys 收录说明](../MCP/Ansys/PyAnsys/README.md)说明，该目录为上游源码快照；源码已收录不等于本工程已完成所有产品的运行集成与验证。

## 2. 开源部分：7 项

以下字段是代码实际暴露的代表性参数，并非完整工具 Schema。物理参数的可用范围仍受具体工具、模板及软件能力限制。

| 软件 | MCP 后面如何连接软件 | 接收的输入及代表参数 |
| --- | --- | --- |
| [CalculiX](../MCP/CalculiX/mcp_server.py) | **文件＋命令行**，执行 `ccx -i …` | `.inp` 输入文件：`path, timeout`；修改设计变量：`var_id, new_value`；结果导出：`inp_path, dat_path, mode` |
| [LAMMPS](../MCP/LAMMPS/server.py) | **输入脚本文件＋命令行** | `input_path, run_dir, lammps_exe, extra_args, timeout_sec`；势函数、模型数据等由输入脚本引用 |
| [Peridigm](../MCP/Peridigm/server.py) | **结构化规格→生成文件→求解进程／MPI** | 先选择模板、补全并确认规格，再以 `run_id, timeout_seconds` 提交；内部生成 `input.yaml` 和模型数据。目前限定两个模板 |
| [FreeCAD](../MCP/FEP-Agent-Hub/mcp/freecad/src/freecad_mcp/server.py) | **结构化工具调用＋受控 Runner**，用于建模 | `project, feature_type, name, parameters, placement`；打开 `.FCStd`，导出 `.step` |
| [Elmer FEM](../MCP/FEP-Agent-Hub/mcp/elmer/src/elmer_mcp/server.py) | **结构化参数→网格／SIF 文件→原生求解程序** | STEP 路径、`material`、`settings`、`selector/condition`；运行参数 `mode, processes, timeout` |
| [ParaView](../MCP/FEP-Agent-Hub/mcp/paraview/src/paraview_mcp/server.py) | **受控后处理会话／worker**，不负责求解 | 数据文件 `path`，默认 `.vtu`；`filter_type, parameters, array, camera`；图片、CSV、动画输出路径 |
| [OVITO](../MCP/OVITO/server.py) | **Python 脚本文件＋解释器进程**，用于粒子后处理 | `script_path, run_dir, script_command, timeout_sec`；轨迹文件由脚本读取 |

**OVITO 的分类边界：**这里按可使用的 MIT 许可 Python 模块路径归入开源部分；OVITO Pro 桌面版属于商业软件，仓库适配器也可使用其解释器，具体取决于运行配置。不能由适配器名称推断实际使用的版本和许可证。[官方许可说明](https://www.ovito.org/manual/licenses/index.html)

## 3. 商业部分：12 项

分类依据是底层 CAE 产品，不是 MCP 适配器源码的许可证。开源的 Python SDK 或 MCP 服务不意味着其调用的商业求解器可免费使用。

| 软件／产品组 | MCP 后面如何连接软件 | 接收的输入及代表参数 |
| --- | --- | --- |
| [Abaqus](../MCP/Abaqus/mcp_server.py) | **本地 TCP Socket→CAE 内插件→Python API** | `run_python(code)`、`execute_script(script)` 接收代码字符串；提交已有任务用 `job_name`；读取结果用 `odb_path` |
| [Ansys Fluent](<../MCP/Ansys/Fluent MCP/server.py>) | **Journal 批处理＋PyFluent 会话 API** | 文件方式：`journal_path, cwd, processor_count, dimension, precision`；会话方式：`session_id` 配合 Python `code`、TUI `command` 或 Scheme `expression` |
| [Workbench／Mechanical](<../MCP/Ansys/Workbench MCP/server.py>) | **Journal／脚本批处理＋队列、Socket、会话桥接** | `journal_path`、`script_path`、`project_file`、`geometry_path`；结构化 `spec`；会话中的 `code`、`analysis_names` |
| [Ansys AEDT](<../MCP/Ansys/AEDT MCP/mcp_server.py>) | **PyAEDT API＋桌面会话连接** | 连接：`pid, port, machine`；工程：`project_path, design_name`；脚本：`code/script_path`；求解：`setup_name, num_cores, num_tasks, num_gpus` |
| [COMSOL](../MCP/COMSOL/mcp_server.py) | **MPh 会话＋COMSOL 桥接／mphserver 接口** | `.mph` 路径；连接 `host, port`；模型参数 `name, value`；求解 `study/study_tag`；结果表达式 `expression, dataset, unit` |
| [CST Studio Suite](../MCP/CST/mcp_server.py) | **CST Python API**，另有 runtime 工具入口 | `.cst` 工程路径；`pid_or_address`；`vba_code`、Python `code`；参数扫描用 `project_path, parameters` |
| [ANSA](../MCP/ANSA/src/ansa_mcp/server.py) | **本地 Socket→ANSA 内桥→原生 API**，主要负责前处理 | `entity_type, entity_id, fields/values`；通用操作 `operation, parameters`；Python 步骤 `code`；修改操作还带会话标识和确认字段 |
| [HyperWorks](../MCP/HyperWorks/src/hyperworks_mcp/server.py) | **HyperMesh 内嵌桥＋求解器批处理＋后处理接口** | CAD／`.hm` 文件、实体及载荷参数；模板 `template_id, parameters`；提交 `solver, input_file, ncpu`，目前直接支持 **OptiStruct、Radioss** |
| [Adams](../MCP/Adams/src/adams_mcp/server.py) | **结构化建模→命令文件批处理**；另有 live Socket 入口 | 刚体 `mass, inertia, corner, size`；关节、重力与运动函数；求解 `end_time, steps`；也可传 `.cmd` 的 `cmd_path`。文档标明 live 连接尚未验证 |
| [Ansys MAPDL](../MCP/Ansys/PyAnsys/pymapdl-mcp/src/ansys/mapdl/mcp/tools.py) | **收录的 PyMAPDL 会话接口** | 连接 `ip, port`；APDL `cmd`、Python `code`；上传 `file_path`，恢复模型 `file_name, extension` |
| [Ansys CFX](../MCP/Ansys/PyAnsys/pycfx-mcp/src/ansys/cfx/mcp/cfx/__init__.py) | **收录的 CFX backend／工作流接口** | `connect_kwargs`、`cfx_workflow(action, params)`、`run_code(code)`；求解阶段需要 `.def` 输入文件 |
| [Ansys Lumerical](../MCP/Ansys/PyAnsys/pylumerical-mcp/src/ansys/lumerical/mcp/tools.py) | **持久 Python 子进程＋产品 API** | `name, product, filename`；产品可选 `fdtd/mode/device/interconnect`；工程文件 `.fsp/.lms/.ldev/.icp`，执行参数为 Python `code` |

## 4. “文件接入”和“接口接入”的区别

MCP 是外层统一调用协议，主要入口采用 stdio；它并不意味着 CAE 软件本身提供 HTTP API。工具接收 JSON 参数后，仍需由适配器转换为软件支持的调用方式。

```text
客户端 → MCP 工具名＋JSON 参数
               ↓
       文件＋命令行 / SDK API / 软件内插件桥
               ↓
             CAE 软件
```

| 接入类型 | 平台传入什么 | 适配器执行什么 | 代表软件 |
| --- | --- | --- | --- |
| 文件／批处理 | 输入文件或脚本路径、工作目录、超时等 | 启动软件命令行，收集日志和结果 | CalculiX、LAMMPS；Fluent、Adams 的批处理路径 |
| API／脚本会话 | 结构化参数、代码字符串、会话标识 | 调用 SDK 或向现有软件会话发出操作 | AEDT、COMSOL、CST、Lumerical |
| 软件内桥接 | 实体参数、代码、操作名及会话校验信息 | 经 Socket 或队列传入软件内部执行 | Abaqus、ANSA、HyperMesh；Workbench／Mechanical 的桥接路径 |
| 模板驱动 | 已定义的几何、材料、边界、载荷与求解参数 | 校验规格，生成原生输入，再调用软件 | Peridigm、Elmer；HyperWorks 的分析模板 |

同一软件可以同时支持多种路径，不能简单按“有接口／只有文件”二分。

表中的 `path`、`input_file`、`script_path` 等通常是**执行端能够访问的文件路径**，并不等同于已经实现浏览器上传。教学平台还需要接收上传文件、放入对应作业目录，并把执行节点可访问的路径传给工具。远程执行时，还需处理文件传输或共享存储。

## 5. 仓库覆盖范围与教学网页接入范围

[Viewer 后端](../viewer/vite.config.mjs)明确有 CalculiX、Abaqus 的真实执行调用，采用启动脚本／子进程的方式；不能据此认为网页已经通过 MCP 接通上述全部 19 项。

需要区分三个层次：

1. **源码已有适配器**：本清单统计的范围，包括收录的上游源码。
2. **运行环境已连接并验证**：还需软件安装、匹配版本、许可证、可执行路径、桥接插件和实际算例验证。
3. **教学平台已集成**：还需网页入口、文件管理、统一作业状态、权限隔离及资源调度。

从当前代码出发，后续平台集成应为不同适配器保留文件、参数和会话三类输入，避免假设所有 CAE 都接收同一种工程文件或同一个 HTTP 接口。课堂多人并发的部署与扩容要求参见[教学平台方案](ai-cae-case-teaching-platform.zh-CN.md)。
