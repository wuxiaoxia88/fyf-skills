# Troubleshooting

## Probe says not logged in
Log into ChatGPT in the dedicated Chrome profile, then rerun the probe.

## Input exists but send button never appears
Possible causes:
- text was not inserted into the actual composer
- the page focus moved
- ChatGPT is in an unexpected state
Action:
- rerun the probe
- reload the page in the same profile

## Generation never finishes
Possible causes:
- rate limiting or temporary server delay
- image generation disabled for the current surface
Action:
- wait longer once
- start a fresh chat
- retry with a simpler prompt

## Share button missing on image
Possible causes:
- image not fully rendered yet
- image card not hovered/active depending on UI variation
Action:
- poll longer
- click the image first
- inspect current image toolbar selectors

## Image fetch/save fails
Possible causes:
- generated image `src` was not found
- page-context fetch returned an auth or network error
- the output directory is not writable
Action:
- inspect the latest generated image selector
- verify the image `src` still contains `/backend-api/estuary/content?id=file_`
- retry once in the same logged-in session
- verify the configured output directory exists and is writable

## Share dialog/blob download path is confusing
The previous implementation relied on the share dialog's `下载` action, which could surface a `blob:` URL and make debugging confusing.
The current v1 prefers a more direct path: read the generated image `src`, fetch it in page context with browser credentials, and save the binary locally.

## Multiple generated images
v1 should prefer the newest visible generated image with the largest dimensions.
