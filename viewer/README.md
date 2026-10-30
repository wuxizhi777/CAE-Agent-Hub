# Text to CAE Viewer

This is the browser workspace for the NLP → MCP → CalculiX → Viewer workflow.

```powershell
npm.cmd run dev
npm.cmd run build
```

Open `http://127.0.0.1:4178/cae-workspace/` for the CalculiX Agent workspace.
The root URL redirects here in both Vite dev and preview. It replaces the former Fluent
conversation mockup with a natural-language CaseSpec review, a CalculiX run
evidence panel, the existing demo tree, and the shared Three.js result viewer.
The real-run button calls `MCP/CalculiX/web_run.py` through the local Vite API;
set `CALCULIX_PYTHON` or `CCX_EXE` when `ccx` is not on `PATH`. For the Conda
environment used by the macOS demo:

```sh
export CALCULIX_PYTHON=/Users/wuxizhi/anaconda3/envs/cae-calculix/bin/python
npm run dev
```

The bridge finds `ccx` beside that interpreter and supplies the environment's
dynamic libraries automatically. Alternatively set `CCX_EXE` explicitly.
Recorded cases remain available in the tree even when CalculiX is not installed.

The app defaults to the CAE workspace and talks to local endpoints under `/__cae/*` provided by `vite.config.mjs`.

## Agentic PD replay entry

Open `/peridigm.html` after `npm ci` and `npm run dev`. Query `?demo=elastic` or `?demo=fracture` loads a curated, verified dataset from `models/peridigm-*`; no SSH, solver or private runtime files are required. `npm run build` emits these imports as static assets, so the demos also work when serving the build directory with a plain loopback HTTP server. The original index entry is retained.

`?result=/run/result_mesh.json` remains supported for a project-local, read-only run preview; loading a local result file is also supported. Demo replay never invokes a model or a solver. The shared viewer renders material points without invented FE elements and distinguishes Damage from displacement. See [Peridigm demo guide](../MCP/Peridigm/DEMO.md).

### Portable static preview / 跨平台静态预览

After building, run the following from `viewer/` (use `python3` if your platform requires it):

```sh
python ../MCP/Peridigm/scripts/serve_demos.py --directory dist --port 4179
```

Open `http://127.0.0.1:4179/peridigm.html`. The standard-library helper is read-only, loopback-only, and supplies correct JavaScript/JSON MIME types on Windows as well as Linux. It never starts a model or solver and disables stale local-preview caching. Ctrl+C stops this foreground preview.

## 工作台 DeepSeek 配置

打开 `/cae-workspace/`，在“模型配置”填写 Base URL、模型和 API Key，然后点击“用 DeepSeek 分析并生成 CaseSpec”。默认 Base URL 为 `https://api.deepseek.com`，模型为 `deepseek-flash`；模型名可编辑。接口依据 [DeepSeek Chat Completions 文档](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/)。

浏览器直接向配置的 HTTPS 地址发送请求，无需 `.env` 或后台密钥文件。“保存配置”使用当前标签页的 `sessionStorage`，刷新后可继续使用；“恢复默认”删除会话自定义配置并恢复内置默认值。模型配置默认收起，可点击“展开配置”查看和修改。按本地演示要求，Key 已预填在前端源码中，会随构建产物下发；API Key 与工程描述会发送至配置的服务，请确认地址。

模型输出工程分析、待补充问题、假设和校核建议。完整且匹配现有 CalculiX 悬臂梁模板的参数可用于人工确认后的求解；其他案例目前只提供分析建议，尚未接入模型到求解参数的自动映射。修改描述、配置、参数或切换案例后，需要重新分析。仅有模型回答不代表求解完成。

可用以下完整描述检查静力流程：

> 用 CalculiX 分析矩形钢梁，长 120 mm、宽 8 mm、高 8 mm，弹性模量 210000 MPa、泊松比 0.3，x=0 端固支，另一端面沿 -Z 均布总力 100 N，线弹性静力，输出应力和位移。

本地协议和参数校验测试：`node --test tests/deepseek.test.mjs`。这些测试使用模拟响应，不消耗模型额度，也不证明账户余额或真实模型可用。
