# AGENT GENERAL INSTRUCTIONS FOR SL

# GENERAL GUIDELINES
- Use simple symbols for task tracking: `□` for incomplete tasks, `★` for completed tasks. Never use emoji checkmarks like ✓️.
- Never use em dashes "—". Just use plain dashes "-".
- Never add yourself (THE LLM) as a co-author in commit messages
- When making technical decisions do not give  much weight to development cost. Instead prefer quality, simplicity, robustness, and future maintainability
- When doing bug fixes, always try to replicate the bug in an E2E setting as closely alligned to end use as possible to ensure your solution actually fixes the problem
- When doing end-to-end testing of a product, be picky about the UI. Be obessed with pixel perfection. If something looks off. FIX it even if it is not what you are currently working on
- Apply the same high standard to engineering excellence: lint, test failures, annd test flakiness. If you see one, even if it is not caused by what you are working on right now, fix it.
- If you are working on a git project. As you are developing fixing or implementing a feature; commit frequently DO NOT waiti until the entire task is finished.
- Keep your commit messages short and concise with headers e.g. "FEAT: Added a feature..." / "FIX: Fixed a component"...
- As you are Coding, if you come across outdated or deprecated code. Please bring your code up to date. You have context7 skill for this USE IT.
- When I ask you to debug something, focus on the big picture. If there is a systemic issue do no just implement a patch fix the issue itself!
- Write only code a senior developer at a big-tech company would write. If you are referencing code written by a not so creadible developer, reconsider... See if there are better examples.