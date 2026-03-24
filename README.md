# வம்சம் · Vaṃsam

Vaṃsam is a local-first family graph editor for building and exploring a family tree one person at a time.

It is designed for manual curation rather than bulk import:
- start from a blank graph
- add people deliberately
- store only core family structure
- derive relationships like siblings through traversal

## What It Does

- Create and edit people on a graph canvas
- Store only `parent_of` and `partner_of` relationships
- Derive sibling relationships from shared parents
- Add quick relatives: parent, child, partner, sibling
- Search people and inspect/edit details in a side panel
- Ask “Who is X to Y?” and inspect the BFS relationship path
- **Family directory view** with generation-based grouping and personalized kinship labels
- **”I am [X]” identity** — set once, see every person's kinship relative to you
- **Photo grid browse** for visual person lookup
- **In-law detection** (brother-in-law, sister-in-law)
- Save locally in the browser
- Import/export the graph as JSON

## Current Model

Vaṃsam intentionally keeps the stored graph minimal.

Stored edges:
- `parent_of`
- `partner_of`

Derived relationships:
- sibling
- grandparent / grandchild
- aunt / uncle
- cousin
- some Tamil kinship labels such as `mama`, `mami`, `chitti`, `athai`, `athimber`

This keeps the data model cleaner and avoids contradictory duplicate relationship edges.

## Tech Stack

- React
- TypeScript
- Vite
- React Flow
- ELK.js for auto-layout
- IndexedDB via `idb`
- GitHub Pages deployment via GitHub Actions

## Local Development

```bash
npm install
npm run dev
```

Then open the local Vite URL, usually:

```text
http://localhost:5173/
```

## Build

```bash
npm run build
```

## Data and Persistence

- Workspace state is stored in IndexedDB in the browser
- The app can export/import a JSON graph file
- The default seed is a blank graph
- Imported graphs are sanitized to the current core relationship model

## Editing Workflow

Recommended workflow:

1. Add the first person.
2. Add parents, children, and partners using quick actions.
3. Use `Add sibling` only as a helper for creating shared-parent structure.
4. Fill in details like dates, place, links, and private notes.

## Notes

- `Private notes` is only a UI/data distinction for now.
- Supabase auth with OAuth (Google) and invite-based access is implemented.
- Role-based access: admin, editor, viewer with change request approval workflow.

## Status

This is an actively evolving prototype. The current focus is:
- clean local-first editing
- minimal canonical relationship storage
- better family-specific traversal and visualization
