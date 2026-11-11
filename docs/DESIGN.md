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

Task keyword grammar (one keyword per task; human-readable so it still makes
sense in Supernote's own keyword search):

```
S12 | Pay the ferryman's debt
D1492-03-14 | Red moon rises
S10 ✓ | Introduce the hooded stranger
```

`S<n>` = due session number, `D<yyyy-mm-dd>` = in-game date, trailing `✓` =
done. The console parses these, sorts, and marks overdue. Editing a keyword on
the device also edits the task, which is a feature.

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

Decision: **A for version 0.2**, **test B on-device in the same release**, and
switch the default to B if `getCurrentDocText` returns clean text from a
PDF or TXT. C stays off the table unless both fail.

Handwritten prep needs no transport: the plugin reads titles, keywords and
recognized strokes from the notes you already wrote.

## The reference index

A JSON table, maintained on the PC and compiled in (path A), maps a name to a
file and page:

```json
{ "books": { "MM24": "/storage/emulated/0/Supernote/Document/DnD/Monster Manual 2024.pdf" },
  "entries": [ { "name": "Owlbear", "book": "MM24", "page": 249, "tags": ["beast","CR3"] } ] }
```

Two ways to use it:

- **In the console**: search, tap, `PluginFileAPI.openFile(path, page)`.
- **In the note**: "Insert reference" writes `insertTextLink` entries so a scene
  page carries its own tappable stat-block links. Links must be on layer 0.

The actual PDF paths come from version 0.1's "List PDFs" probe, which is why
that probe exists.

For 5e 2024 the index starts as a seed of common monsters, conditions, and
spells with page numbers you confirm against your PDFs. Page numbers in a PDF
viewer are 0-based for the SDK and often offset from the printed page, so the
console will include a one-time "calibrate book" action: open the PDF to a
known printed page, read `getCurrentPageNum`, store the offset.

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
| 0.3 (built) | Back Burner: lasso capture → keyword task with due session; board with overdue/due/upcoming/someday, Done, jump to page; session counter kept as a page-0 keyword. | insertKeyWord, deleteKeyWord, getNoteTotalPageNum, jumpToPage, setLassoBoxState |
| 0.3.x | Digest page written into the note; probe `getCurrentDocText`. | insertNotePage, insertText, getCurrentDocText |
| 0.3 | Reference index: compiled JSON, console search, openFile, insert links into note. | insertTextLink, openFile with real PDF paths |
| 0.4 | Script pages: Markdown → JSON → scene pages with titles and text boxes. | setLassoTitle or title insert, insertText batches, insertNotePage |
| 0.5 | Polish: config button for campaign settings, session counter, review screen, star sweep. | registerConfigButton, searchFiveStars |

## E-ink UI rules

- Black on white only. Greys dither and ghost.
- No animation, no spinners. Show "working…" text, then the result.
- Batch state updates so the panel repaints once per action.
- Touch targets at least 56 px tall; the Manta is held, not mounted.
- Monospace for anything the user might transcribe to me.
