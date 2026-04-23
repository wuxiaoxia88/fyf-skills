const fs = require('fs');
const path = require('path');
const config = require('./config');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

class CDPSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.pending = new Map();
    this.events = [];
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      ws.onopen = resolve;
      ws.onerror = reject;
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data.toString());
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject, method } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(`${method}: ${JSON.stringify(msg.error)}`));
          else resolve(msg.result);
          return;
        }
        if (msg.method) this.events.push(msg);
      };
    });
  }

  async send(method, params = {}) {
    const id = this.id++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject, method }));
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      const text = details.exception?.description || details.text || 'Runtime.evaluate exception';
      throw new Error(text);
    }
    if (!result.result) {
      throw new Error('Runtime.evaluate returned no result');
    }
    return result.result.value;
  }

  async mouseClick(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await sleep(70);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await sleep(60);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function getVersion() {
  return fetchJson(`http://127.0.0.1:${config.debugPort}/json/version`);
}

async function listPages() {
  return fetchJson(`http://127.0.0.1:${config.debugPort}/json/list`);
}

async function getChatGPTPage() {
  const pages = await listPages();
  const page = pages.find(p => p.type === 'page' && /chatgpt\.com/.test(p.url || ''));
  if (!page) throw new Error('No ChatGPT page found on current debug port');
  return page;
}

module.exports = {
  sleep,
  ensureDir,
  CDPSession,
  getVersion,
  listPages,
  getChatGPTPage,
};
