---
name: bug-fixer
description: Use when user reports any bug, validation failure or unexpected behavior and you are not following the 'using-superpowers' workflow
---

## 1. Analysis

Identify the specific component, the user's action, the expected result, and the actual (buggy) result. Ask user for clarification or missing information.

## 2. Reproduction Strategy (Test-First)

You MUST produce a failing test case before writing any fix code.

### Phase A: Unit Test Reproduction (Priority)

Attempt this first for individual components

- **Action:** Create a new test file or add a case to an existing one that simulates the reported state.
- **Requirement:** The test must **FAIL** with the current code.
- **Benefits:** Faster execution and precise root-cause identification.

### Phase B: E2E Test Fallback (If Phase A is insufficient)

Use this if the bug involves complex user journeys, browser-specific behavior, or multiple integrated systems.

- **Action:** Use Playwright to script the full user interaction.
- **Requirement:** The E2E test must **FAIL** to confirm the bug is reproducible in a browser environment.

## 3. Present Plan

If in plan mode, present the plan:

- **Reproduction Status:** (e.g., "Confirmed via Unit Test").
- **Root Cause:** Brief technical explanation.
- **Fix to be Applied:** Description of the change.

## 4. Implementation & Validation

- **Apply Fix:** Write the minimal code change required to make the reproduction test pass.
- **Verify:** Run the new test. It must now **PASS**.
- **Regression:** Run the full suite for the affected module to ensure no new bugs were introduced.

## 5. Post-Mortem Documentation

After the fix, provide a summary:

- **Reproduction Status:** (e.g., "Confirmed via Unit Test").
- **Root Cause:** Brief technical explanation.
- **Fix Applied:** Description of the change.
