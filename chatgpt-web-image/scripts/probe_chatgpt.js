const { CDPSession, getVersion, getChatGPTPage } = require('./cdp_helpers');

(async () => {
  let session;
  try {
    const version = await getVersion();
    const page = await getChatGPTPage();
    session = new CDPSession(page.webSocketDebuggerUrl);
    await session.connect();
    await session.send('Runtime.enable');

    const data = await session.eval(`(() => {
      const visible = el => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
      };
      const describe = el => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          id: el.id || '',
          text: (el.innerText || el.textContent || '').trim().slice(0, 100),
          aria: el.getAttribute('aria-label') || '',
          dataTestId: el.getAttribute('data-testid') || el.getAttribute('data-test-id') || '',
          className: (el.className || '').toString(),
          rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        };
      };

      const input = document.querySelector('#prompt-textarea') || Array.from(document.querySelectorAll('[contenteditable="true"][role="textbox"], textarea')).find(visible) || null;
      const imageBtn = Array.from(document.querySelectorAll('button,[role="button"]')).filter(visible).find(el => /生成图片|create image|image/i.test((el.innerText||el.textContent||'') + ' ' + (el.getAttribute('aria-label')||''))) || null;
      const profileImg = Array.from(document.querySelectorAll('img')).find(el => /个人资料图片|profile/i.test((el.getAttribute('alt')||''))) || null;
      const bodyText = (document.body?.innerText || '').slice(0, 2000);

      return {
        title: document.title,
        url: location.href,
        loggedInLikely: !!profileImg && !!input,
        input: describe(input),
        imageButton: describe(imageBtn),
        profileImage: describe(profileImg),
        bodyText,
      };
    })()`);

    console.log(JSON.stringify({
      ok: true,
      browser: version.Browser,
      wsUrl: page.webSocketDebuggerUrl,
      probe: data,
    }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
    process.exitCode = 1;
  } finally {
    if (session) session.close();
  }
})();
