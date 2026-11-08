# Supernote data model

## Devices

| Id | Constant | Device | Page px (portrait) | EMR max (portrait) |
|---|---|---|---|---|
| 0 | `MACHINE_TYPE_A5` | A5 | 1404×1872 | 15819×11864 |
| 1 | `MACHINE_TYPE_A6` | A6 | 1404×1872 | 15819×11864 |
| 2 | `MACHINE_TYPE_A6X` | A6X | 1404×1872 | 15819×11864 |
| 3 | `MACHINE_TYPE_A5X` | A5X | 1404×1872 | 15819×11864 |
| 4 | `MACHINE_TYPE_NOMAD` | A6X2 Nomad | 1404×1872 | 15819×11864 |
| 5 | `MACHINE_TYPE_MANTA` | A5X2 Manta | 1920×2560 | 21632×16224 |

Landscape swaps width and height in both systems. Pixel origin is top-left,
y grows downward. EMR units are finer than pixels and are what stroke points
are stored in. Always fetch the page size from `PluginFileAPI.getPageSize`
rather than hard-coding, because page composition can produce other sizes.

## Element types

`Element.type` selects which sub-object is populated.

| Constant | Value | Sub-object | Layers |
|---|---|---|---|
| `TYPE_STROKE` | 0 | `stroke` | main + custom |
| `TYPE_TITLE` | 100 | `title` | main only |
| `TYPE_PICTURE` | 200 | `picture` | main + custom |
| `TYPE_TEXTBOX` | 500 | `textBox` | main + custom |
| `TYPE_DIGEST_QUOTE_TEXTBOX` | 501 | `textBox` | main only |
| `TYPE_DIGEST_CREATED_TEXTBOX` | 502 | `textBox` | main only |
| `TYPE_LINK` | 600 | `link` | main only |
| `TYPE_GEOMETRY` | 700 | `geometry` | main + custom |
| `TYPE_FIVE_STAR` | 800 | `fiveStar` | main only |

Core `Element` fields: `uuid`, `type`, `pageNum`, `layerNum`, `thickness`,
`maxX`, `maxY`, `status`, `recognizeResult: RecogResultData | null`, large
fields `angles` and `contoursSrc` as `ElementDataAccessor`, and
`recycle(): Promise<void>`.

`ElementDataAccessor<T>`: `size()`, `get(i)`, `getRange(start, count)`, plus
`add`, `set`, `setRange`, `preload`, `isCached`, `clearCache`. Data lives on
the native side until requested; never assume a point array is in JS.

## Layers

| Id | Name | Delete | Rename | Reorder | Notes |
|---|---|---|---|---|---|
| -1 | Background | no | no | no | visibility toggle only |
| 0 | Main | no | no | yes | required for titles, links, digests |
| 1–3 | Custom | yes | yes | yes | |

`Layer = {layerId, name, isCurrentLayer, isVisible}`.

## Stroke and pen

| Field | Values |
|---|---|
| `penColor` | `0x00` black, `0x9D` dark grey, `0xC9` light grey, `0xFE` white |
| `penType` | `10` fineliner, `1` pressure pen, `11` marker, `14` calligraphy |
| `penWidth` / `PenInfo.width` | minimum 100 |
| `points` | accessor of `Point`, EMR coords |
| `pressures` | accessor of number, 0–4096 |
| `recognPoints` | accessor of `RecognData {X, Y, Flag, timestamp}`, pixel coords, MyScript-compatible |
| `eraseLineTrailNums`, `flagDraw`, `markPenDirection` | accessors |

`PenInfo = {type, color, width}` from `PluginCommAPI.getPenInfo()`.

`RecogResultData` on `Element.recognizeResult`: `predict_name` (default
`'others'`), `up_left_point_x/y`, `key_point_x/y`, `down_right_point_x/y`
in pixels.

## TextBox

`fontSize`, `fontPath`, `textContentFull`, `textRect: Rect` (pixels),
`textDigestData`, `textAlign` 0 left 1 centre 2 right, `textBold` 0/1,
`textItalics` 0/1, `textFrameWidthType` 0 fixed 1 auto, `textFrameStyle` 0
none 3 stroke border (digest boxes), `textEditable` 0 editable 1 locked.

## Title

`X`, `Y`, `width`, `height` (pixels), `page`, `style` (0 remove, 1 black bg,
2 grey-white, 3 grey-black, 4 shadow), `controlTrailNums` (stroke indices
belonging to the title).

## Link

`category` 0 text link, 1 stroke link; `X`, `Y`, `width`, `height`, `page`;
`style` 0 solid underline, 1 solid border, 2 dashed border; `linkType` 0 note
page, 1 note file, 2 document, 3 image, 4 URL, 6 digest (read-only);
`destPath` (URL when type 4), `destPage`; text-link fields `fontSize`,
`fullText`, `showText`, `italic`; stroke-link field `controlTrailNums`.

`TextLink` for `insertTextLink`: `destPath`, `destPage` (types 0 and 2),
`style`, `linkType` 0–4, `rect` (non-zero area), `fontSize`, `showText`,
`fullText`, `isItalic`.

## Geometry

`type`: `'straightLine'`, `'GEO_circle'`, `'GEO_ellipse'`, `'GEO_polygon'`.
Fields: `penColor`, `penType`, `penWidth` (≥100), `points: Point[]` (pixels,
polygon vertices or line ends), `ellipseCenterPoint`, `ellipseMajorAxisRadius`,
`ellipseMinorAxisRadius`, `ellipseAngle` (radians), `showLassoAfterInsert`.

## Picture

`picturePath`, `rect` (pixels).

## KeyWord

`{keyword: string, page: number (0-based), index: number (1-based)}`.
Keywords are searchable in the device UI and are a convenient per-page string
store for plugin metadata.

## Template

`{name, vUri, hUri}`; URIs are usable as React Native `Image` sources.

## Lasso `editDataTypes`

0 strokes, 1 titles, 2 images, 3 text, 4 links, 5 geometry. A lasso button
shows only when the selection contains at least one listed type.

## Button types and visibility

| Type | Where | Apps | Condition |
|---|---|---|---|
| 1 | left toolbar | NOTE, DOC | file open |
| 2 | lasso toolbar | NOTE | selection matches `editDataTypes` |
| 3 | text-selection toolbar | DOC | text selected |

`showType` 0 no UI (background handler), 1 full-screen plugin UI.

## Package layout (`.snplg` is a zip)

```
MyPlugin.snplg
├── PluginConfig.json      manifest
├── MyPlugin.bundle        Metro JS bundle (plain JS, not Hermes bytecode)
├── icon.png               plugin icon (copied from iconPath)
├── drawable-mdpi/         bundled image assets
└── app.npk                native APK, only when the project has Java/Kotlin
```

`PluginConfig.json` fields: `name`, `desc`, `iconPath`, `versionName`,
`versionCode`, `pluginID` (16 chars, immutable), `pluginKey` (= app.json
name), `jsMainPath` (`index`), optional `author`, and `reactPackages` /
`nativeCodePackage` written by the build when native code exists.
