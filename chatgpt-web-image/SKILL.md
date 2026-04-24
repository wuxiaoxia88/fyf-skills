---
name: chatgpt-web-image
description: Use a dedicated logged-in ChatGPT Web browser session to generate images, download them locally, and return saved file paths. Trigger when the user asks to generate images through ChatGPT Web specifically.
version: 0.1.0
author: Hermes Agent
license: MIT
---

# ChatGPT Web Image

Use this skill when the user wants image generation through the ChatGPT website, not the API.

This skill assumes:
- Google Chrome is installed locally
- A dedicated Chrome profile is used for ChatGPT Web automation
- Chrome is started with a remote debugging port
- The user is already logged into ChatGPT in that dedicated profile

## Trigger phrases

Use this skill when the request includes things like:
- "用 ChatGPT 网页版生图"
- "通过 ChatGPT 网页版生成图片"
- "chatgpt web image generation"
- "chatgpt 网页下载图片"

## Required browser setup

Preferred launch command on macOS:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.chatgpt-image-skill-chrome" \
  --no-first-run \
  --no-default-browser-check \
  https://chatgpt.com/
```

## Execution order

1. Run `scripts/probe_chatgpt.js` first to verify login state and current selectors.
2. If probe passes, run `scripts/run_generate_image.js "<prompt>"`.
3. Prefer direct image save flow:
   - generate image
   - locate latest generated image element
   - fetch the real image source from page context (equivalent to right-click → Save Image As)
   - write the file into the default Downloads folder or configured output directory
4. Return the final local file path.

## Current confirmed selectors/state

Validated during live testing on macOS + local Chrome 147 + ChatGPT Chinese UI.

- Input box:
  - `#prompt-textarea`
  - fallback: `div[contenteditable="true"][role="textbox"]`
- Send button after prompt fill:
  - `#composer-submit-button`
  - `[data-testid="send-button"]`
  - observed aria-label: `发送提示`
- Generation state markers:
  - in progress: button aria-label contains `停止流式传输`
  - post-complete marker may show text `已停止思考`
- Generated image candidates:
  - sometimes `img[alt="已生成图片"]`
  - sometimes a descriptive alt such as the generated subject text
  - most reliable rule in v1: newest visible image with width/height >= 512 and `src` containing `/backend-api/estuary/content?id=file_`
- Share image button:
  - button with `aria-label="分享此图片"`
  - when multiple generated images are present, prefer the last visible matching share button
- Download entry:
  - button inside the share dialog/popover with visible text `下载`
  - clicking the share button via DOM `element.click()` was more reliable than simulated coordinate clicks in repeated-image layouts
  - clicking the dialog download button via DOM `element.click()` was also more reliable than coordinate clicks
- Download path:
  - v1 now prefers direct page-side image fetch from the generated image `src`
  - this behaves like right-click → Save Image As, but is automated inside the page context
  - default output directory is `~/Downloads` unless overridden by `CHATGPT_IMAGE_OUTPUT_DIR`

## Files

- `scripts/config.js` — browser/session/output configuration
- `scripts/cdp_helpers.js` — low-level CDP helpers
- `scripts/probe_chatgpt.js` — non-destructive selector/state probe
- `scripts/run_generate_image.js` — v1 end-to-end generation and download
- `references/selectors-notes.md` — current verified selectors
- `references/chatgpt-web-flow.md` — workflow notes
- `references/troubleshooting.md` — common failures and recoveries

## Rules

- Always use the dedicated Chrome profile.
- Do not rely on anonymous browser sessions.
- Prefer download interception over screenshots.
- If selectors fail, rerun the probe before modifying the workflow.
- Return exact file paths and the failing step when errors occur.

## Example usage

Probe only:

```bash
node ./chatgpt-web-image/scripts/probe_chatgpt.js
```

Generate one image:

```bash
node ./chatgpt-web-image/scripts/run_generate_image.js "Generate a simple red apple icon on white background"
```
