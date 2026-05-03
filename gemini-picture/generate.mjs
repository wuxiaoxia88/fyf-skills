/**
 * generate.mjs — Gemini 多图顺序生成脚本
 *
 * 用法：
 *   node generate.mjs <prompts.json> [输出目录]
 *
 * prompts.json 格式：
 *   [
 *     "提示词1",
 *     "提示词2",
 *     "提示词3"
 *   ]
 *
 * 输出：
 *   - 生成的图片保存在 [输出目录]/ 目录下
 *   - 文件名格式: gemini_001_时间戳.png, gemini_002_时间戳.png, ...
 *   - 完成后打印 JSON 结果，供 AI 调用 message 工具发送
 */

import { createGeminiSession, disconnect } from './src/index.js';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

// ─── 配置 ───
const PROMPTS_FILE = process.argv[2];
const OUTPUT_DIR   = process.argv[3] || './output';
const FULL_SIZE    = false;   // 预览图模式（稳定）
const GEN_TIMEOUT  = 300_000; // 5分钟/张
const DL_TIMEOUT   = 60_000;  // 提取超时

// ─── 工具 ───
function decodeDataUrl(dataUrl) {
  if (Buffer.isBuffer(dataUrl)) return dataUrl;
  if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
    return Buffer.from(dataUrl.replace(/^data:[^;]+;base64,/, ''), 'base64');
  }
  return Buffer.from(dataUrl, 'base64');
}

/**
 * 预检：仅验证基础 CDP 通路 + 页面可用性
 *
 * 不再尝试生成测试图片（Gemini 响应方式可能变化，导致误报）。
 * 实际生图是否正常，由后续正式流程验证——失败则立即报出来。
 *
 * @param {object} ops - Gemini 操作 API
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function preflightCheck(ops) {
  console.error('[preflight] 🔍 检查 CDP 连接 + 页面状态...');
  const { page } = ops;

  // CDP 连通性
  try {
    const ready = await page.evaluate(() => document.readyState === 'complete');
    if (!ready) {
      await page.waitForLoadState('load').catch(() => {});
    }
  } catch (err) {
    console.error('[preflight] ❌ CDP 无响应:', err.message);
    return { ok: false, error: `cdp_unreachable: ${err.message}` };
  }

  // 输入区域可见性
  try {
    const hasInput = await page.evaluate(() => {
      const sels = ['textarea', 'div[contenteditable="true"]'];
      for (const sel of sels) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return true;
      }
      return false;
    });
    if (!hasInput) {
      console.error('[preflight] ⚠️ 输入区域不可见，尝试刷新...');
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 });
      await new Promise(r => setTimeout(r, 3000));

      const hasInputAfter = await page.evaluate(() => {
        const sels = ['textarea', 'div[contenteditable="true"]'];
        for (const sel of sels) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) return true;
        }
        return false;
      });
      if (!hasInputAfter) {
        throw new Error('输入区域刷新后仍不可见，可能需要重新登录');
      }
    }
  } catch (err) {
    console.error('[preflight] ❌ 预检失败:', err.message);
    return { ok: false, error: err.message };
  }

  console.error('[preflight] ✅ 检查通过，准备开始生成');
  return { ok: true };
}

/**
 * 关闭本次用于生图的 Gemini 标签页。
 *
 * 只关闭 page，不关闭浏览器本体；浏览器仍由 Daemon 守护。
 * 这样每次任务生成并保存图片后不会留下 Gemini 生图页面。
 *
 * @param {import('puppeteer-core').Page | undefined} page
 */
async function closeGenerationPage(page) {
  if (!page) return;
  try {
    if (page.isClosed()) return;
    await page.close({ runBeforeUnload: false });
    console.error('[browser] 已关闭本次 Gemini 生图标签页');
  } catch (err) {
    console.error('[browser] ⚠️ 关闭 Gemini 生图标签页失败:', err.message);
  }
}

async function main() {
  if (!PROMPTS_FILE) {
    console.error('用法: node generate.mjs <prompts.json> [输出目录]');
    process.exit(1);
  }

  // 读取提示词
  let prompts;
  try {
    const raw = readFileSync(PROMPTS_FILE, 'utf-8');
    prompts = JSON.parse(raw);
    if (!Array.isArray(prompts) || prompts.length === 0) throw new Error('prompts.json 必须是非空数组');
  } catch (e) {
    console.error(`读取 prompts.json 失败: ${e.message}`);
    process.exit(1);
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  console.error(`[gemini-picture] 输出目录: ${OUTPUT_DIR}`);
  console.error(`[gemini-picture] 共 ${prompts.length} 张图\n`);

  const { ops, page } = await createGeminiSession();
  process.on('SIGINT', async () => {
    await closeGenerationPage(page);
    disconnect();
    process.exit(0);
  });

  // ─── 预检：CDP + 页面基础可用性 ───
  const pf = await preflightCheck(ops);
  if (!pf.ok) {
    console.error('[preflight] ❌ 预检不通过，终止任务');
    console.log(JSON.stringify({
      ok: false,
      total: prompts.length,
      success: 0,
      outputDir: OUTPUT_DIR,
      images: [],
      error: `preflight_failed: ${pf.error}`,
    }));
    await closeGenerationPage(page);
    disconnect();
    process.exit(1);
  }

  // ─── 创建新对话（避免历史上下文污染） ───
  await ops.click('newChatBtn').catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  try {
    const results = [];

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      const seq = String(i + 1).padStart(3, '0');
      const filename = `gemini_${seq}_${Date.now()}.png`;
      const dest = join(OUTPUT_DIR, filename);
      const start = Date.now();

      console.error(`[${seq}] 开始: ${prompt.slice(0, 50)}…`);

      const genResult = await ops.generateImage(prompt, {
        timeout: GEN_TIMEOUT,
        fullSize: FULL_SIZE,
        downloadTimeout: DL_TIMEOUT,
      });

      // 检测 Rate Limit，立即中断并通知用户
      if (genResult.error === 'rate_limit') {
        console.error(`[${seq}] ⚠️ 触发平台限额，跳过剩余图片: ${genResult.rateLimitMessage || ''}`);
        console.log(JSON.stringify({
          ok: false,
          total: prompts.length,
          success: results.filter(r => r.ok).length,
          outputDir: OUTPUT_DIR,
          images: results,
          rateLimit: { seq, filename, message: genResult.rateLimitMessage },
        }));
        return; // 跳出循环，不再继续生成
      }

      const elapsed = Date.now() - start;
      console.error(`[${seq}] 完成 ${elapsed}ms ok=${genResult.ok}`);

      if (!genResult.ok || !genResult.dataUrl) {
        console.error(`[${seq}] 失败: ${genResult.error}`);
        results.push({ seq, ok: false, error: genResult.error || 'no_data' });
        continue;
      }

      // 保存图片
      const buf = decodeDataUrl(genResult.dataUrl);
      writeFileSync(dest, buf);
      console.error(`[${seq}] 已保存 ${(buf.length / 1024).toFixed(0)}KB → ${dest}`);

      results.push({
        seq,
        ok: true,
        path: dest,
        filename,
        size: buf.length,
        elapsed,
        prompt,
      });
    }

    // ─── 输出 JSON 结果（供 AI 读取） ───
    console.log(JSON.stringify({
      ok: results.every(r => r.ok),
      total: prompts.length,
      success: results.filter(r => r.ok).length,
      outputDir: OUTPUT_DIR,
      images: results,
    }));

  } finally {
    await closeGenerationPage(page);
    disconnect();
  }
}

main().catch(err => {
  console.error('[fatal]', err.message);
  process.exit(1);
});
