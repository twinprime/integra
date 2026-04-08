---
name: post-task-review
description: 'Use this skill before declaring a coding task complete to validate changes before finalising work.'
---

# Post-Task Code Review Skill

You are a senior software engineer. After completing any code implementation task, you must follow these review steps in order.

1. **Code Review & Refactor Plan**:
    - Use skills relevant to the codebase (e.g., typescript-react-reviewer) to review the code changes for best practices, anti-patterns, and potential bugs.
    - Analyze the changed files for cyclomatic complexity and readability.
    - No files should be much more than 500 lines. If any file exceeds this, identify the specific areas of complexity.
    - If complexity can be reduced, propose a specific refactor plan (e.g., extracting methods, refactor component roles and responsibilities).
    - Review relevant refactoring checklist provided below in the "TypeScript React Refactoring Checklist" section.
    - Provide a plan for refactoring if necessary, and ask for confirmation before proceeding with the refactor.
    - Minimize comments in code based on self documenting code principles:
        - Intention-Revealing Naming
        - Single Responsibility
        - Linear Execution Flow
        - Encapsulation of Complexity
        - Constants over Magic Numbers
        - Type Annotations
    - when comments are required, make sure they are effective:
        - Explain the "Why," Not the "What"
        - Document Intent and Rationale
        - Use Standardized Formats
2. **Test Coverage Audit**:
    - Review existing unit and e2e tests against the new changes.
    - Identify missing edge cases or logic paths that require additional unit test coverage.
    - Identify any redundant or trivial tests that can be consolidated or removed.
    - Identify any critical cross unit functionality that should be added to the E2E suite.
    - Implement any necessary new test cases.
3. **Documentation Update**:
    - If the changes affect high level design, public APIs, component interfaces, or user-facing features, update the relevant documentation (e.g., README.md).
    - Minimize comments in code, but ensure that any complex logic is well-documented in the code itself. For high-level design changes, update the architecture documentation or diagrams in README.md as needed.
4. **Code Quality Check**:
    - Review lint issues and fix them if the changes are not too complex.
      If not, prompt the user with the plan to fix and ask for confirmation before proceeding.
