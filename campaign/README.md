# Campaign scripts

Write one Markdown file per session here. The build turns them into
`src/campaign.generated.json`, which is bundled into the plugin, and the
Script tab on the Manta lays scenes onto note pages as text boxes.

Rules, kept deliberately small:

```markdown
# Session 12: The Drowned Chapel        ← file title; "Session 12" sets the number

## Strong start: The bells ring under water
Body paragraphs are plain text. Blank line between paragraphs.

> Text in a blockquote is read-aloud and is inserted in italics.

## Scene: Negotiation with the ferryman
- Bullets become lines starting with "•".
- Keep paragraphs short; each becomes its own text box.

## Scene: The chapel steps
...
```

- `#` once per file for the session title. If it contains a number, that is
  the session number; otherwise the file name's leading number is used
  (`02-rooms-of-weeping.md` → session 2), else name order.
- `##` starts a scene. Anything before the first `##` is the session intro.
- Everything else is plain text. Markdown emphasis is left as typed.
- Files are read in name order; use `01-`, `02-` prefixes if you like.
- `TEMPLATE.md`, `README.md` and any file starting with `_` are skipped.
  Copy `TEMPLATE.md` to `02-whatever.md` to start a session.
- Every `##` heading becomes a Supernote title on the page, so the note's
  own title navigation lists your scenes.

`characters/` holds one file per player character in the same format; see
`characters/README.md`. `references.md` is the look-up table (books and entries); its two tables are
compiled the same way. See the notes inside that file.

Then build: `tools\deploy.cmd` on Windows, or `npm run build` elsewhere. The
Markdown is only read at build time; editing it does nothing until you
rebuild and reinstall.
