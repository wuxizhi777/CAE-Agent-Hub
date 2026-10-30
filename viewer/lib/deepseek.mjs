export const DEFAULT_MODEL_CONFIG = { baseUrl: "https://api.deepseek.com", model: "deepseek-flash", apiKey: "sk-35c4b94e3cc34187ad80eb0f8c4e483b" };
export const PARAMETER_KEYS = ["length_mm", "width_mm", "height_mm", "load_n", "youngs_modulus_mpa", "poissons_ratio"];

export function completionUrl(baseUrl) {
  let url;
  try { url = new URL(baseUrl.trim()); } catch { throw new Error("Base URL 格式不正确"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Base URL 必须是无账号、查询参数的 HTTPS 地址");
  url.pathname = `${url.pathname.replace(/\/+$/, "").replace(/\/chat\/completions$/, "")}/chat/completions`;
  return url.href;
}

export function validateAnalysis(value) {
  if (!value || typeof value.summary !== "string" || typeof value.template_supported !== "boolean") throw new Error("模型未返回有效的工程分析，请重试");
  for (const key of ["questions", "assumptions", "checks"]) {
    if (!Array.isArray(value[key]) || value[key].some((item) => typeof item !== "string")) throw new Error(`模型返回的 ${key} 格式不正确`);
  }
  if (!value.parameters || typeof value.parameters !== "object" || Array.isArray(value.parameters)) throw new Error("模型未返回参数对象");
  const parameters = {};
  for (const key of PARAMETER_KEYS) {
    const number = value.parameters[key];
    if (number == null) { parameters[key] = null; continue; }
    if (typeof number !== "number" || !Number.isFinite(number) || (key === "poissons_ratio" ? number <= -1 || number >= 0.5 : number <= 0)) throw new Error(`模型返回的 ${key} 超出有效范围`);
    parameters[key] = number;
  }
  return { summary: value.summary, template_supported: value.template_supported, parameters, questions: value.questions, assumptions: value.assumptions, checks: value.checks };
}

export async function analyzeEngineeringTask({ config, task, selected, parameters, signal }) {
  if (!config.apiKey.trim()) throw new Error("请先在模型配置中填写 API Key");
  if (!config.model.trim()) throw new Error("请填写模型名称");
  if (!task.trim()) throw new Error("请先描述工程问题");
  const response = await fetch(completionUrl(config.baseUrl), {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey.trim()}` },
    body: JSON.stringify({
      model: config.model.trim(), stream: false, max_tokens: 4096,
      thinking: { type: "disabled" }, response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `你是 CAE 工程分析助手。用中文分析用户需求，输出 JSON，不执行代码或求解，不声称已有计算结果。
返回格式：{"summary":"工程问题与分析方法","template_supported":false,"parameters":{"length_mm":null,"width_mm":null,"height_mm":null,"load_n":null,"youngs_modulus_mpa":null,"poissons_ratio":null},"questions":["必须补充的问题"],"assumptions":["需要用户确认的假设"],"checks":["建议的结果校核"]}。
只有用户问题与当前选中 CalculiX 矩形等截面悬臂梁模板匹配时 template_supported 才能为 true；其他案例仍给出分析建议但设为 false。不得把带孔板、接触、热、流体等问题映射为悬臂梁。
模板条件：梁轴 X，x=0 端完全固定，线弹性均匀材料；静力时端面均布总力沿 -Z，load_n 为正值。模态时固定钢材密度 7.85e-9 tonne/mm³、提取 5 阶，不支持修改密度或阶数。不符合模板的边界、方向、材料模型、分析类型必须设为 false 并解释。
参数只填用户明确给出的值，换算到 mm/N/MPa；未给出的值为 null，不得把表单示例当成用户输入。常用材料参数可以作为假设提出，但不能偷偷填入；缺失求解必需信息放 questions。模态不需要用户提供载荷，可保留表单 load_n 占位值并在 assumptions 说明不参与模态求解。含糊的方向可以提出采用 -Z 的明确假设供用户确认。不要提出本模板不能修改却假装能应用的参数。` },
        { role: "user", content: JSON.stringify({ task, selected_case: { id: selected.id, label: selected.label, solver: selected.solver, analysis: selected.kind }, form_reference_only: parameters }) },
      ],
    }),
  });
  if (!response.ok) {
    const labels = { 400: "请求参数或模型名称不受支持", 401: "API Key 无效", 402: "账户余额不足", 403: "无权访问该接口", 429: "请求过于频繁，请稍后重试" };
    throw new Error(labels[response.status] || `模型服务请求失败（HTTP ${response.status}）`);
  }
  const body = await response.json();
  const choice = body.choices?.[0];
  if (choice?.finish_reason === "length") throw new Error("模型输出被截断，请缩短问题后重试");
  let parsed;
  try { parsed = JSON.parse(choice?.message?.content); } catch { throw new Error("模型没有返回可解析的 JSON，请重试"); }
  return validateAnalysis(parsed);
}
