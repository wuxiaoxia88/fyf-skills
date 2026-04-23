# Selectors Notes

Verified on 2026-04-23 with Chinese ChatGPT Web UI.

## Input
- Primary: `#prompt-textarea`
- Fallback: `div[contenteditable="true"][role="textbox"]`

## Send button
- Primary: `#composer-submit-button`
- Fallback: `[data-testid="send-button"]`
- Expected aria-label after filling prompt: `发送提示`

## Image mode entry
- Home-surface button with visible text containing `生成图片`
- After entering image mode, quick-action surface includes labels such as `图片`, `Auto`, `浏览灵感`, `上传照片`

## Generation state
- In-progress stop marker seen as aria-label: `停止流式传输`
- Post-generation marker observed as text: `已停止思考`

## Generated image
- Primary candidate on first verified run: `img[alt="已生成图片"]`
- Additional verified variant: descriptive alt text such as `Purple crescent on white background`
- Practical v1 rule:
  - prefer the newest visible image with width >= 512 and height >= 512
  - and whose src contains `/backend-api/estuary/content?id=file_`
- Observed generated image size: 1254 x 1254

## Image actions
- Edit: button with aria-label `编辑图片`
- Share: button with aria-label `分享此图片`
- More actions: button with aria-label `更多操作`

## Share dialog
Observed visible actions inside share dialog:
- `复制链接`
- `X`
- `LinkedIn`
- `Reddit`
- `下载`

## Preferred download path
1. Generate image
2. Click `分享此图片`
3. Click dialog button with text `下载`
4. Capture file through CDP download events
