# CAE Agent Hub：Mac 本地安装与运行指南

本文根据 [wuxizhi777/CAE-Agent-Hub](https://github.com/wuxizhi777/CAE-Agent-Hub) 的实际源码编写，核对日期为 2026-10-28，对应提交 `56705e07ce6e99f0d5a0d0c7b5e28b6b2c0bc973`。命令适用于 macOS 的终端（bash / zsh），请按代码块逐步执行。

## 1. 先明确能跑到哪一步

这个仓库包含网页、多个独立 MCP 适配器、Skills 和案例数据，没有一个安装命令能同时装好所有 CAE 软件。

| 目标 | Mac 上的运行方式 | 额外依赖 |
| --- | --- | --- |
| 打开当前首页 | 启动 `viewer/` | Node.js、npm |
| 查看已保存的真实仿真结果 | 打开 `/peridigm.html` | 同上，无需求解器、AI API Key 或 SSH |
| 本地完成一次新的有限元计算 | 安装 CalculiX，执行本文进阶算例 | Python、CalculiX |
| 由 AI 调用仿真工具 | 在支持 stdio MCP 的 AI 客户端中注册适配器 | AI 客户端及其模型配置、对应求解器 |
| 运行 Fluent / Abaqus 商业求解流程 | 另行准备适配器支持的求解环境 | CAE 软件、许可证、桥接配置等 |

**当前首页存在功能边界：** `viewer/main.jsx` 加载的是 `TextToCaeWorkspace.js` 中的 FLUENT·OPS 界面。“启动全自动仿真”和聊天回复目前只修改 React 状态，没有调用真实 Fluent 或大模型。页面上的“本地引擎在线”、进度、气动力数字不能用作求解成功的证据。

`viewer/vite.config.mjs` 中另有 `/__cae/run` 接口，但它运行指定 Abaqus 案例，默认命令是 Windows 路径 `G:\SIMULIA\Commands\abaqus.bat`。启动网页不会自动把它转换成 Mac 求解环境。

第一次安装建议先完成第 2～5 节，确认网页和结果回放可用，再做第 7 节的真实求解。

## 2. 这台 Mac 的最短启动路径

编写本文时，本机已具备：

| 项目 | 检查结果 |
| --- | --- |
| 系统与架构 | macOS 12.7.6，`x86_64` |
| 源码目录 | `/Users/wuxizhi/code/CAE-Agent-Hub` |
| Node.js / npm | `v24.22.1` / `11.19.1` |
| 前端依赖 | `viewer/node_modules` 已存在 |
| 本地服务 | `127.0.0.1:4178` 已有服务监听，首页与回放页 HTTP 检查均为 200 |

可以先在浏览器打开：

- [当前首页](http://127.0.0.1:4178/)
- [弹性基准回放](http://127.0.0.1:4178/peridigm.html?demo=elastic)
- [损伤与裂纹回放](http://127.0.0.1:4178/peridigm.html?demo=fracture)

服务停止后，重新启动：

```bash
cd /Users/wuxizhi/code/CAE-Agent-Hub/viewer
npm run dev
```

保持这个终端窗口打开。若提示 4178 端口被占用，先访问已有服务，或按第 9 节换端口。

上述软件和服务状态是编写时的检查结果；重启电脑后需重新检查。已有可用 Node.js 时，无需重新安装 Homebrew 或 Node.js。

## 3. 从零准备运行环境

### 3.1 检查工具

打开 macOS 的“终端”，执行：

```bash
uname -m
sw_vers
git --version
node --version
npm --version
```

`arm64` 通常对应 Apple Silicon；`x86_64` 表示当前终端运行于 Intel 架构，Apple Silicon 上通过 Rosetta 启动的终端也可能显示此值。安装包应与实际使用的架构一致。

仓库使用 Vite 7。Node.js 20 至少需要 20.19，Node.js 22 至少需要 22.12；本文本机构建使用 Node.js 24.22.1。版本要求参见 [Vite 官方说明](https://vite.dev/guide/)。

如果 `git` 不存在，执行下面的命令，并在系统窗口中完成安装后继续：

```bash
xcode-select --install
```

### 3.2 仅在缺少 Node.js 时安装

可以从 [Node.js 官网](https://nodejs.org/en/download) 选择支持自己 macOS 版本和芯片架构的安装包。安装后新开终端，再检查 `node --version` 和 `npm --version`。

如果正在使用 Homebrew，且系统版本在其支持范围内，也可以执行：

```bash
brew install node@24
export PATH="$(brew --prefix node@24)/bin:$PATH"
node --version
npm --version
```

`export` 对当前终端生效；需要长期使用时，将同一行加入自己使用的 shell 配置文件（zsh 为 `~/.zshrc`，bash 登录 shell 为 `~/.bash_profile`）。

没有 Homebrew 时可按 [Homebrew 官方安装说明](https://brew.sh/) 安装。**本机为 macOS 12.7.6，低于当前 Homebrew 首页列出的支持版本，不建议为运行本项目重新安装整套工具链；优先使用已经能运行的 Node.js。**

## 4. 获取源码并安装网页依赖

### 4.1 首次下载

仅在尚无源码目录时执行：

```bash
mkdir -p "$HOME/code"
cd "$HOME/code"
git clone https://github.com/wuxizhi777/CAE-Agent-Hub.git
cd CAE-Agent-Hub
git rev-parse HEAD
```

已有源码则直接进入目录：

```bash
cd "$HOME/code/CAE-Agent-Hub"
git status --short
git remote -v
```

本机现有副本的 `origin` 指向 `Cai-aa/CAE-Agent-Hub`；编写时已通过 `git ls-remote` 核对，你提供的 `wuxizhi777` 仓库 HEAD 与本机提交一致。无需为了本文修改 remote，也不要在有本地改动时直接覆盖目录。

### 4.2 安装依赖

```bash
cd "$HOME/code/CAE-Agent-Hub/viewer"
npm ci
```

`npm ci` 按仓库已有的 `package-lock.json` 安装依赖，并重建 `node_modules`。本机已有依赖且启动正常时，可以跳过。安装需要访问 npm 包源；不要使用 `sudo npm ci`。

这里只安装网页依赖，不需要在仓库根目录执行 `pip install`，也不需要安装所有 MCP 模块。

## 5. 启动与验收

### 5.1 启动开发服务

必须在 `viewer/` 目录执行：

```bash
cd "$HOME/code/CAE-Agent-Hub/viewer"
npm run dev
```

默认地址为 `http://127.0.0.1:4178/`。浏览器地址应以终端实际输出为准。按 `Control + C` 停止服务。

### 5.2 查看已有结果

先打开轻量的弹性案例：

```text
http://127.0.0.1:4178/peridigm.html?demo=elastic
```

再打开损伤案例：

```text
http://127.0.0.1:4178/peridigm.html?demo=fracture
```

正常情况下，应看到案例选择按钮、材料点、已保存帧及验证信息。弹性案例包含 2 个材料点、6 个展示时刻；损伤案例包含 3,200 个材料点、31 个展示时刻。后者 JSON 约 23 MB，首次加载比弹性案例慢。

这些页面读取仓库里已计算的数据，浏览器没有重新执行 Peridigm 求解。页面上的“打开自己的 result_mesh.json”仅接受其支持的材料点数据，不能直接导入任意有限元结果。

### 5.3 检查 HTTP 服务

保持开发服务运行，在另一个终端执行：

```bash
curl --noproxy '*' -I http://127.0.0.1:4178/
curl --noproxy '*' -I 'http://127.0.0.1:4178/peridigm.html?demo=elastic'
```

返回 `200` 表示页面入口可访问；还需在浏览器确认模型加载、帧切换和渲染正常。HTTP 200 本身不证明 WebGL 渲染成功。

## 6. 构建后运行

在开发服务终端按 `Control + C`，然后执行：

```bash
cd "$HOME/code/CAE-Agent-Hub/viewer"
npm run build
npm run start
```

本仓库的 `start` 脚本是 `vite preview`，默认仍使用 4178 端口。`npm run start` 前必须先构建。它适合本地预览构建产物。

如果只需要静态回放，并且已经安装 Python 3，可改用仓库提供的只读服务：

```bash
cd "$HOME/code/CAE-Agent-Hub/viewer"
python3 ../MCP/Peridigm/scripts/serve_demos.py --directory dist --port 4179
```

浏览器打开：

```text
http://127.0.0.1:4179/peridigm.html?demo=fracture
```

静态服务不提供 Vite 的 `/__cae/*` 接口。不要直接双击 `dist/index.html`，应通过 HTTP 服务访问。

## 7. 可选：在 Mac 本地执行真实有限元计算

这一节使用开源 CalculiX 做悬臂梁计算，与首页的 Fluent 演示按钮独立。完成后可得到实际 `.dat`、求解状态与导出的结果 JSON。**2026-10-29 已在本机 Conda 环境的 ccx 2.20 和 Python 3.11 上完成真实求解及结果导出，并复算 100 N / 200 N 两组载荷。** 最新的一条命令复现方式、实际数值和网页功能边界见[本机复现记录](calculix-macos-reproduce.zh-CN.md)。

### 7.1 准备 Conda

如果已经有 Conda，直接检查：

```bash
conda --version
```

如果没有，可按 [Miniforge 官方说明](https://github.com/conda-forge/miniforge) 安装适合系统版本和架构的版本。安装完成后重新打开终端。Intel Mac 选择 `MacOSX-x86_64`，Apple Silicon 原生环境选择 `MacOSX-arm64`，不要混用架构。

### 7.2 安装 CalculiX 和 Python 依赖

[conda-forge 的 CalculiX 包](https://anaconda.org/conda-forge/calculix)提供 macOS Intel 和 ARM64 构建。创建独立环境：

```bash
conda create -n cae-calculix --override-channels -c conda-forge python=3.11 pip calculix
conda activate cae-calculix
python -m pip install 'mcp>=1.0,<1.8' 'meshio>=5.3' 'numpy>=1.26' 'python-dotenv>=1.0,<2' 'pydantic>=2.7.2,<2.11' 'pydantic-settings>=2.5.2,<2.9'
command -v python
command -v ccx
```

基础依赖约束取自仓库 `MCP/CalculiX/pyproject.toml`，本文额外限制 Pydantic 及 settings 的版本：2026-10-29 实际安装发现 MCP 1.7.1 搭配 Pydantic 2.14.1 会出现 `cannot import name 'eval_type_backport'`，因此采用 Pydantic 2.10 系列的兼容组合。若 Conda 报平台、系统版本或依赖不兼容，应依据报错调整兼容版本，不能把上述命令视为对所有 macOS 版本的保证。

**激活环境不等于安装 Python 依赖。** 即使提示符已经显示 `(cae-calculix)`，上面的 `python -m pip install ...` 也必须成功完成。若环境已存在，跳过 `conda create`，继续执行激活和依赖安装即可。安装失败时，先解决下载或代理问题，再运行健康检查。

设置当前终端的求解器路径并检查适配器：

```bash
export CCX_EXE="$(command -v ccx)"
export OMP_NUM_THREADS=1
cd "$HOME/code/CAE-Agent-Hub/MCP/CalculiX"
python -c 'import json; from mcp_server import fea_health; print(json.dumps(fea_health(), indent=2))'
```

检查 `meshio_available` 为 `true`，且 `ccx_exe` 是实际可执行文件路径。仅看到 `status: ok` 不足以说明求解器已安装，因为健康检查在未找到 `ccx` 时也会返回这个状态。

### 7.3 运行独立悬臂梁算例

保持 `cae-calculix` 环境激活，在 `MCP/CalculiX/` 下执行下面整段代码。每次创建新的作业目录，避免旧结果干扰成功判定：

```bash
python - <<'PY'
import json
import shutil
import tempfile
from pathlib import Path
from mcp_server import run_solver_tool, read_results_tool, export_results_tool

jobs = Path.home() / "cae-runs"
jobs.mkdir(exist_ok=True)
job = Path(tempfile.mkdtemp(prefix="cantilever-", dir=jobs))
inp = job / "cantilever.inp"
shutil.copy2(Path("examples/cantilever.inp"), inp)

run = run_solver_tool(str(inp), timeout=300)
(job / "run_status.json").write_text(json.dumps(run, indent=2), encoding="utf-8")
print(json.dumps(run, indent=2))
if run["status"] != "ok":
    raise SystemExit("求解失败，请检查 run_status.json 中的 errors 和 stdout_tail")

dat = Path(run["dat_path"])
if not dat.is_file() or not dat.stat().st_size:
    raise SystemExit("缺少非空 .dat，不能把网格导出当作求解成功")

summary = read_results_tool(str(dat))
(job / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
print(json.dumps(summary, indent=2))
if summary.get("status") != "ok":
    raise SystemExit("结果读取失败，请检查 summary.json")

exported = export_results_tool(
    inp_path=str(inp),
    dat_path=str(dat),
    out_path=str(job / "result_mesh.json"),
)
print(json.dumps(exported, indent=2))
print("本次作业目录：", job)
PY
```

执行后检查终端打印的 `~/cae-runs/cantilever-…/` 目录，应包含输入文件、`.dat`、`run_status.json`、`summary.json` 和 `result_mesh.json` 等结果。检查求解状态、日志与非空数值结果，不要只看进程退出码。

当前首页未挂载通用有限元结果查看组件；`peridigm.html` 也只接受材料点结果。因此，这一步的验收是“真实求解并导出文件”，不是“首页自动显示 CalculiX 云图”。显示这类有限元结果还需要接入仓库中的 `CaeResultViewer` 组件，或使用兼容的后处理工具。

## 8. 可选：将 CalculiX 注册到 AI 客户端

先完成上一节，确保独立求解成功，再配置支持 **stdio MCP** 的客户端。

在 `cae-calculix` 环境中执行，取得真实绝对路径：

```bash
python -c 'import sys; print(sys.executable)'
command -v ccx
```

仓库提供 JSON 示例：`MCP/CalculiX/examples/mcp_config.example.json`。对于采用此结构的客户端，将已有配置与下面的条目合并，替换所有占位路径：

```json
{
  "mcpServers": {
    "calculix-mcp-server": {
      "command": "/替换为实际环境路径/bin/python",
      "args": ["/Users/你的用户名/code/CAE-Agent-Hub/MCP/CalculiX/mcp_server.py"],
      "env": {
        "CCX_EXE": "/替换为实际环境路径/bin/ccx",
        "OMP_NUM_THREADS": "1"
      }
    }
  }
}
```

不同客户端配置位置和格式不同；不是所有客户端都直接接受这个 JSON。不要覆盖其他服务器配置。GUI 客户端不一定继承终端的 Conda 环境，所以这里使用 Python 和 `ccx` 的绝对路径。传给工具的模型路径也使用绝对路径。

连接后先让客户端调用 `fea_health`，再执行 `parse_inp`、`run_solver_tool`、`read_results_tool`、`export_results_tool`。例如：

```text
使用 CalculiX MCP。先调用 fea_health 检查环境。
将仓库 examples/cantilever.inp 复制到新的独立作业目录，
解析模型、运行求解、读取实际 .dat，并导出 result_mesh.json。
报告真实路径、求解状态、位移和应力结果；失败时报告日志，停止后续步骤。
```

MCP 服务通过标准输入输出与客户端通信，不是 HTTP 网站。直接执行 `python mcp_server.py` 后没有网页或一直等待输入，是正常现象。Skills 是工作流指令，不会代替 Python 依赖、求解器或许可证。

## 9. 常见问题

### 已激活 Conda，但提示 No module named 'mcp'

说明当前 Python 无法找到 `mcp` 包。先确认解释器路径，再把依赖安装到同一个 Python 中：

```bash
conda activate cae-calculix
python -c 'import sys; print(sys.executable)'
python -m pip install 'mcp>=1.0,<1.8' 'meshio>=5.3' 'numpy>=1.26' 'python-dotenv>=1.0,<2' 'pydantic>=2.7.2,<2.11' 'pydantic-settings>=2.5.2,<2.9'
python -m pip check
```

解释器路径应包含 `envs/cae-calculix/`。使用 `python -m pip` 可确保安装目标与运行脚本的 Python 一致；确认安装成功后，再执行第 7.2 节的 `fea_health` 检查。

### 提示 4178 端口已被占用

先查看占用进程：

```bash
lsof -nP -iTCP:4178 -sTCP:LISTEN
```

如果已有服务就是本项目，直接使用它。也可以在另一个端口启动：

```bash
cd "$HOME/code/CAE-Agent-Hub/viewer"
npm run dev -- --port 4180
```

此后访问 `http://127.0.0.1:4180/peridigm.html?demo=elastic`。仓库配置了 `strictPort: true`，端口占用时会退出，不会自动换端口。

### 提示找不到 package.json 或 vite

确认位于 `viewer/`，且依赖已经安装：

```bash
cd "$HOME/code/CAE-Agent-Hub/viewer"
pwd
npm ci
npm run dev
```

### npm ci 报锁文件与 package.json 不一致

先检查本地改动：

```bash
git diff -- package.json package-lock.json
```

确认依赖变更是预期的后才执行 `npm install` 更新锁文件。不要为解决安装问题随意删除仓库锁文件或强制升级全部依赖。

### Git 或 npm 提示无法连接 127.0.0.1:7897

这通常是本机代理没有启动或端口不匹配，不是项目本身报错。检查正在使用的代理配置：

```bash
git config --get http.proxy
git config --get https.proxy
npm config get proxy
npm config get https-proxy
```

启动原有代理，或根据实际网络环境修正配置后重试；不要把含账号、密码或令牌的代理地址贴到公开日志。访问本地网站时，前文的 `curl --noproxy '*'` 可绕过代理。

### 首页显示运行中，但没有启动 Fluent

这是当前首页代码的行为。它的按钮没有连接真实求解后端，也没有配置 AI 模型 API 的入口。反复安装 npm 依赖不会补齐这条链路。

### 首页链接加了 caeDir，仍然看不到有限元模型

当前首页没有调用 `caeProjectStore.js` 中的加载函数，单独添加 `?caeDir=...` 不会自动挂载结果查看器。请先使用明确可用的 `/peridigm.html?demo=elastic` 回放入口。

### 回放页面空白或模型加载失败

确认使用 HTTP 地址、服务终端仍在运行，先尝试弹性小案例；再查看浏览器控制台和 Network 中是否有资源请求失败或 WebGL 错误。损伤案例较大，需要等到加载完成。

### 构建出现 lucide-react sourcemap 提示

本机 `npm run build` 出现了两条 sourcemap 定位提示，但最终显示 `built`，退出码为 0，成功生成 `dist/index.html` 和 `dist/peridigm.html`。判断是否构建失败应结合最后的结果和退出码。

## 10. 本文的验证范围

- 已核对给定 GitHub 仓库 HEAD 与本机源码提交一致。
- 已检查前端入口、启动脚本、Vite 接口及 CalculiX 适配器签名。
- 已在本机 macOS 12.7.6、Node.js 24.22.1 环境完成 `npm run build`。
- 已检查已有服务的首页与 Peridigm 回放入口均返回 HTTP 200。
- 2026-10-29 已在现有 `cae-calculix` 环境补齐 Python 依赖，验证 MCP 1.7.1、Pydantic 2.10.6、pydantic-settings 2.8.1 可导入；`fea_health` 检测到 meshio 和已有的 `ccx`，`pip check` 通过。
- 2026-10-29 已实际运行 CalculiX 悬臂梁算例并导出结果；100 N 时最大位移为 0.688739261 mm、最大积分点 von Mises 应力为 107.399163315 MPa，200 N 时两者约加倍。
- 未执行浏览器图形交互验收，未重新安装前端依赖或求解器二进制，未运行 Fluent / Abaqus 求解；未实现 `ccx-lab.html` 网页求解入口。

相关仓库说明：[项目 README](../README.zh-CN.md)、[Viewer](../viewer/README.md)、[CalculiX MCP](../MCP/CalculiX/README.zh-CN.md)、[Peridigm 演示说明](../MCP/Peridigm/DEMO.md)。后续源码变化时，应重新核对入口和依赖。
