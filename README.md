# Fast Track

An intermittent-fasting timer for Obsidian. Lives in the right sidebar. Each completed fast becomes its own note in your vault. A dashboard note auto-aggregates all fasts into a heatmap, an hour-by-day grid, and a sortable table.

## Install

1. Put `manifest.json`, `main.js`, and `styles.css` in `<vault>/.obsidian/plugins/fast-track/`.
2. Settings → Community plugins → enable Fast Track.

The sidebar opens automatically. Ribbon icon (clock) or the command palette also work.

## How it works

**Active fast** lives in `data.json`. **Completed fasts** are written as individual notes inside `Fasting/Fasts/` (configurable). Each fast note has YAML frontmatter as the source of truth:

```yaml
---
fast-id: fkx8a2bz7d
start: 2026-05-27T18:42:00
end: 2026-05-28T11:29:00
duration-sec: 60420
duration-hr: 16.78
milestones-hit: [12h, 16h]
notes: easy morning
---
```

Edit the frontmatter manually, or use the dashboard. After editing, run **Rebuild fasting dashboard** (command palette) and the dashboard regenerates from the notes.

## The dashboard

`Fasting/Fasting.md` is the dashboard. Anything you write outside the `<!-- fast-track:auto-start -->` / `<!-- fast-track:auto-end -->` markers is preserved on rebuild. Inside the markers, Fast Track maintains:

- **Summary** — total fasts, total hours, average, longest, current streak.
- **Heatmap** — GitHub-style calendar grid colored by daily fasting hours.
- **Hour-by-day** — each row is a day, columns are the 24 hours, filled cells show when you were fasting.
- **Fasts** — sortable table of every fast with a link to its note.

The dashboard regenerates whenever a fast ends or you click **Rebuild** in settings.

## Daily-note callouts

When you end a fast, a small callout block is also written to the daily note for that end date:

```md
<!-- fast-track:id=fkx8a2bz7d -->
> [!fast] Fast Complete: 16 hours 47 mins
> 6:42 pm (May 27) → 11:29 am (May 28)
> milestones: 12h ✓ · 16h ✓
> 
> details: [[2026-05-27-fast-fkx8a2bz7d]]
```

The hidden marker on the first line is how Fast Track finds and rewrites the callout when you edit the fast. The link at the bottom opens the per-fast note for full details.

## Settings

- **Fasting folder / Fasts subfolder / Dashboard filename** — where things go.
- **Daily note folder / format / heading** — where the callout is inserted.
- **Callout type** — defaults to `fast`. Custom callouts can be styled via CSS snippets.
- **Show pause button** — off by default.
- **Heatmap weeks / Hour-by-day days** — how much history to show in the dashboard charts.

## Commands

- `Open Fast Track` — opens the sidebar.
- `Start or end fast` — toggle the timer (or open the end-fast modal if running).
- `Open fasting dashboard` — opens `Fasting.md`.
- `Rebuild fasting dashboard` — re-scans fast notes and regenerates dashboard.

## Notes

- The sidebar timer is the canonical UI for *running* a fast.
- Editing a *completed* fast: open its note, edit frontmatter, run Rebuild. UI for in-place editing in the dashboard is planned but not in v1.0.
- Deleting a fast note removes it from the dashboard on next rebuild. The daily-note callout is not auto-removed.
