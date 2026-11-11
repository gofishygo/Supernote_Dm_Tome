# Icon sources

`tome.svg` → `assets/icon.png` (toolbar button and Plugins page).
`capture.svg` → `assets/capture.png` (lasso toolbar button).

Rasterize at 96×96 with a transparent background. Any renderer works; the
repo used headless Chromium via Playwright:

```js
const {chromium} = require('playwright');
const page = await (await chromium.launch()).newPage({viewport: {width: 96, height: 96}});
await page.setContent(`<body style="margin:0">${fs.readFileSync('tome.svg','utf8')}</body>`);
await page.screenshot({path: 'icon.png', omitBackground: true});
```

E-ink rules: pure black strokes at least 3.5 units wide on a 96 grid, no
greys, no fine detail under about 4 units.
