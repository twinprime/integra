---
name: streamline-test-suite
description: Use this skill when asked to streamline, optimize, refactor or review existing unit and/or e2e test suites.
---

When this skill is invoked, use the following process to analyze and optimize the test suite.

1. Map the Coverage

- Analyze existing Unit tests for logic branches and edge cases.
- Analyze E2E tests for user workflows and integration points.

2. Optimize

- Deduplicate Layers: If a logic branch or edge case is thoroughly covered by unit tests, remove it from the E2E suite unless it is a "critical path" step for the system to function.
- Consolidate Trivial Cases: Identify "trivial" tests (e.g., individual tests checking single fields or simple return values). Combine these into parameterized tests or single "One-Go" scenarios that verify multiple related outputs in one execution flow.
- Shift Logic Left: Move input validation and internal state checks from E2E to unit tests where they can run faster and deterministically.
- E2E Focus: Keep E2E tests focused strictly on "happy path" user workflows (e.g., login, checkout) and cross-unit integrations.

3. Output

- Provide a summary of removed redundancies and the refactored test code. Ensure all tests remain independent and isolated.
