const os = require('os');
const path = require('path');

function envInt(name, fallback) {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = {
  chromePath: process.env.CHATGPT_IMAGE_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  debugPort: envInt('CHATGPT_IMAGE_DEBUG_PORT', 9222),
  userDataDir: process.env.CHATGPT_IMAGE_USER_DATA_DIR || path.join(os.homedir(), '.chatgpt-image-skill-chrome'),
  outputDir: process.env.CHATGPT_IMAGE_OUTPUT_DIR || path.join(os.homedir(), '.chatgpt-image-skill-output'),
  pageUrl: process.env.CHATGPT_IMAGE_PAGE_URL || 'https://chatgpt.com/',
  probeTimeoutMs: envInt('CHATGPT_IMAGE_PROBE_TIMEOUT_MS', 15000),
  generationTimeoutMs: envInt('CHATGPT_IMAGE_GENERATION_TIMEOUT_MS', 180000),
  downloadTimeoutMs: envInt('CHATGPT_IMAGE_DOWNLOAD_TIMEOUT_MS', 30000),
  pollIntervalMs: envInt('CHATGPT_IMAGE_POLL_INTERVAL_MS', 3000),
};
