# PitchCraft Soccer Training Library

This project is a visual exercise library for soccer coaches.

## What it does
- Loads exercises from Markdown files.
- Supports image or video media per exercise.
- Filters by:
  - Age group tags
  - Complexity
  - Date
  - Custom tags
  - Number of players
  - Number of goalkeepers
  - Free text search

## Run it
Serve the folder with any local static web server, then open `index.html`.

Example with Python:

```bash
python -m http.server 5500
```

Then open:

`http://localhost:5500`

## Markdown exercise format
Each exercise should use frontmatter at the top:

```md
---
title: Name of Drill
age_group: U10, U12
complexity: 6
intensity: 7
players: 12
gks: 1
tags: passing, transition, finishing
media_type: image
media_url: quick-transition-rondo.svg
---
## Setup
- Field dimensions
- Number of players per area

## Rules
- Main exercise rules

## Coaching Points
- Key points to coach

[torschuss_250326.jpg]
```

Notes:
- `age_group` and `tags` are comma-separated lists.
- `complexity` is a number from `1` to `10`.
- `intensity` is a number from `1` to `10`.
- Exercise dates are read from the markdown filename when it ends like `_050326.md` (`DDMMYY`).
- If a filename does not end in that pattern, the exercise date defaults to `01.07.25`.
- `media_type` can be `image` or `video`.
- Store media files locally in `data/visual/`.
- `media_url` should point to a local file in that folder (for example `drill-1.gif` or `session-a.mp4`).
- You can place extra visuals anywhere in the markdown body with `[filename.jpg]` or `[[filename.jpg]]` (Obsidian style).
- You can create collapsible spoiler blocks with:
  `<details>`, `<summary>Your title</summary>`, and `</details>`.
- GIF files loop automatically by browser behavior.
- If `media_url` is missing, a fallback image is used.

## Add new built-in drills
1. Add your media file to:
   - `data/visual/`
2. Add a `.md` file to:
   - `data/exercises/`
3. Reference the visual filename in `media_url` (example: `my-drill.gif`).
4. Refresh the page.

The app auto-discovers `.md` files in `data/exercises/` when directory listings are available locally.

For GitHub Pages:
- Keep `data/exercises/index.json` up to date.
- GitHub Pages does not expose folder listings, so the manifest is what loads your drills.

## Update the manifest
Run this locally after adding or removing exercise files:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\update-exercise-index.ps1
```

This rebuilds `data/exercises/index.json` from all `.md` files in `data/exercises/`.
