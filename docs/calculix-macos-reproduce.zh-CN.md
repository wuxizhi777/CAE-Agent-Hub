# CalculiX 在本机 Mac 上的实际复现

核验日期：2026-10-29。本说明区分已经完成的本机求解与尚未实现的网页功能。

## 1. 本机目前安装了什么

| 项目 | 本机实际情况 |
| --- | --- |
| 仓库 | `/Users/wuxizhi/code/CAE-Agent-Hub` |
| CalculiX 可执行文件 | `/Users/wuxizhi/anaconda3/envs/cae-calculix/bin/ccx` |
| 求解器版本 | 2.20，已执行 `ccx -v` 确认 |
| 用于桥接的 Python | Conda 环境中的 Python 3.11.0 |
| 系统当前 `python3` | Python 3.12.10，与上述环境不是同一个解释器 |
| 本机 `~/ccx-env/bin/ccx` | 未找到 |
| 当前仓库 `viewer/ccx-lab.html` | 不存在 |

本机无需重新编译或安装求解器即可复现下面的算例。说明中所说的“源码编译到 `~/ccx-env`、版本 2.23、Python 3.13、打开 ccx-lab 页面”不对应当前检查到的本机环境。

## 2. 已完成的真实求解

在全新作业目录生成输入后，实际启动本机 `ccx -i cantilever`。结果如下：

| 梁长 / 截面 | 总载荷 | 最大位移 | 最大 von Mises 应力（积分点） |
| --- | --- | --- | --- |
| 120 mm / 8 × 8 mm | 100 N | 0.688739261 mm | 107.399163315 MPa |
| 120 mm / 8 × 8 mm | 200 N | 1.377478921 mm | 214.798326579 MPa |

两个模型都是线性静力模型：625 个节点、384 个 C3D8 实体单元；左端固定，右端沿 -Z 分布施加总载荷；弹性模量为 210000 MPa，泊松比为 0.3。载荷加倍时应力与位移约加倍，符合该模型的线性响应。

这是真实求解及基本一致性检查，不是完整的工程精度验证。此处应力是原始应力分量计算出的积分点 von Mises 最大值；不要直接等同于节点外推峰值或简单梁公式的截面极纤维应力。

首次固定输入复现目录：`/Users/wuxizhi/cae-runs/verified-cantilever-j_igedii`。

使用新脚本的复现目录：

- 100 N：`/Users/wuxizhi/cae-runs/cantilever-fw_h6fqt`
- 200 N：`/Users/wuxizhi/cae-runs/cantilever-3ow6a5j5`

## 3. 自己重新跑一遍

在终端执行：

```bash
conda activate cae-calculix
cd "$HOME/code/CAE-Agent-Hub/MCP/CalculiX"
export CCX_EXE="$CONDA_PREFIX/bin/ccx"
export OMP_NUM_THREADS=1
python -V
"$CCX_EXE" -v
python run_cantilever_demo.py
```

最后一条命令就是重新计算，不读取之前保存的结果。它会：

1. 在 `~/cae-runs/` 下创建新的 `cantilever-…` 作业目录。
2. 根据参数生成 `cantilever.inp`，不改写仓库案例。
3. 调用本机 `ccx`，等待求解完成，最长 300 秒。
4. 检查求解状态及 `.sta` 数据行，再读取 `.dat`。
5. 确认存在有限且非零的位移、应力，导出 `result_mesh.json`。
6. 打印本次目录、最大位移和最大应力。

如果终端的 Conda 激活存在问题，也可以直接指定已经验证的绝对路径运行：

```bash
/Users/wuxizhi/anaconda3/envs/cae-calculix/bin/python \
  /Users/wuxizhi/code/CAE-Agent-Hub/MCP/CalculiX/run_cantilever_demo.py \
  --ccx /Users/wuxizhi/anaconda3/envs/cae-calculix/bin/ccx
```

## 4. 修改参数，再计算

在已激活的环境和 `MCP/CalculiX/` 目录下，把总载荷改为 200 N：

```bash
python run_cantilever_demo.py --load 200
```

改变梁长、截面、载荷、材料和网格：

```bash
python run_cantilever_demo.py \
  --length 150 --width 10 --height 8 \
  --load 100 --young 210000 --poisson 0.3 \
  --nx 30 --ny 4 --nz 4
```

第二组是可自行探索的参数示例，不对应上表已验证数值。参数单位：

| 参数 | 含义 | 默认值 |
| --- | --- | --- |
| `--length` | 梁长，mm | 120 |
| `--width` | 截面 Y 向宽度，mm | 8 |
| `--height` | 截面 Z 向高度，mm | 8 |
| `--load` | 端面沿 -Z 的总载荷，N | 100 |
| `--young` | 弹性模量，MPa | 210000 |
| `--poisson` | 泊松比 | 0.3 |
| `--nx --ny --nz` | 沿三个方向的单元数量 | 24、4、4 |

载荷会按端面节点数量平均分配。因此改变网格不会改变指定的总载荷。网格越细，计算量通常越大；此演示限制为最多 100000 个节点。模型类型固定为线弹性、小变形静力悬臂梁，不包括塑性或断裂。

## 5. 去哪里看结果

终端打印本次作业目录，其中包含：

| 文件 | 用途 |
| --- | --- |
| `parameters.json` | 本次实际输入参数和求解器路径 |
| `cantilever.inp` | 提交给 ccx 的模型输入 |
| `cantilever.dat` | 求解器输出的位移、应力等数值 |
| `cantilever.sta` | 求解步状态 |
| `cantilever.frd` | 求解器生成的后处理结果 |
| `run_status.json` | 执行状态、耗时及末尾日志 |
| `summary.json` | 解析后的最大位移、最大应力等指标 |
| `result_mesh.json` | 网页查看组件可使用的网格与结果数据 |

在 Finder 中按 Command + Shift + G，输入 `~/cae-runs` 即可查看各次结果。终端中的最大位移是真实数值；JSON 中的变形显示坐标可能包含自动放大倍率。

## 6. 为什么 ccx-lab 地址不能按描述使用

当前仓库没有 `ccx-lab.html`、相应表单页面或调用 CalculiX 的网页接口。访问 `/ccx-lab.html` 虽然返回 HTTP 200，但实际返回的是 Vite 的默认首页回退内容，不证明此页面存在。

当前实际接通的计算流程是：

```text
命令行参数 → 生成 .inp → Python 调用 ccx → 读取 .dat → 输出摘要和结果 JSON
```

若要实现网页操作，需要另外连接：

```text
网页表单 → 本机后端接口 → 上述求解流程 → 返回结果 → 三维查看组件
```

现有 `/__cae/run` 运行的是配置好的 Abaqus 案例，不是这个 CalculiX 脚本。Peridigm 回放页只接受材料点结果，也不能直接加载这里的有限元结果。本文没有实现网页端求解。

此外，“点击运行后等待求解完成并更新云图”与“计算中不断刷新云图”是两个不同功能；后者还需要增量输出和推送机制。当前命令行脚本在求解结束后读取完整结果。

新增复现脚本是本地文件：[run_cantilever_demo.py](../MCP/CalculiX/run_cantilever_demo.py)。尚未提交或推送到 GitHub；换电脑复现时，需要同时带上这个脚本。
