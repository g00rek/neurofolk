---
name: feedback-always-scale
description: All game mechanics must scale with gridSize from the start
type: feedback
---

Every gameplay constant that depends on map size must use `scaled(base, gridSize)` from the start. Never hardcode absolute numbers — always include the scaling coefficient.

**Why:** User wants mechanics that work on any map size without retuning. Hardcoded values broke repeatedly when switching between 10x10 and 30x30.

**How to apply:** When adding any new constant related to population, resources, distances, or thresholds, wrap it in `scaled()` with reference to 30×30 (900 tiles). Reference map for all balancing is 30×30.
