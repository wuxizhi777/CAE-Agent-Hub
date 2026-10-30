import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  FileCode2,
  FolderTree,
  Gauge,
  LoaderCircle,
  Play,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  SquareTerminal,
} from "lucide-react";
import CaeResultViewer from "./CaeResultViewer";
import { DEFAULT_MODEL_CONFIG, PARAMETER_KEYS, analyzeEngineeringTask } from "../lib/deepseek.mjs";

const CASES = [
  { id: "calculix-cantilever", group: "CalculiX", label: "悬臂梁 · 静力", kind: "static", path: "models/text-to-cae-calculix-cantilever", solver: "CalculiX", runnable: true, tags: ["C3D8", "静力", "100 N"], description: "钢制方截面悬臂梁，根部固支，端面受 100 N 横向载荷。" },
  { id: "calculix-modal", group: "CalculiX", label: "悬臂梁 · 模态", kind: "modal", path: "models/text-to-cae-calculix-modal", solver: "CalculiX", runnable: true, tags: ["C3D8", "模态", "5 阶"], description: "同一悬臂梁的 5 阶固有频率与一阶振型，可重新求解。" },
  { id: "abaqus-hole", group: "Abaqus", label: "带孔板 · 静力", kind: "static", path: "models/text-to-cae-hole-plate", solver: "Abaqus", runnable: true, tags: ["C3D4", "静力", "真实求解"], description: "Abaqus/CAE 生成带中心圆孔的钢板，左端固支、右端施加位移，输出应力与位移。" },
  { id: "abaqus-modal", group: "Abaqus", label: "带孔板 · 模态", kind: "modal", path: "models/text-to-cae-hole-plate-modal", solver: "Abaqus", runnable: false, tags: ["S4", "模态"], description: "预计算带孔板模态结果。" },
  { id: "abaqus-cantilever", group: "Abaqus", label: "悬臂梁 · 经典案例", kind: "static", path: "models/text-to-cae", solver: "Abaqus", runnable: false, tags: ["C3D8", "静力"], description: "原有 Text-to-CAE 悬臂梁结果。" },
  { id: "abaqus-impact", group: "Abaqus", label: "球体冲击板", kind: "dynamic", path: "models/text-to-cae-sphere-impact", solver: "Abaqus", runnable: false, tags: ["动态", "接触"], description: "冲击过程的动态帧回放。" },
  { id: "abaqus-milling", group: "Abaqus", label: "铣削过程", kind: "dynamic", path: "models/text-to-cae-milling-3d", solver: "Abaqus", runnable: false, tags: ["动态", "切削"], description: "铣削过程的结果回放。" },
  { id: "abaqus-gear", group: "Abaqus", label: "齿轮啮合", kind: "dynamic", path: "models/text-to-cae-gear-mesh", solver: "Abaqus", runnable: false, tags: ["动态", "接触"], description: "齿轮啮合动态结果。" },
  { id: "abaqus-f22", group: "Abaqus", label: "F-22 外流场", kind: "static", path: "models/text-to-cae-f22-flow", solver: "Fluent", runnable: false, tags: ["外流场", "回放"], description: "已有外流场结果回放；本工作台不再使用 Fluent 对话入口。" },
  { id: "abaqus-bullet", group: "Abaqus", label: "弹丸侵彻板", kind: "dynamic", path: "models/text-to-cae-bullet-plate", solver: "Abaqus", runnable: false, tags: ["动态", "侵彻"], description: "弹丸侵彻过程的预计算结果。" },
  { id: "peridigm-fracture", group: "近场动力学", label: "预裂纹拉伸", kind: "dynamic", path: "models/peridigm-notched-tension", solver: "Peridigm", runnable: false, tags: ["Damage", "回放"], description: "已验证的材料点损伤回放。" },
];

const GROUPS = ["CalculiX", "Abaqus", "近场动力学"];
const DEFAULT_PARAMETERS = { length_mm: 120, width_mm: 8, height_mm: 8, load_n: 100, youngs_modulus_mpa: 210000, poissons_ratio: 0.3 };

function readResult(caseItem) {
  return Promise.all([
    fetch(`/${caseItem.path}/result_mesh.json`).then((response) => response.json()),
    fetch(`/${caseItem.path}/cae_project.json`).then((response) => response.ok ? response.json() : null).catch(() => null),
  ]).then(([resultMesh, project]) => ({ resultMesh, project }));
}

function summarize(mesh) {
  if (!mesh) return [];
  const ranges = mesh.fieldRanges || {};
  return [
    [mesh.analysisType === "modal" ? "一阶频率" : "最大 von Mises", mesh.frequencyHz ? `${Number(mesh.frequencyHz).toFixed(2)} Hz` : `${Number(ranges.misesMax || 0).toFixed(2)} MPa`],
    ["最大位移", `${Number(ranges.maxDisplacement || 0).toFixed(4)} ${mesh.analysisType === "modal" ? "归一化" : "mm"}`],
    ["网格规模", `${mesh.nodes?.length || 0} 节点 / ${mesh.elements?.length || 0} 单元`],
  ];
}

export default function CaeAgentWorkspace() {
  const [modelConfig, setModelConfig] = useState(() => {
    try { const saved = JSON.parse(sessionStorage.getItem("cae-deepseek") || "{}"); return { ...DEFAULT_MODEL_CONFIG, ...saved, apiKey: saved?.apiKey || DEFAULT_MODEL_CONFIG.apiKey }; }
    catch { return DEFAULT_MODEL_CONFIG; }
  });
  const [modelConfigExpanded, setModelConfigExpanded] = useState(false);
  const [modelStatus, setModelStatus] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const requestRef = useRef(null);
  useEffect(() => () => requestRef.current?.abort(), []);
  const [selectedId, setSelectedId] = useState("calculix-cantilever");
  const [expanded, setExpanded] = useState(() => new Set(GROUPS));
  const [filter, setFilter] = useState("");
  const [task, setTask] = useState("请用 CalculiX 分析一根 120 mm 长、8×8 mm 钢制悬臂梁，根部固支，端部施加 100 N 载荷，并输出应力和位移云图。");
  const [parameters, setParameters] = useState(DEFAULT_PARAMETERS);
  const [specReady, setSpecReady] = useState(false);
  const [runState, setRunState] = useState("idle");
  const [logs, setLogs] = useState(["工作区已就绪", "配置 DeepSeek 后可分析需求；求解仍需人工确认"]);
  const [resultMesh, setResultMesh] = useState(null);
  const [project, setProject] = useState(null);
  const [runSummary, setRunSummary] = useState(null);

  const selected = CASES.find((item) => item.id === selectedId) || CASES[0];
  const visibleCases = useMemo(() => CASES.filter((item) => !filter || `${item.group} ${item.label} ${item.tags.join(" ")}`.toLowerCase().includes(filter.toLowerCase())), [filter]);

  useEffect(() => {
    setSpecReady(false);
    setRunState("idle");
    setRunSummary(null);
    readResult(selected).then(({ resultMesh: mesh, project: metadata }) => {
      setResultMesh(mesh);
      setProject(metadata || { project: { name: selected.label }, outputs: { status: "recorded" } });
    }).catch(() => {
      setResultMesh(null);
      setProject(null);
    });
  }, [selected]);

  const invalidateAnalysis = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    setAnalyzing(false); setAnalysis(null); setAnalysisError(""); setSpecReady(false);
    if (runState !== "running") setRunState("idle");
  };
  const selectCase = (item) => {
    if (runState === "running") return;
    invalidateAnalysis();
    setSelectedId(item.id);
    setLogs((current) => [...current.slice(-4), `已选择案例：${item.label}`]);
  };

  const buildSpec = async () => {
    invalidateAnalysis();
    const controller = new AbortController();
    requestRef.current = controller;
    setAnalyzing(true);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 90000);
    try {
      const result = await analyzeEngineeringTask({ config: modelConfig, task, selected, parameters, signal: controller.signal });
      if (requestRef.current !== controller) return;
      setAnalysis(result);
      const supported = selected.solver === "CalculiX" && selected.runnable && result.template_supported;
      const complete = PARAMETER_KEYS.every((key) => result.parameters[key] !== null);
      if (supported) setParameters((current) => ({ ...current, ...Object.fromEntries(Object.entries(result.parameters).filter(([, value]) => value !== null)) }));
      setSpecReady(supported && complete && result.questions.length === 0);
      setRunState(supported && complete && result.questions.length === 0 ? "ready" : "idle");
      setLogs((current) => [...current, "DeepSeek 已返回工程分析，请检查参数、假设和待补充信息"]);
    } catch (error) {
      if (requestRef.current !== controller) return;
      setAnalysisError(timedOut ? "分析超时，请重试" : error instanceof TypeError ? "无法连接模型服务，请检查网络、Base URL 和跨域支持" : error.message);
    } finally {
      clearTimeout(timer);
      if (requestRef.current === controller) { requestRef.current = null; setAnalyzing(false); }
    }
  };

  const runCase = async () => {
    if (!specReady || analyzing || runState === "running") return;
    if (!selected.runnable) {
      setLogs((current) => [...current, "这是已记录结果，只能回放；请选择带 RUN 标记的案例执行真实求解"]);
      return;
    }
    setRunState("running");
    setLogs((current) => [...current, `提交 ${selected.solver} 作业：generate → solve → read → export`]);
    try {
      const isAbaqus = selected.solver === "Abaqus";
      const response = await fetch(isAbaqus ? "/__cae/run" : "/__cae/calculix/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(isAbaqus ? { dir: selected.path, parameters } : { case_id: selected.id, analysis: selected.kind, parameters }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || `${selected.solver} 作业失败`);
      if (isAbaqus) {
        const refreshed = await readResult(selected);
        setResultMesh(refreshed.resultMesh);
        setProject(refreshed.project || payload.project);
        const metrics = refreshed.project?.outputs?.metrics || [];
        setRunSummary({
          max_stress_vm: metrics.find((metric) => /stress|应力|mises/i.test(metric.name || metric.label || ""))?.value,
          max_disp: metrics.find((metric) => /disp|位移/i.test(metric.name || metric.label || ""))?.value,
        });
      } else {
        setResultMesh(payload.result_mesh);
        setRunSummary(payload.summary);
        setProject({ project: { name: "CalculiX Web Run", solver: "CalculiX", model: "C3D8 static structural" }, outputs: { status: "verified" } });
      }
      setRunState("verified");
      setLogs((current) => [...current, `作业 ${payload.run_id || `${selected.solver} · ${selected.label}`} 已完成并通过结果检查`]);
    } catch (error) {
      setRunState("failed");
      setLogs((current) => [...current, `作业失败：${error instanceof Error ? error.message : String(error)}`]);
    }
  };

  const statusLabel = { idle: "草稿", ready: "待提交确认", running: "求解中", verified: "已验证", failed: "失败" }[runState];
  const grouped = GROUPS.map((group) => ({ group, items: visibleCases.filter((item) => item.group === group) })).filter((entry) => entry.items.length);

  return (
    <div className="agent-shell">
      <header className="agent-topbar">
        <div className="agent-brand"><div className="agent-mark"><SquareTerminal size={18} /></div><div><strong>CAE AGENT HUB</strong><small>NLP → MCP → CALCULIX → VIEWER</small></div></div>
        <div className="agent-topline"><span className="agent-dot" />本地工作区 <b>{selected.solver}</b><span className="agent-version">协议 v1 · 结果证据模式</span></div>
        <div className="agent-top-actions"><span className={`agent-status status-${runState}`}><i />{statusLabel}</span><button className="agent-ghost"><ShieldCheck size={15} />证据规范</button></div>
      </header>

      <div className="agent-layout">
        <aside className="agent-sidebar">
          <div className="agent-sidebar-title"><FolderTree size={15} />案例与结果</div>
          <label className="agent-search"><Search size={14} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="筛选案例、软件、标签" /></label>
          <div className="agent-tree">
            {grouped.map(({ group, items }) => (
              <div key={group} className="agent-tree-group">
                <button className="agent-tree-parent" onClick={() => setExpanded((current) => { const next = new Set(current); next.has(group) ? next.delete(group) : next.add(group); return next; })}>{expanded.has(group) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<span>{group}</span><em>{items.length}</em></button>
                {expanded.has(group) && items.map((item) => <button key={item.id} className={`agent-tree-item ${item.id === selectedId ? "active" : ""}`} onClick={() => selectCase(item)}><span className="tree-bullet" /> <span>{item.label}<small>{item.tags.join(" · ")}</small></span>{item.runnable && <span className="tree-run">RUN</span>}</button>)}
              </div>
            ))}
          </div>
          <div className="agent-sidebar-note"><Gauge size={14} /><span><b>CalculiX MCP</b><small>工具链可用性由后端检查</small></span></div>
        </aside>

        <main className="agent-main">
          <section className="agent-hero"><div><div className="agent-eyebrow">NATURAL LANGUAGE SIMULATION WORKSPACE</div><h1>从一句话到可验证的 CAE 结果</h1><p>输入工程任务，确认 CaseSpec，调用 CalculiX，最后在同一页面查看轻量化结果。</p></div><div className="agent-hero-badge"><Bot size={17} /><span>Agent 编排层<br /><b>人工确认后提交</b></span></div></section>

          <section className="agent-flow"><div className="flow-node done"><span>01</span><b>NLP 任务</b><small>理解需求</small></div><div className="flow-line done" /><div className={`flow-node ${specReady ? "done" : "active"}`}><span>02</span><b>CaseSpec</b><small>单位与边界</small></div><div className="flow-line" /><div className={`flow-node ${runState === "running" || runState === "verified" ? "done" : "active"}`}><span>03</span><b>CAE 求解</b><small>{selected.solver}</small></div><div className="flow-line" /><div className={`flow-node ${runState === "verified" ? "done" : ""}`}><span>04</span><b>Viewer</b><small>验证回放</small></div></section>

          <section className="agent-card model-config">
            <div className="agent-card-head"><div><span className="agent-card-kicker">DEEPSEEK</span><h2>模型配置</h2></div><button type="button" className="agent-button secondary" aria-expanded={modelConfigExpanded} aria-controls="deepseek-config-panel" onClick={() => setModelConfigExpanded((current) => !current)}>{modelConfigExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}{modelConfigExpanded ? "收起配置" : "展开配置"}</button></div>
            <div id="deepseek-config-panel" hidden={!modelConfigExpanded}>
            <div className="model-config-fields">
              <label>Base URL<input value={modelConfig.baseUrl} disabled={analyzing || runState === "running"} onChange={(e) => { invalidateAnalysis(); setModelConfig((c) => ({ ...c, baseUrl: e.target.value })); }} placeholder="https://api.deepseek.com" /></label>
              <label>模型<input value={modelConfig.model} disabled={analyzing || runState === "running"} onChange={(e) => { invalidateAnalysis(); setModelConfig((c) => ({ ...c, model: e.target.value })); }} list="deepseek-models" /><datalist id="deepseek-models"><option value="deepseek-flash" /><option value="deepseek-v4-pro" /><option value="deepseek-chat" /></datalist></label>
              <label>API Key<input type="password" autoComplete="off" spellCheck={false} value={modelConfig.apiKey} disabled={analyzing || runState === "running"} onChange={(e) => { invalidateAnalysis(); setModelConfig((c) => ({ ...c, apiKey: e.target.value })); }} placeholder="粘贴你的 API Key" /></label>
            </div>
            <div className="agent-task-footer"><span>工程描述将发送至上方地址；配置可保存到当前标签页会话，不写入服务器文件。</span><button className="agent-button secondary" onClick={() => { try { sessionStorage.setItem("cae-deepseek", JSON.stringify(modelConfig)); setModelStatus("已保存到当前标签页会话"); } catch { setModelStatus("浏览器禁止存储，当前页面仍可调用"); } }}>保存配置</button><button className="agent-button secondary" disabled={runState === "running"} onClick={() => { invalidateAnalysis(); setModelConfig(DEFAULT_MODEL_CONFIG); try { sessionStorage.removeItem("cae-deepseek"); } catch {} setModelStatus("已恢复默认配置"); }}>恢复默认</button></div>
            <p role="status">{modelStatus}</p>
            </div>
          </section>

          <section className="agent-task-card"><div className="agent-card-head"><div><span className="agent-card-kicker">01 / NATURAL LANGUAGE REQUEST</span><h2>描述你要解决的工程问题</h2></div><span className="agent-chip"><FileCode2 size={13} />{selected.solver} 后端</span></div><textarea value={task} disabled={runState === "running"} onChange={(event) => { invalidateAnalysis(); setTask(event.target.value); }} /><div className="agent-task-footer"><span>DeepSeek 分析需求并生成参数草案，缺失条件会列出待补充问题</span><button className="agent-button secondary" onClick={buildSpec} disabled={analyzing || runState === "running"}>{analyzing ? <LoaderCircle size={15} /> : <SlidersHorizontal size={15} />}{analyzing ? "DeepSeek 分析中…" : "用 DeepSeek 分析并生成 CaseSpec"}</button></div></section>

          {analysisError && <div className="agent-card model-error" role="alert">{analysisError}</div>}
          {analysis && <section className="agent-card model-analysis" aria-live="polite"><h2>DeepSeek 工程分析</h2><p>{analysis.summary}</p>{!analysis.template_supported && <p className="model-error">该问题不匹配当前可自动求解模板。以下为分析建议，不会自动启动求解。</p>}{[["待补充信息", analysis.questions], ["提交前请确认的假设", analysis.assumptions], ["建议校核", analysis.checks]].map(([title, items]) => items.length > 0 && <div key={title}><h3>{title}</h3><ul>{items.map((text, i) => <li key={i}>{text}</li>)}</ul></div>)}<p>{specReady ? "请核对下方参数与上述假设，点击“确认并启动”后才会提交真实求解。" : "请在工程描述中补充条件或选择匹配案例，然后重新分析。当前自动参数映射仅支持 CalculiX 悬臂梁。"}</p></section>}

          <section className="agent-grid"><div className="agent-card spec-card"><div className="agent-card-head"><div><span className="agent-card-kicker">02 / CONFIRMED CASESPEC</span><h2>{selected.label}</h2></div><span className={`agent-chip ${specReady ? "good" : ""}`}>{specReady ? <Check size={13} /> : <CircleAlert size={13} />}{specReady ? "草案可提交" : "待分析／补充"}</span></div><p className="agent-description">{selected.description}</p><div className="agent-fields">{Object.entries(parameters).map(([key, value]) => <label key={key}><span>{({ length_mm: "长度", width_mm: "宽度", height_mm: "高度", load_n: "端部载荷", youngs_modulus_mpa: "弹性模量", poissons_ratio: "泊松比" })[key]}</span><input type="number" value={value} disabled={runState === "running" || analyzing} onChange={(event) => { invalidateAnalysis(); setParameters((current) => ({ ...current, [key]: Number(event.target.value) })); }} /><em>{key === "load_n" ? "N" : key.includes("mm") ? "mm" : key.includes("mpa") ? "MPa" : ""}</em></label>)}</div><div className="agent-checks"><span>{specReady ? "参数草案已通过格式检查，物理条件仍需确认" : "表单为参考值，不代表模型已理解或确认需求"}</span></div></div><div className="agent-card evidence-card"><div className="agent-card-head"><div><span className="agent-card-kicker">RUN EVIDENCE</span><h2>作业状态</h2></div><span className={`agent-run-pill ${runState}`}>{statusLabel}</span></div><div className="agent-log">{logs.slice(-6).map((line, index) => <div key={`${line}-${index}`}><i className={index === logs.slice(-6).length - 1 && runState === "running" ? "pulse" : ""} />{line}</div>)}</div><button className="agent-button primary" onClick={runCase} disabled={runState === "running" || analyzing || !specReady || !selected.runnable}><Play size={15} />{runState === "running" ? `${selected.solver} 求解中…` : selected.runnable ? `确认并启动 ${selected.solver}` : "该案例仅支持回放"}</button></div></section>

          {runSummary && <section className="agent-summary"><span><b>真实求解摘要</b><small>来自本次 run_id 的 .dat 解析</small></span>{selected.kind === "modal" ? <><div><b>{Number(runSummary.frequencies?.[0]?.freq_hz || 0).toFixed(2)} Hz</b><small>一阶固有频率</small></div><div><b>{runSummary.n_modes || 0}</b><small>提取模态数</small></div></> : <><div><b>{Number(runSummary.max_stress_vm || 0).toFixed(2)} MPa</b><small>最大 von Mises</small></div><div><b>{Number(runSummary.max_disp || 0).toFixed(4)} mm</b><small>最大位移</small></div></>}<div><b>verified</b><small>结果状态</small></div></section>}

          <section className="agent-result-card"><div className="agent-card-head"><div><span className="agent-card-kicker">05 / LIGHTWEIGHT RESULT VIEWER</span><h2>结果查看与回放 · {selected.label}</h2></div><span className="agent-chip good"><Check size={13} />{runState === "verified" ? "本次求解" : "记录结果"}</span></div><div className="agent-viewer"><CaeResultViewer resultMesh={resultMesh} project={project || { outputs: { status: "recorded" } }} locale="zh" /></div><div className="agent-metrics">{summarize(resultMesh).map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div></section>
        </main>
      </div>
    </div>
  );
}
