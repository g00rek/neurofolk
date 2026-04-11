---
name: project-future-classes
description: Future plan for profession/class system with ranged hunting
type: project
---

Classes/professions planned for future. Hunter class will get ranged attack (bow) with kill range based on perception trait. Current melee hunting (adjacent tile) is placeholder until class system exists.

**Why:** User wants profession specialization — hunters, builders, etc. Ranged attack makes hunting more strategic.

**How to apply:** When implementing classes, add weapon/tool types that modify HUNT_KILL_RANGE per entity. Hunter + bow = perception-based range. Default = 1 (melee).
