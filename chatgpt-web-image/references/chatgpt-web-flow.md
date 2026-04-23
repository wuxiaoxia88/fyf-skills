# ChatGPT Web Flow

## v1 workflow
1. Connect to Chrome over CDP
2. Resolve the ChatGPT tab, or create one if needed
3. Verify login state and prompt input visibility
4. Enter image mode if the home composer still shows the quick-action surface
5. Fill the prompt
6. Click send
7. Poll until a generated image appears and the stop-streaming state is gone
8. Click `分享此图片`
9. Click `下载` in the share dialog
10. Capture the local file path from CDP download events
11. Return the saved path and debug summary

## Why this path
This path is better than screenshot capture because:
- it returns the original asset instead of a rasterized screenshot
- it uses the browser's native download path
- it avoids Chrome cache scraping

## Current assumptions
- The user is logged in already
- The active UI is Chinese
- The current account has image generation enabled on the home composer
