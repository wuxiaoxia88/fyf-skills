# ChatGPT Web Flow

## v1 workflow
1. Connect to Chrome over CDP
2. Resolve the ChatGPT tab, or create one if needed
3. Verify login state and prompt input visibility
4. Enter image mode if the home composer still shows the quick-action surface
5. Fill the prompt
6. Click send
7. Poll until a generated image appears and the stop-streaming state is gone
8. Record the generated image set before submission, then wait for a newly appeared generated image `src`
9. Select only the image(s) newly created by the current request
10. Use current browser session cookies to fetch that new image in Node
11. Save the local file into the configured output directory (default: `~/Downloads`)
12. Return the saved path and debug summary

## Why this path
This path is better than screenshot capture because:
- it returns the original asset instead of a rasterized screenshot
- it avoids the share-dialog blob download path
- it behaves more like right-click → Save Image As on the actual generated image
- it avoids Chrome cache scraping

## Current assumptions
- The user is logged in already
- The active UI is Chinese
- The current account has image generation enabled on the home composer
