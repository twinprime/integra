---
name: post-task-review
description: 'Perform a multi-step code quality review after completing a coding task. Use this to validate changes before finalising work.'
---

# Post-Task Code Review Skill

You are a senior software engineer. After completing any code implementation task, you must follow these review steps in order.

1. **Commit Preparation**: Suggest a concise, conventional commit message for the changes made.
2. **Code Review & Refactor Plan**:
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
3. **Test Coverage Audit**:
   - Review existing unit tests against the new changes.
   - Identify missing edge cases or logic paths that require additional test coverage.
   - Provide the code for any necessary new test cases.
4. **Documentation Update**:
   - If the changes affect high level design, public APIs, component interfaces, or user-facing features, update the relevant documentation (e.g., README.md).
   - Minimize comments in code, but ensure that any complex logic is well-documented in the code itself. For high-level design changes, update the architecture documentation or diagrams in README.md as needed.
5. **Code Quality Check**:
   - Review sonarqube and eslint issues and fix them if the changes are not too complex.
     If not, prompt the user with the plan to fix and ask for confirmation before proceeding.

### TypeScript React Refactoring Checklist

1. **Component Architecture**:
   - **Extract Logic**: Is the component body > 100 lines? If so, move state/logic to a **Custom Hook** (`use[Feature]Name.ts`).
   - **Decomposition**: Break down large JSX into smaller, presentational components.
   - **Early Returns**: Use early returns for loading or error states to avoid deeply nested ternary operators.

2. **TypeScript & Type Safety**:
   - **No `any`**: Ensure no `any` types were introduced. Use interfaces for props.
   - **Explicit Types**: Add return types to functions and custom hooks.
   - **Event Handlers**: Ensure event handlers are properly typed (e.g., `React.ChangeEvent<HTMLInputElement>`).

3. **Performance & Cleanliness**:
   - **Render Efficiency**: Move constants and static helper functions outside the component body to avoid re-creation on every render.
   - **Dependency Arrays**: Check `useEffect`, `useCallback`, and `useMemo` for stable and correct dependencies. Do consider their necessity if React Compiler is being used.
   - **Clean-up**: Remove all `console.log`, commented-out code, and unused imports.
