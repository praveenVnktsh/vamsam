# Changelog

All notable changes to Vaṃsam will be documented in this file.

## [0.1.0.0] - 2026-03-23

### Added
- Family directory view with generation-based grouping for mobile-first kinship lookup
- "I am [X]" identity persistence (localStorage) for personalized kinship labels
- Batch kinship computation hook with memoization for directory view
- Person detail bottom sheet with kinship label and relationship path display
- Photo grid browse mode for visual person lookup
- Generation tier computation relative to the selected identity
- Bride/groom side partition for wedding event context
- Human-readable relationship path builder (e.g., "You → Meena (your mother) → Mohan (her brother)")
- In-law kinship labels: brother-in-law (மச்சான் / जीजा) and sister-in-law (மச்சினி / भाभी)
- In-law relationship detection in graph traversal (partner's sibling, sibling's partner)
- Published graph snapshot support for immutable event-specific tree state
- Shared person search hook extracted from AppShell for reuse across views
- Mobile bottom dock toggle between Directory and Map (canvas) views
- Vitest test framework with 32 tests covering graph operations and kinship resolution
- TODOS.md for tracking deferred work items

### Changed
- Default mobile view is now Directory (family lookup) instead of canvas editor
- Vite config updated to support vitest test runner
