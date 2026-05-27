# Fast Track

A quiet, monochrome intermittent fasting timer for Obsidian. Lives in the right sidebar. Uses your theme's accent color for everything that matters.

## Install

1. In your vault, open `.obsidian/plugins/` (create the `plugins` folder if it isn't there).
2. Create a folder called `fast-track` inside it.
3. Drop these three files into that folder:
   - `manifest.json`
   - `main.js`
   - `styles.css`
4. In Obsidian: **Settings → Community plugins**, turn off Restricted Mode if needed, then refresh the plugin list and enable **Fast Track**.

The pane will auto-open in the right sidebar. You can also open it via the ribbon icon (clock) or the command palette: `Fast Track: Open Fast Track`.

## Use

- **Begin fast** — starts the timer. The dial fills around the ring as you approach your furthest milestone.
- **Custom goal** — opens a small modal for a one-off custom duration. It slots into the milestone row alongside the defaults.
- **Pause / resume** — pause time doesn't count toward your fast.
- **End fast** — opens a modal where you can drop optional notes, then logs the fast to your daily note.

## How fasts are logged

When you end a fast, a callout block is appended to the daily note matching the fast's **start date** (so midnight-spanning fasts don't get split across two notes).

Example output:

```md
> [!fast] fast · 16h 47m
> 6:42 pm → 11:29 am (Mar 16)
> milestones: 12h ✓ · 16h ✓
>
> notes: easy morning, mild hunger around hour 14.
```

If the daily note doesn't exist yet, it gets created.

## Settings

- **Daily note folder** — where your daily notes live (leave blank for vault root).
- **Daily note filename format** — defaults to `YYYY-MM-DD`. Supports `YYYY`, `MM`, `DD`.
- **Callout type** — defaults to `fast`. You can change this to `tip`, `info`, or any custom callout you've styled in your theme/snippets.

## Styling the `fast` callout (optional)

Add this to a CSS snippet (`Settings → Appearance → CSS snippets`) to give the callout a custom look:

```css
.callout[data-callout="fast"] {
  --callout-color: var(--interactive-accent-rgb);
  --callout-icon: lucide-timer;
}
```

## Notes

- State persists across Obsidian restarts (stored in plugin data).
- The timer ticks in real time using the wall clock, so closing Obsidian and reopening it later resumes correctly.
- Milestone hits are silent — only the UI updates. No toasts, no system notifications.
