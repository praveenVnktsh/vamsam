# TODOS

## P1 — High Priority

(No open P1 items)

## P2 — Important

### Elder/Younger Sibling Tracking
Add birth order tracking to the person model so kinship labels can distinguish anna (elder brother) vs thambi (younger brother), akka (elder sister) vs thangai (younger sister).
- **Why:** Tamil kinship terms encode age relationships. Without birth order, the app falls back to generic 'sibling' labels — missing the cultural specificity that's the core differentiator.
- **Effort:** S (~15 min with CC)
- **Depends on:** Wedding Mode shipped + user feedback on label accuracy
- **Added:** 2026-03-23 (CEO review, Codex outside voice flagged this)

### Data Quality Tooling for Tree Admins
A 'tree health' dashboard for admins: people without photos, missing spouses, disconnected subgraphs, ambiguous relationships.
- **Why:** The real bottleneck is tree quality, not UI. If the tree is messy, kinship labels will be wrong and the experience breaks.
- **Effort:** S (~20 min with CC)
- **Depends on:** Wedding Mode shipped
- **Added:** 2026-03-23 (CEO review, Codex outside voice flagged this)

### Create DESIGN.md via /design-consultation
Establish a design system for Vamsam — colors, typography, spacing, component patterns.
- **Why:** Without DESIGN.md, every implementation decision is ad-hoc. The 53KB App.css has implicit patterns but nothing documented. The wedding use case needs warm, culturally specific design, not generic.
- **Effort:** S (~20 min with CC via /design-consultation)
- **Depends on:** Nothing — should happen before PR 2 (guest-facing UX)
- **Added:** 2026-03-23 (design review)

## Completed

### In-Law Kinship Labels
Added brother-in-law (மச்சான் / जीजा) and sister-in-law (மச்சினி / भाभी) labels + detection logic.
- **Completed:** v0.1.0.0 (2026-03-23)
