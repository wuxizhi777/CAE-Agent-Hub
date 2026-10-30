#!/usr/bin/env python3
"""Run one bounded CalculiX cantilever case for the local Viewer API.

The browser never invokes a solver directly. Vite starts this process with a
JSON request, and this script returns one JSON response containing the verified
summary and the lightweight result mesh.
"""
from __future__ import annotations

import contextlib
import io
import json
import math
import os
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "examples"))


def configure_calculix_environment() -> str:
    """Prefer ccx beside the Python interpreter used by the web bridge.

    Conda's macOS build keeps CalculiX's dependent dylibs in the environment's
    ``lib`` directory. Supplying that directory is required when the Vite
    process was not started from an activated Conda shell.
    """
    configured = os.environ.get("CCX_EXE", "").strip()
    if not configured:
        sibling = Path(sys.executable).resolve().parent / "ccx"
        if sibling.is_file() and os.access(sibling, os.X_OK):
            configured = str(sibling)
            os.environ["CCX_EXE"] = configured
    if configured:
        lib_dir = Path(configured).resolve().parent.parent / "lib"
        if lib_dir.is_dir():
            old = os.environ.get("DYLD_LIBRARY_PATH", "")
            os.environ["DYLD_LIBRARY_PATH"] = ":".join(filter(None, [str(lib_dir), old]))
    return configured


def main() -> int:
    raw = sys.stdin.read() or "{}"
    params = json.loads(raw)
    length = float(params.get("length_mm", 120))
    width = float(params.get("width_mm", 8))
    height = float(params.get("height_mm", 8))
    load = float(params.get("load_n", 100))
    young = float(params.get("youngs_modulus_mpa", 210000))
    poisson = float(params.get("poissons_ratio", 0.3))
    if not all(math.isfinite(v) and v > 0 for v in (length, width, height, load, young)):
        raise ValueError("geometry, load and material values must be finite and positive")
    if not -1 < poisson < 0.5:
        raise ValueError("poissons_ratio must be between -1 and 0.5")

    case_id = str(params.get("case_id", "calculix-cantilever"))
    analysis = str(params.get("analysis", "modal" if case_id == "calculix-modal" else "static"))
    if case_id == "calculix-modal" or analysis == "modal":
        from examples import gen_cantilever_modal as generator
    else:
        from examples import gen_cantilever as generator
    from tools.result_exporter import export_result_mesh
    from tools.solver import detect_ccx, read_results, run_solver

    configure_calculix_environment()
    executable = detect_ccx()
    if not executable:
        raise RuntimeError("未找到 ccx。请安装 CalculiX，或设置 CCX_EXE 指向可执行文件。")

    generator.L = length
    generator.W = width
    generator.H = height
    generator.E = young
    generator.NU = poisson
    if analysis != "modal":
        generator.P_PER_NODE = load / ((generator.NY + 1) * (generator.NZ + 1))

    job_root = Path(os.environ.get("CAE_WEB_RUN_ROOT", str(ROOT / "../../.cae-web-runs"))).resolve()
    job_root.mkdir(parents=True, exist_ok=True)
    job = Path(tempfile.mkdtemp(prefix="calculix-", dir=job_root))
    inp = job / "cantilever.inp"
    with contextlib.redirect_stdout(io.StringIO()):
        generator.main(inp)
    run = run_solver(str(inp), timeout=300)
    if run.get("status") != "ok":
        raise RuntimeError(run.get("stdout_tail") or "CalculiX 求解失败")
    summary = read_results(run["dat_path"])
    exported = export_result_mesh(
        str(inp),
        dat_path=run["dat_path"],
        out_path=str(job / "result_mesh.json"),
        mode=1 if analysis == "modal" else None,
    )
    exported.pop("_out_path", None)
    response = {
        "ok": True,
        "run_id": job.name,
        "solver": executable,
        "job": {"status": "verified", "elapsed": run.get("elapsed", 0), "job_dir": str(job)},
        "summary": summary,
        "result_mesh": exported,
    }
    print(json.dumps(response, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
        raise SystemExit(1)
