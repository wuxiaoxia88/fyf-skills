const fs = require('fs');
const path = require('path');
const config = require('./config');
const { CDPSession, getVersion, getChatGPTPage, ensureDir, sleep } = require('./cdp_helpers');

const prompt = process.argv.slice(2).join(' ').trim();
if (!prompt) {
  console.error('Usage: node run_generate_image.js "<prompt>"');
  process.exit(1);
}

function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
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
      const existingImages = Array.from(document.querySelectorAll('img')).filter(visible).map(el => ({
        alt: el.getAttribute('alt') || '',
        src: el.getAttribute('src') || '',
        w: el.naturalWidth || 0,
        h: el.naturalHeight || 0,
      })).filter(img => img.w >= 512 && img.h >= 512 && (img.alt === '已生成图片' || img.src.includes('/backend-api/estuary/content?id=file_')));
      const toInfo = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (el.innerText||el.textContent||'').trim(), aria: el.getAttribute('aria-label') || '' };
      };
      return {
        loggedInLikely: !!profileImg && !!input,
        input: !!input,
        imageBtn: toInfo(imageBtn),
        existingGeneratedSrcs: existingImages.map(img => img.src),
      };
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

    const baselineGeneratedSrcs = new Set(precheck.existingGeneratedSrcs || []);

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
      const newGenerated = (state.generated || []).filter(img => img.src && !baselineGeneratedSrcs.has(img.src));
      if (newGenerated.length > 0 && !state.stop) {
        lastState.newGenerated = newGenerated;
        break;
      }
    }
    if (!lastState || !lastState.newGenerated || lastState.newGenerated.length === 0) throw new Error('Timed out waiting for a newly generated image');

    const newestGeneratedSrc = lastState.newGenerated[lastState.newGenerated.length - 1].src;
    const imageInfo = await session.eval(`((targetSrc) => {
      const visible = el => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
      };
      const imgs = Array.from(document.querySelectorAll('img')).filter(visible).map(el => ({
        alt: el.getAttribute('alt') || '',
        src: el.getAttribute('src') || '',
        w: el.naturalWidth || 0,
        h: el.naturalHeight || 0,
      }));
      return imgs.find(img => img.src === targetSrc) || null;
    })(${JSON.stringify(newestGeneratedSrc)})`);
    if (!imageInfo || !imageInfo.src) throw new Error('Generated image source not found');

    await session.send('Network.enable');
    const cookiesRes = await session.send('Network.getCookies', {
      urls: ['https://chatgpt.com/', imageInfo.src],
    });
    const cookies = (cookiesRes.cookies || []).map(c => `${c.name}=${c.value}`).join('; ');
    const resp = await fetch(imageInfo.src, {
      headers: {
        Cookie: cookies,
        'User-Agent': 'Mozilla/5.0',
      },
    });
    if (!resp.ok) {
      throw new Error(`Image fetch failed with status ${resp.status}`);
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    const mime = resp.headers.get('content-type') || 'image/png';

    let ext = 'png';
    if (/jpeg|jpg/i.test(mime)) ext = 'jpg';
    else if (/webp/i.test(mime)) ext = 'webp';
    const outputPath = path.join(config.outputDir, `chatgpt_image_${formatTimestamp()}.${ext}`);
    fs.writeFileSync(outputPath, buffer);

    console.log(JSON.stringify({
      ok: true,
      browser: version.Browser,
      prompt,
      generatedImage: {
        alt: imageInfo.alt,
        src: imageInfo.src,
        w: imageInfo.w,
        h: imageInfo.h,
        mime,
      },
      downloadedFilePath: outputPath,
      outputDir: config.outputDir,
      method: 'page-fetch-save-image-as-equivalent',
    }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ ok: false, prompt, error: err.message }, null, 2));
    process.exitCode = 1;
  } finally {
    if (session) session.close();
  }
})();
