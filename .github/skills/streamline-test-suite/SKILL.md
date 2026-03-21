---
name: streamline-test-suite
description: Use this skill when asked to streamline, optimize, refactor or review existing unit and/or e2e test suites.
---

When this skill is invoked, use the following process to analyze and optimize the test suite.
The goal is to maintain or improve coverage while reducing execution time and maintenance overhead.

1. Map the Coverage

- Run a coverage report for both unit and E2E tests if available and record as the baseline for comparison after optimization.
- Analyze existing Unit tests for logic branches and edge cases.
- Analyze E2E tests for user workflows and integration points.

2. Optimize

- Deduplicate Layers: If a logic branch or edge case is thoroughly covered by unit tests, remove it from the E2E suite unless it is a "critical path" step for the system to function.
- Consolidate Trivial Cases: Identify "trivial" tests (e.g., individual tests checking single fields or simple return values). Combine these into parameterized tests or single "One-Go" scenarios that verify multiple related outputs in one execution flow.
- Shift Logic Left: Move input validation and internal state checks from E2E to unit tests where they can run faster and deterministically.
- E2E Focus: Keep E2E tests focused strictly on "happy path" user workflows (e.g., login, checkout) and cross-unit integrations.

3. Validate

- Review the test code for readability and maintainability, ensuring that it is clear and concise.
- Ensure coverage is maintained or improved.
    - Run a coverage report for both unit and E2E tests if available and compare against baseline.
- Run the optimized test suite and verify that all tests pass successfully.

4. Output

- Provide a summary of removed redundancies and the refactored test code and any changes to test coverage.
