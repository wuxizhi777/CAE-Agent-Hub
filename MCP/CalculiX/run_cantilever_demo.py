#!/usr/bin/env python3
"""Run the repository's solid cantilever benchmark in a fresh job directory.

Units: mm, N, MPa, tonne. This is a linear static C3D8 example, not a web server.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
from pathlib import Path
import tempfile


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--length", type=float, default=120, help="梁长，mm")
    parser.add_argument("--width", type=float, default=8, help="截面宽度，mm")
    parser.add_argument("--height", type=float, default=8, help="截面高度，mm")
    parser.add_argument("--load", type=float, default=100, help="沿 -Z 的端面总载荷，N")
    parser.add_argument("--young", type=float, default=210000, help="弹性模量，MPa")
    parser.add_argument("--poisson", type=float, default=0.3)
    parser.add_argument("--nx", type=int, default=24)
    parser.add_argument("--ny", type=int, default=4)
    parser.add_argument("--nz", type=int, default=4)
    parser.add_argument("--ccx", help="ccx 的绝对路径；也可设置 CCX_EXE")
    parser.add_argument("--output-root", type=Path, default=Path.home() / "cae-runs")
    args = parser.parse_args()
    for name in ("length", "width", "height", "load", "young"):
        value = getattr(args, name)
        if not math.isfinite(value) or value <= 0:
            parser.error(f"--{name} 必须是有限正数")
    if not math.isfinite(args.poisson) or not -1 < args.poisson < 0.5:
        parser.error("--poisson 必须在 -1 与 0.5 之间")
    if min(args.nx, args.ny, args.nz) < 1:
        parser.error("网格数量必须为正整数")
    if (args.nx + 1) * (args.ny + 1) * (args.nz + 1) > 100000:
        parser.error("本演示限制为最多 100000 个节点")
    # The existing generator writes coordinates with three decimal places.
    if min(args.length / args.nx, args.width / args.ny, args.height / args.nz) < 0.001:
        parser.error("网格间距必须至少为 0.001 mm，以匹配生成器坐标精度")
    if args.ccx:
        os.environ["CCX_EXE"] = str(Path(args.ccx).expanduser().resolve())
    os.environ.setdefault("OMP_NUM_THREADS", "1")

    from mcp_server import export_results_tool, read_results_tool, run_solver_tool
    from tools.solver import detect_ccx

    executable = detect_ccx()
    if not executable or not os.access(executable, os.X_OK):
        parser.error("未找到可执行的 ccx；请设置 CCX_EXE 或 --ccx")
    generator_path = Path(__file__).resolve().parent / "examples" / "gen_cantilever.py"
    spec = importlib.util.spec_from_file_location("cantilever_generator", generator_path)
    generator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(generator)
    generator.L, generator.W, generator.H = args.length, args.width, args.height
    generator.NX, generator.NY, generator.NZ = args.nx, args.ny, args.nz
    generator.E, generator.NU = args.young, args.poisson
    generator.P_PER_NODE = args.load / ((args.ny + 1) * (args.nz + 1))

    root = args.output_root.expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    job = Path(tempfile.mkdtemp(prefix="cantilever-", dir=root))
    print(f"作业目录：{job}", flush=True)
    parameters = vars(args).copy()
    parameters["output_root"] = str(root)
    parameters["ccx"] = executable
    parameters["units"] = {"length": "mm", "load": "N", "stress": "MPa"}

    def save(name: str, payload: dict) -> None:
        (job / name).write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    save("parameters.json", parameters)
    inp = generator.main(job / "cantilever.inp")
    run = run_solver_tool(str(inp), timeout=300)
    save("run_status.json", run)
    if run["status"] != "ok" or not run["sta_has_data"]:
        raise SystemExit(f"求解失败，请查看 {job / 'run_status.json'}")
    summary = read_results_tool(run["dat_path"])
    save("summary.json", summary)
    for key in ("max_disp", "max_stress_vm"):
        value = summary.get(key)
        if summary.get("status") != "ok" or value is None or not math.isfinite(value) or value <= 0:
            raise SystemExit(f"缺少有效结果 {key}，请查看 summary.json 和原始 .dat")
    export_results_tool(inp_path=str(inp), dat_path=run["dat_path"], out_path=str(job / "result_mesh.json"))
    print(f"求解成功，ccx 用时 {run['elapsed']} 秒")
    print(f"最大位移：{summary['max_disp']:.9f} mm")
    print(f"最大 von Mises 应力（积分点）：{summary['max_stress_vm']:.9f} MPa")
    print(f"结果文件：{job / 'result_mesh.json'}")


if __name__ == "__main__":
    main()
