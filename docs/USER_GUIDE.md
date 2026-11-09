# Lexis — Teacher's guide (Windows)

## Install
1. Run **LexisSetup-1.0.4.exe**. No administrator rights are needed.
   If Windows shows “Windows protected your PC”, click **More info → Run anyway**. Windows shows this for
   apps without a paid publisher certificate.
2. A **Lexis** icon is added to the desktop and Start menu. Tick “Start Lexis now” to open it.

Lexis opens in your normal browser (Chrome or Edge) at **http://127.0.0.1:8000**. It works without internet.
If another program is already using that address, Lexis uses the next one (8001, 8002, …) and opens it for you.
A small black window also opens — that is the Lexis server. Keep it open while you work.

## Start and stop
- **Start:** double-click the Lexis icon. If Lexis is already running, the icon just opens the browser again.
- **Stop:** close the black Lexis window (or press Ctrl+C in it). Closing the browser tab does not stop it.
- Everything is saved immediately — there is no “Save file” step. Data survives closing the app and restarting the PC.

## Where your data is
`%LOCALAPPDATA%\Lexis\` (paste this into the File Explorer address bar)
- `lexis.db` — your database (words, students, schedules, review history)
- `backups\` — automatic and manual backups
- `logs\lexis.log` — technical log, useful if something goes wrong

Settings → *Data & version* shows the exact paths.

## Backup
- **Automatic:** a backup is made every time Lexis starts and before every update. The last 30 are kept (Settings).
- **Manual:** Settings → **Back up now**. The file is kept in the backups folder and also downloaded, so you can copy it
  to a USB stick or a cloud folder. Recommended: once a week, keep a copy somewhere other than this PC.

## Restore
Settings → **Restore from file…** → choose a `.db` backup (from the backups folder or your downloads).
Before restoring, Lexis saves the current data as a *pre-restore* backup, so a restore can always be undone by
restoring that file. Damaged or wrong files are refused and nothing is changed.

### Moving to a new computer
1. On the old computer: Settings → **Back up now**, and copy the downloaded `.db` file to a USB stick or a cloud folder.
2. On the new computer: run **LexisSetup**, open Lexis, then Settings → **Restore from file…** and choose that file.

Everything comes back: words, students, assignments, sets, FSRS schedules, review history and settings.
The CSV exports are for reading in Excel, not for restoring. Only the Vocabulary bank CSV can be brought back in, through
**Import**, and it brings back words only. Use a backup to move everything.

## Update to a new version
Run the new **LexisSetup** file. Your data is not touched. On the first start Lexis backs up the database
(*pre-update* backup) and then upgrades it automatically. If anything goes wrong, install the previous version and
restore the *pre-update* backup.

## Uninstall
Windows Settings → Apps → Lexis → Uninstall. Your data folder is kept; delete `%LOCALAPPDATA%\Lexis` yourself if you
really want to remove everything.

## Everyday use
| I want to… | Where |
|---|---|
| Add one word | Vocabulary → **Add word** (Ctrl+N), save with Ctrl+Enter |
| Add many words | Vocabulary → **Add rows** (paste from Excel), or **Import CSV** |
| Find words | Vocabulary search (press **/**), filters below it. Put a word in quotes for an exact match: `"bank"` |
| See what a student does not have yet | Choose the student → **Not assigned** |
| Assign words | Select rows (Shift-click, or the top checkbox for all filtered) → **Assign** |
| Review with a student | **Review** → choose student and what to review → **Start** |
| Make a Zoom revision list | **Revision batch** → Scramble → difficulty → what to show → **Copy to clipboard** → paste in Zoom chat |
| See a student's progress | **Students** → click the student |

### Review keyboard shortcuts (change them in Settings)
`1` Again · `2` Hard · `3` Good · `4` Easy · `Space` show/hide all · `P` Polish · `D` definition · `E` example ·
`→` next · `←` previous. Shortcuts never fire while you are typing in a box.

### Showing and hiding fields during a review
Polish, definition and example are all visible when a review starts. If you hide one (click it, or press its key), it
stays hidden on every following word until you close the review. The next review starts with everything visible again.

### Copying selected words
Select rows → **Copy**: English only, Polish only, definition only, English + Polish, English + definition,
Polish + definition, English + Polish + definition, or English + example. Only the words are copied, with no headings.
In a one-per-line list, a word with nothing to copy (for example no Polish in “Polish only”) is left out and the message
says how many. In a table it keeps its empty row.

### Adding many words: reading long cells
In **Add rows**, click any cell and its full text appears in the box under the grid. You can read it there, or edit it
there.

### Duplicates
A word counts as a duplicate when it has the same English **and** the same part of speech as another word (a word with
no part of speech matches any part of speech). SUIT (noun) and SUIT (verb) are different words. A second ALTER (verb) is
a duplicate even if its definition is worded differently, which is common in AI-generated lists that give a word once
per CEFR level.

Duplicates are **flagged, never blocked**: they are added, and you clean them up later when you choose.

- **Add rows** marks duplicates in orange while you type or paste (a row that repeats an earlier row, or a word
  already in the bank). They are still added. **Show duplicates only** lists them. To leave one out, click a cell in
  that row and tick **Leave this row out**.
- **Import CSV** adds the same rows by default and marks them *Duplicate?*; choose **Skip** for any you don't want.
  A row that is identical to a word in the bank (same word and same definition) is skipped by default.
- **Add word** shows the matching word already in the bank, and adds the new one anyway.
- **Cleaning up later: the Duplicates tab** in the sidebar (the orange number shows how many words are in the bank
  more than once; the **N duplicates** button on the Vocabulary page opens it too). Each group lists every copy with
  its Polish, definition and example. Use **Find a word** to jump to one.
  - **Remove** deletes one copy (a copy with review history is archived instead, so no history is lost).
    **Edit** opens the copy to change it.
  - Or tick groups, choose the copy to keep in each (the suggested one has the most learning history, then the most
    filled-in fields) and press **Merge**. The other copies' sets, topics and student progress move to the kept
    word, and only its empty fields are filled from them. If a student already has the kept word, the other copy is
    archived instead of deleted, so no history is lost. Take a backup first.
  - **Different meanings, keep all** (for example BANK: money / river) takes a group off the list for good.

### Revision batch difficulty
- **Easy** – about 70 % of letters shown (first letter always shown)
- **Medium** – about half shown (first letter always shown)
- **Hard** – about a quarter shown
- **Very hard** – no letters, only blanks

Spaces, hyphens and apostrophes always stay visible. **Only Polish** shows just the Polish word (the student writes
the English). **Only English** shows the word with blanks. **Both** shows `Polish – b _ n k`. “Copy answer key” copies
the full words for you.

**Polish side uses** chooses Polish, definition, or Polish + definition (`brzeg (the side of a river) – b _ n k`). A word
without the chosen field shows the other one, and the page tells you how many words this affects. A word with neither
shows only its blanks and is marked in orange.

### Can I change how often words come back?
Yes: Settings → **FSRS scheduling** → **Review frequency**, then **Save changes**. The slider is FSRS's own retention
target, the chance a student still remembers a word when it comes due. The default is 90 %. Higher brings words back
more often, lower brings them back less often; the page shows roughly how much the gaps change.

The setting applies to all students. A new value counts from each word's next rating, so due dates already set do not
move. **Reset to default (90%)**, then **Save changes**, returns to the FSRS default. Backups include this setting.
