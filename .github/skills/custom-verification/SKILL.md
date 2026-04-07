---
name: custom-verification
description: Use when the verification-before-completion skill is required to extend the required verification tasks
---

# Custom Verification

Before claiming any task is complete, the agent must ensure the following are done:
1.  Run `npm run test:e2e` to ensure all E2E tests passes.

Evidence of these commands passing must be included in the final report.
