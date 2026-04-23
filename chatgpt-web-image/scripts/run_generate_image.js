const config = require('./config');
const { CDPSession, getVersion, getChatGPTPage, ensureDir, sleep } = require('./cdp_helpers');

const prompt = process.argv.slice(2).join(' ').trim();
if (!prompt) {
  console.error('Usage: node run_generate_image.js "<prompt>"');
  process.exit(1);
}

(async () => {
  let session;
  try {
    ensureDir(config.outputDir);
    const version = await getVersion();
    const page = await getChatGPTPage();
    session = new CDPSession(page.webSocketDebuggerUrl);
    await session.connect();
    await session.send('Runtime.enable');
    await session.send('Page.enable');
    await session.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: config.outputDir,
      eventsEnabled: true,
    });

    const precheck = await session.eval(`(() => {
      const visible = el => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
      };
      const input = document.querySelector('#prompt-textarea') || Array.from(document.querySelectorAll('[contenteditable="true"][role="textbox"], textarea')).find(visible) || null;
      const imageBtn = Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible).find(el => /生成图片|create image|image/i.test((el.innerText||el.textContent||'') + ' ' + (el.getAttribute('aria-label')||''))) || null;
      const profileImg = Array.from(document.querySelectorAll('img')).find(el => /个人资料图片|profile/i.test((el.getAttribute('alt')||''))) || null;
      const toInfo = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (el.innerText||el.textContent||'').trim(), aria: el.getAttribute('aria-label') || '' };
      };
      return { loggedInLikely: !!profileImg && !!input, input: !!input, imageBtn: toInfo(imageBtn) };
    })()`);

    if (!precheck.loggedInLikely || !precheck.input) throw new Error('ChatGPT page is not ready or not logged in');
    if (precheck.imageBtn) {
      await session.mouseClick(precheck.imageBtn.x, precheck.imageBtn.y);
      await sleep(1200);
    }

    await session.eval(`(() => {
      const input = document.querySelector('#prompt-textarea') || document.querySelector('[contenteditable="true"][role="textbox"], textarea');
      if (!input) return { ok:false };
      input.focus();
      return { ok:true };
    })()`);
    await session.send('Input.insertText', { text: prompt });
    await sleep(700);

    const sendInfo = await session.eval(`(() => {
      const visible = el => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
      };
      const btn = document.querySelector('#composer-submit-button') || document.querySelector('[data-testid="send-button"]') || Array.from(document.querySelectorAll('button')).filter(visible).find(el => /发送|send/i.test((el.getAttribute('aria-label')||'') + ' ' + (el.innerText||el.textContent||'')));
      if (!btn) return { ok:false };
      const r = btn.getBoundingClientRect();
      return { ok:true, x: r.left + r.width / 2, y: r.top + r.height / 2, aria: btn.getAttribute('aria-label') || '' };
    })()`);
    if (!sendInfo.ok) throw new Error('Send button not found after filling prompt');
    await session.mouseClick(sendInfo.x, sendInfo.y);

    const deadline = Date.now() + config.generationTimeoutMs;
    let lastState = null;
    while (Date.now() < deadline) {
      await sleep(config.pollIntervalMs);
      const state = await session.eval(`(() => {
        const visible = el => {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          const st = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
        };
        const stop = Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible).find(el => /停止流式传输|stop/i.test((el.getAttribute('aria-label')||'') + ' ' + (el.innerText||el.textContent||'')));
        const images = Array.from(document.querySelectorAll('img')).filter(visible).map((el, i) => ({
          i,
          alt: el.getAttribute('alt') || '',
          src: el.getAttribute('src') || '',
          w: el.naturalWidth || 0,
          h: el.naturalHeight || 0,
        }));
        const generated = images.filter(img => img.w >= 512 && img.h >= 512 && (img.alt === '已生成图片' || img.src.includes('/backend-api/estuary/content?id=file_')));
        return { stop: !!stop, generatedCount: generated.length, generated };
      })()`);
      lastState = state;
      if (state.generatedCount > 0 && !state.stop) break;
    }
    if (!lastState || lastState.generatedCount === 0) throw new Error('Timed out waiting for generated image');

    const shareClicked = await session.eval(`(() => {
      const visible = el => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
      };
      const btns = Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible).filter(el => /分享此图片|share this image/i.test((el.getAttribute('aria-label')||'') + ' ' + (el.innerText||el.textContent||'')));
      const btn = btns[btns.length - 1];
      if (!btn) return { ok:false };
      btn.click();
      return { ok:true };
    })()`);
    if (!shareClicked.ok) throw new Error('Share image button not found');
    await sleep(1200);

    const downloadBtnDeadline = Date.now() + 10000;
    let downloadBtn = null;
    while (Date.now() < downloadBtnDeadline) {
      downloadBtn = await session.eval(`(() => {
        const visible = el => {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          const st = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
        };
        const btn = Array.from(document.querySelectorAll('button,[role="button"],[role="menuitem"],a')).filter(visible).find(el => /下载|download/i.test((el.innerText||el.textContent||'').trim() + ' ' + (el.getAttribute('aria-label')||'')));
        if (!btn) return null;
        return { ok:true, text: (btn.innerText||btn.textContent||'').trim() };
      })()`);
      if (downloadBtn && downloadBtn.ok) break;
      await sleep(250);
    }
    if (!downloadBtn || !downloadBtn.ok) throw new Error('Download button not found in share dialog');

    const startedAt = Date.now();
    const downloadClick = await session.eval(`(() => {
      const visible = el => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
      };
      const btn = Array.from(document.querySelectorAll('button,[role="button"],[role="menuitem"],a')).filter(visible).find(el => /下载|download/i.test((el.innerText||el.textContent||'').trim() + ' ' + (el.getAttribute('aria-label')||'')));
      if (!btn) return { ok:false };
      btn.click();
      return { ok:true };
    })()`);
    if (!downloadClick.ok) throw new Error('Download click failed');

    let downloadedFilePath = null;
    const downloadDeadline = Date.now() + config.downloadTimeoutMs;
    while (Date.now() < downloadDeadline) {
      const evt = session.events.find(e => e.method === 'Browser.downloadProgress' && e.params && e.params.state === 'completed' && e.params.filePath);
      if (evt) {
        downloadedFilePath = evt.params.filePath;
        break;
      }
      await sleep(250);
    }
    if (!downloadedFilePath) throw new Error('Download did not complete in time');

    const imageInfo = await session.eval(`(() => {
      const imgs = Array.from(document.querySelectorAll('img')).map(el => ({ alt: el.getAttribute('alt') || '', src: el.getAttribute('src') || '', w: el.naturalWidth || 0, h: el.naturalHeight || 0 }));
      const g = imgs.filter(img => img.w >= 512 && img.h >= 512 && (img.alt === '已生成图片' || img.src.includes('/backend-api/estuary/content?id=file_')));
      return g[g.length - 1] || null;
    })()`);

    console.log(JSON.stringify({
      ok: true,
      browser: version.Browser,
      prompt,
      generatedImage: imageInfo,
      downloadedFilePath,
      outputDir: config.outputDir,
      downloadStartedAt: startedAt,
    }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ ok: false, prompt, error: err.message }, null, 2));
    process.exitCode = 1;
  } finally {
    if (session) session.close();
  }
})();
