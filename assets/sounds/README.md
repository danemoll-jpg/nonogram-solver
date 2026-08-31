# Sound placeholders

These eight `.mp3` files are **silent placeholders** — each is 10 repeats of a single
hand-built, all-zero-payload MPEG-1 Layer III frame (~260ms), not real sound design. They
exist so the playback plumbing (`src/sounds.js`) has real files to load and play during
development, with no 404s or missing-file console noise.

**Drop in real files generated via ElevenLabs at these exact same filenames** and no code
changes are needed — `src/sounds.js` references them by these names.

| File | Trigger |
|---|---|
| `fill-click.mp3` | manual fill mark |
| `x-click.mp3` | manual "mark empty" |
| `drag-sweep.mp3` | click-and-drag across cells (see `src/sounds.js` for the two prototyped playback modes) |
| `batch-complete-chime.mp3` | auto-X or a hint completing multiple cells at once |
| `error.mp3` | an auto-check-caught mistake, or a line turning red (contradiction) |
| `complete-fanfare.mp3` | full puzzle solved |
| `lock.mp3` | a row/column becomes fully marked and locks |
| `unlock.mp3` | a fill is cleared and a locked line becomes editable again |

See `TODO.md`'s Current Objective for the drag-sweep prototyping writeup and recommendation.
