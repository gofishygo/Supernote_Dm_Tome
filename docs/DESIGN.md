# DM Tome: design

A Supernote Manta plugin for a Dungeons & Dragons dungeon master. Four
pillars, decided with the user on 2026-11-08:

1. **Working script**: the scene-by-scene text you run the session from.
2. **Reference guide**: tappable links into rulebook and module PDFs at the
   exact page (5e 2024 core books, homebrew campaign).
3. **In-session notes**: handwriting stays handwriting; the plugin organizes
   around it rather than replacing it.
4. **Back-burner tasks**: a prep checklist where each task carries a due
   session number or in-game date, surfaced as due or overdue.

UI model: **hybrid**. Script and digests go into note pages as real text and
links, so you read and handwrite on one page. A full-screen **DM console**
handles lookups, task capture, and anything that needs search or scrolling.

Script sources: typed on a computer, handwritten on the Manta, and published
module PDFs. All three.

## Mental model: the note is the database

The SDK cannot read or write ordinary files, but it can read and write the
*inside* of a `.note` file: text boxes, links, titles, keywords, and stars.
Those survive cloud sync, device restarts, and plugin reinstalls, and they are
visible to you even if the plugin is uninstalled. So DM Tome stores its state
there:

| Data | Stored as | Read back with |
|---|---|---|
| Scene script | text boxes on scene pages | `getElements` → `textBox.textContentFull` |
| Scene headings | titles | `getTitles` |
| Reference links | text links, `linkType 2`, `destPage` | `getLassoLinks`, element traversal |
| Tasks | keywords on a dedicated **Back Burner** page, one per task, in a tiny grammar | `getKeyWords` |
| Flags during play | five-star marks next to handwriting | `searchFiveStars` |

Entry keyword grammar (one keyword per entry; human-readable so it still
makes sense in Supernote's own keyword search). Types come from the Lazy DM
shape of a session: a Strong Start to open, Scenes and Plot points that are
due on a session, and Heroes and NPCs that are always in play.

```
Strong start S12 | The inn is already burning when they arrive
Scene S12 | Negotiation with the ferryman
Plot S13 | The letter names the mayor
Hero | Thorin owes the thieves' guild a favor
NPC | Mira the fence, hates the guard captain
Quest S12 | Recover the bell of Saint Orm
Location | The Drowned Chapel
Lore | The red moon wakes the old kings
Treasure | Ring of the drowned king (unclaimed)
Task S12 | Print the harbour map             (DM to-do; Back Burner only)
S12 | Pay the ferryman                       (legacy plain task = Task)
... [x]                                      done or retired
```

Dated types carry `S<n>`; `S?` means someday. Persistent types carry no
session and sit in an "Always on" section until retired. Two views:

- **Tonight**: every type except Task. The current session's Strong start in
  its own panel (with a nag when missing), then Next up grouped by type with a
  glyph badge per entry (★ strong start, ⚔ scene, ❖ plot, ⚑ quest, ☺ hero,
  ☻ NPC, ⌂ location, ✎ lore, ◆ treasure), Always on with one sub-tab per
  type, then Overdue.
- **Back Burner**: the DM's to-do list, Task entries only: Overdue, Next up,
  Upcoming, Someday, Done.

"Push +1" moves a dated entry to the next session, the most common edit at
the table. Editing a keyword on the device also edits the entry, which is a
feature.

## Permissions

Everything that reads a note or PDF, including lasso capture, needs
`FILE:READ`; everything that writes elements needs `FILE:WRITE`. Both are
declared in the manifest. The console asks on open and the user should pick
"Always allow" once; "allow this time" expires each time the plugin closes.

## How typed content reaches the device

This is the one hard problem. `FileUtils` has no `readFile`. Three paths:

| Path | Needs | Trade-off |
|---|---|---|
| **A. Compile content into the plugin.** You write `campaign/*.md` on the PC, a Node script converts them into `campaign.json`, Metro bundles it, you reinstall. | Node only | Guaranteed to work. One reinstall per prep session. Fine for a hobby cadence. |
| **B. Read the script from a DOC file.** Export the script to PDF or TXT, sync to the Manta, open it in DOC, and the console pulls text with `PluginDocAPI.getCurrentDocText(page)` and lays it into a note. | Node only | Elegant and no reinstall, but untested. Version 0.1 does not probe it; version 0.2 will. |
| **C. Native file-read module.** | Android Studio, JDK, Gradle | Reopens the whole toolchain. Last resort. |

Decision, revised after the 102 finding: **A is the path** (built in 0.5.0).
B is weakened by the hosting-app rule: text can be read from a PDF only while
DOC hosts the plugin, and text boxes can be written only while NOTE hosts it,
with no file store to carry content between the two. C stays off the table.

How A works: `campaign/*.md` → `tools/build-campaign.mjs` →
`src/campaign.generated.json` (bundled by Metro) → Script tab → `insertText`
boxes on the current note page. One scene per tap; heading in bold, body in
paragraphs, blockquotes in italics for read-aloud text; "Insert below the
last" chains scenes down the page; box heights are estimated from text length
and the user can resize with the lasso. `tools\deploy.cmd` runs the compile
step before every build.

Handwritten prep needs no transport: the plugin reads titles, keywords and
recognized strokes from the notes you already wrote.

## The reference index

`campaign/references.md` holds two Markdown tables, compiled into the plugin
with the scripts:

```
| key | file name contains | offset |     (Books)
| MM  | Monster Manual     | 0      |

| name    | book | page | tags            |  (Entries; page is the printed number)
| Owlbear | MM   | 249  | monstrosity, CR3 |
```

Books resolve to documents on the device by file-name substring. The PDF
page index is `printed page - 1 + offset`; the References tab's calibrator
shows the offset after you type the printed number of the page on screen,
and you write it into the table once per book.

Three ways to use it: the look-up box on the References tab (Open, or
Insert link onto the current note page), "Look up" on the Capture screen
(lasso a name in your notes, open the stat block), and `REF` bookmarks made
on the device, which remain the per-page layer.

No page numbers ship with the plugin: a wrong page is worse than none, so
the table starts with example rows under a book that matches no file.

## PDF scenes

A scene can live in a separate document: a module addendum, a one-shot, a
map. Because DOC cannot write into a note, the entry is stored on the PDF
page itself (`Scene S12 | The owl den`), and the campaign note lists which
documents to gather from (`Doc | Death House` on page 0, set from the
References tab while the note is open). Tonight merges those entries with
the note's own; a PDF entry shows its file and opens the document at the
page. Each attached document costs one `getKeyWords` call over a 300-page
range when the board loads.

## Session flow

**Prep (PC + Manta)**
1. Write or revise `campaign/session-12.md` with `## Scene` headings.
2. `npm run build:win`, copy, reinstall.
3. On the Manta, console → **Build session page**: creates pages in the
   campaign note, one per scene, each with title, script text boxes, reference
   links, and blank space below for handwriting. Appends a **Back Burner**
   digest page listing due and overdue tasks.

**Play**
- Read the scene text, write under it.
- Tap a reference link to open the PDF; return with the back gesture.
- Lasso a scribble, tap **Capture**: recognition turns it into text; pick
  *Task* (with due session) or *Thread*; the console writes a keyword and
  closes. Three taps, no typing.
- Draw a star next to anything to flag it for review.

**After**
- Console → **Review**: lists captured tasks, starred pages, and lets you tick
  tasks done (rewrites the keyword with ✓).

## Release plan

| Version | Goal | New SDK calls exercised |
|---|---|---|
| 0.1–0.2 (done) | SDK probe console. Learn what works on the Manta. | getDeviceType, getCurrentFilePath/PageNum, getPageSize, getPageDisplaySize, canHandwrite, getPenInfo, paths, insertText, permissions, getFileList, jumpToPage, openFile, getKeyWords, getTitles, getLassoElements, recognizeElements |
| 0.3 (verified) | Back Burner: lasso capture → keyword task with due session; board with overdue/due/upcoming/someday, Done, jump to page; session counter kept as a page-0 keyword. | insertKeyWord, deleteKeyWord, getNoteTotalPageNum, jumpToPage, setLassoBoxState |
| 0.4 (built) | References: list documents under `Document`, open at last page, bookmark the page being read (keyword `REF name \| path \| page` on page 0 of `Note/DM Tome Index.note`, created on first use), open bookmarks at page, insert a text link to a bookmark into the current note, read a PDF page's text layer. Capture lasso registered for DOC too; Capture can also save the recognized text as a bookmark. | openFile, createNote, insertTextLink, getCurrentDocText, listFiles |
| 0.4.1 (built) | Entry types: Strong start, Scene, Plot point (dated); Hero, NPC (persistent); legacy Task. Two-step capture; board regrouped; Push +1. Probes: reinstall helper via `openFilePath`, full native method dump. | openFilePath |
| 0.4.3 (built) | Tonight tab: Strong start, due this session, always-on with one sub-tab per type, overdue. Bookmarks shortened to `REF name` on the page itself; scan documents for bookmarks; keyword-length probe. | getKeyWords over a wide page range |
| 0.4.4 (built) | Location and Lore persistent types; tome and lasso-quill icons. | |
| 0.4.5 (built) | Quest (dated) and Treasure (persistent); Back Burner shows Task entries only; "Next up" with glyph badges and a legend. Quick Access add/remove requested; the complete native method dump confirms no such hook exists, so the request is closed by the platform. | |
| 0.4.6–0.4.7 (built) | Keyword cap at the measured 40; helmet glyph; in-game day tracker (`DM day N` keyword on page 0) at the bottom of Tonight with a 14-day strip and step buttons. | |
| 0.4.8 (verified) | Calendar events as `Day 12 \| text` keywords on page 0; 14-day grid with event text, week scrolling, tap a day to add/remove events or make it today; events outside the window listed. Quick typed "New DM task" on Back Burner. | |
| 0.4.x | Seed table of 5e 2024 monsters/spells/conditions with page offsets per book, calibrated against the user's PDFs; digest page written into the note. | insertNotePage, insertText |
| 0.5.0 (built) | Script tab: Markdown → JSON at build time → scenes inserted as text boxes on the current note page, chained down the page. | insertText batches |
| 0.5.1 (verified) | Whole session onto new pages: save → `insertNotePage` ×N after the current page (template from `getNotePageTemplate`) → `reloadFile` → per page `jumpToPage`, verify `getCurrentPageNum`, lay the scene → save. Step log on screen. | insertNotePage, reloadFile |
| 0.5.2 (verified) | Scene headings become Supernote titles: after the heading box is written, `lassoElements(rect)` → `setLassoTitle({style: 2})` → `setLassoBoxState(2)`; a refusal leaves a plain bold heading and is logged. `campaign/TEMPLATE.md` added and excluded from the build. | lassoElements, setLassoTitle |
| 0.5.3 (verified) | Read-aloud boxes get a border: a `GEO_polygon` geometry (fineliner, pen width 150) drawn around the box with `insertGeometry`, since the text box's own border flag is read-only. | insertGeometry |
| 0.7.0 (verified) | PDF scenes: `Doc \| name` keywords on the note's page 0 attach documents (References → Documents → Attach); a Scene/Quest/etc. keyword written on a PDF page (Capture in DOC, or References → "Scene for tonight" with a session stepper) is gathered by Tonight when the note is open, shown with its file name and an Open button that `openFile`s the PDF at that page. Done/Push rewrite the keyword in the PDF. Per-document errors are listed on the board, which also answers whether NOTE may read a document's keywords. | getKeyWords on documents from NOTE, openFile |
| 0.6.1 (verified) | Campaign content: four Curse of Strahd sessions (41 scenes) in `campaign/`, numbered from file prefixes; `campaign/characters/*.md` compiled the same way and shown under a Characters switch on the Script tab with the same insert actions. Drafts for Torvald, Evander, Batrdlebee, Abraham from the scripts, guesses marked (check). | |
| 0.6.0 (built) | Reference table: `campaign/references.md` (Books: key, file-name match, offset; Entries: name, book, printed page, tags) compiled to JSON. References tab: look-up box, Open at page (`index = page - 1 + offset`), Insert link, book checker, per-book calibrator. Capture gains Look up. No page numbers are shipped; the user fills them from their PDFs. | openFile, insertTextLink |
| 0.5 | Polish: config button for campaign settings, session counter, review screen, star sweep. | registerConfigButton, searchFiveStars |

## E-ink UI rules

- Black on white only. Greys dither and ghost.
- No animation, no spinners. Show "working…" text, then the result.
- Batch state updates so the panel repaints once per action.
- Touch targets at least 56 px tall; the Manta is held, not mounted.
- Monospace for anything the user might transcribe to me.
