import test from 'node:test';
import assert from 'node:assert/strict';
import { completionUrl, validateAnalysis, analyzeEngineeringTask } from '../lib/deepseek.mjs';
const draft = () => ({ summary: '悬臂梁', template_supported: true, parameters: { length_mm: 120, width_mm: 8, height_mm: 8, load_n: 100, youngs_modulus_mpa: 210000, poissons_ratio: 0.3 }, questions: [], assumptions: [], checks: ['反力平衡'] });
test('base URLs normalize without duplicating chat/completions; unsafe URLs rejected', () => {
  assert.equal(completionUrl('https://api.deepseek.com/v1/'), 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(completionUrl('https://api.deepseek.com/chat/completions'), 'https://api.deepseek.com/chat/completions');
  for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://example.com?key=x']) assert.throws(() => completionUrl(url));
});
test('missing values remain missing and malformed engineering data is rejected', () => {
  const value = draft(); value.parameters.length_mm = null;
  assert.equal(validateAnalysis(value).parameters.length_mm, null);
  for (const bad of [0, -2, '120', Infinity]) { value.parameters.length_mm = bad; assert.throws(() => validateAnalysis(value)); }
  value.parameters.length_mm = 120; value.parameters.poissons_ratio = 0.5;
  assert.throws(() => validateAnalysis(value));
  assert.throws(() => validateAnalysis({ ...draft(), questions: 'missing' }));
});
test('request sends credentials only in Authorization and parses JSON; errors never echo upstream secrets', async (t) => {
  const config = { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: 'test-placeholder' };
  const args = { config, task: '悬臂梁', selected: { id: 'calculix-cantilever', solver: 'CalculiX', kind: 'static' }, parameters: {} };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-placeholder');
    assert.ok(!options.body.includes(config.apiKey));
    const body = JSON.parse(options.body);
    assert.equal(body.response_format.type, 'json_object');
    return Response.json({ choices: [{ message: { content: JSON.stringify(draft()) }, finish_reason: 'stop' }] });
  });
  assert.equal((await analyzeEngineeringTask(args)).parameters.load_n, 100);
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ error: 'secret' }, { status: 401 }));
  await assert.rejects(analyzeEngineeringTask(args), /API Key 无效/);
  globalThis.fetch.mock.mockImplementation(async () => Response.json({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }));
  await assert.rejects(analyzeEngineeringTask(args), /截断/);
});
