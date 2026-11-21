# References

Two tables. The build compiles them into the plugin; the References tab on
the Manta searches them, opens the book at the page, and inserts links.

## Books

`file name contains` is matched (case-insensitive) against the names of the
documents under the Manta's Document folder. `offset` is how far the PDF's
page index is from the printed page number: calibrate once per book on the
device (References tab → Calibrate) and write the number here.

| key | file name contains | offset |
| --- | --- | --- |
| MM | Monster Manual | 0 |
| PHB | Player's Handbook | 0 |
| DMG | Dungeon Master's Guide | 0 |
| EXAMPLE | no-such-file | 0 |

## Entries

`page` is the printed page number as it appears on the page. `tags` are
free text and searchable. Rows whose page is not a number are skipped.

| name | book | page | tags |
| --- | --- | --- | --- |
| Example: Owlbear | EXAMPLE | 1 | monstrosity, example row, replace me |
| Example: Fireball | EXAMPLE | 2 | spell, 3rd level, example row |
| Example: Grappled | EXAMPLE | 3 | condition, example row |
