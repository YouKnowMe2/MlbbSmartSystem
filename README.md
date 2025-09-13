# MLBB Smart System

A lightweight, static web app to browse Mobile Legends: Bang Bang heroes. Search by name, filter by role and lane, and view clean hero cards. Data is loaded from `data/heroes.json` with a safe inline fallback if local fetch is blocked.

## Features
- Search: type-ahead filtering by hero name
- Filters: by role and by lane
- Accessible UI: keyboard-focusable cards, ARIA live regions
- Resilient data: falls back to an inline dataset if `data/heroes.json` can’t be fetched

## Quick Start
This app is fully static. Run it with any simple HTTP server to avoid browser restrictions on `file://` fetches.

- Python 3: `python -m http.server 5173`
  - Then open: `http://localhost:5173`
- VS Code: use the “Live Server” extension (Open `index.html` → “Open with Live Server”)

Once served, open the page and use the search box and dropdowns to filter heroes.

## Project Structure
- `index.html`: App shell and controls
- `app.js`: Logic for loading data, filtering, and rendering cards
- `styles.css`: Styling and layout
- `data/heroes.json`: Primary dataset you can expand

## Editing Data
Append new hero objects in `data/heroes.json` using this shape:

```
{
  "id": 11,
  "name": "Hero Name",
  "roles": ["Fighter"],
  "lanes": ["EXP", "Roam"],
  "year": 2020,
  "img": "https://example.com/optional-image.jpg"
}
```
- `img` is optional; a placeholder is generated when missing.
- `lanes` accepts: Gold, EXP, Mid, Jungle, Roam, or Any.

## Deploying (GitHub Pages)
1. Push the repo to GitHub (done).
2. In GitHub → Settings → Pages:
   - Build and deployment: Deploy from branch
   - Branch: `main` / root
3. Open the provided Pages URL when the build finishes.

## Suggested Repo Metadata
If you use GitHub CLI (`gh`), you can set these from your terminal:

- Description: `gh repo edit --description "Browse MLBB heroes with search and filters."`
- Topics: `gh repo edit --add-topic mlbb --add-topic javascript --add-topic web --add-topic frontend --add-topic static-site`

Alternatively, set these in GitHub → repo homepage → “About” (right sidebar) → Edit.

## Branch Protections (Recommended)
Enable on `main` via GitHub → Settings → Branches → Add rule:
- Require pull request reviews: 1+ reviewer
- Require status checks to pass: enable if you add CI later
- Require linear history: optional
- Restrict who can push: optional for teams

## Roadmap Ideas
- Add images per hero and thumbnails
- Sort controls (name/year)
- Persist filters in the URL (query params)
- Unit tests for filtering logic

## License
Not specified. Add a license file if you plan to open source (e.g., MIT or Apache-2.0).

## Data Updates (Fandom)
- Script: `scripts/fetch_fandom.js` fetches heroes and items from the MLBB Fandom API and writes to `data/heroes.json` and `data/items.json`.
- Images: by policy, we store image URLs (not local files). The app uses these URLs directly.
- Run locally: `node scripts/fetch_fandom.js` (requires network access).
- Attribution: Data and images originate from the MLBB Fandom wiki. Check image licenses on Fandom before redistributing.
