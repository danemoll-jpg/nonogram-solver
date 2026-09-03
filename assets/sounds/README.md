# Sound placeholders

These eight `.mp3` files are **silent placeholders** — each is 10 repeats of a single
hand-built, all-zero-payload MPEG-1 Layer III frame (~260ms), not real sound design. They
exist so the playback plumbing (`src/sounds.js`) has real files to load and play during
development, with no 404s or missing-file console noise.

**Drop in real files generated via ElevenLabs at these exact same filenames** and no code
changes are needed — `src/sounds.js` references them by these names.

| File | Trigger |
|---|---|
| `batch-complete-chime.mp3` | auto-X or a hint completing multiple cells at once |
| `error.mp3` | an auto-check-caught mistake, or a line turning red (contradiction) |
| `complete-fanfare.mp3` | full puzzle solved |
| `lock.mp3` | a row/column becomes fully marked and locks |
| `unlock.mp3` | a fill is cleared and a locked line becomes editable again |

`fill-click.mp3`, `x-click.mp3`, and `drag-sweep.mp3` are no longer referenced by
`src/sounds.js` — the per-cell dinging on every routine fill/X mark or drag-sweep step was
removed per the project owner's direct feedback (see `TODO.md`'s Completed Tasks). The
files are left in place harmlessly rather than deleted; nothing loads them anymore.
