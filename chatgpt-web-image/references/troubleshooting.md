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

## Download event never fires
Possible causes:
- Browser.setDownloadBehavior not configured
- dialog button was not the real download button
- popup/dialog changed
Action:
- inspect visible dialog buttons
- retry after reopening the share dialog

## Multiple generated images
v1 should prefer the newest visible generated image with the largest dimensions.
