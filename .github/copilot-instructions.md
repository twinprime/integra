# Documentation

README.md provides documentation on user guide, high level system requirements and design.
Review the file after each task to see if it should be updated.

# Git Commits

Do not commit after individual TDD steps. Only commit once per high-level task defined in the plan.

**⚠️ PRE-IMPLEMENTATION CHECKLIST — must be completed before making any changes to existing files:**

1. Check the current branch with `git branch --show-current`.
2. If on `main`: create a new feature branch and switch to it before touching any files.
3. If not on `main`: ask the user whether to merge to `main` first or continue on the current branch.

# Coding Standards

Follow the coding standards defined in the project's .prettierrc and .eslintrc files. After making any changes, YOU MUST RUN `npm run lint:fix` to automatically fix any linting issues and ensure that the code adheres to the defined style guidelines. You should also fix any
other issues reported by the linter that cannot be automatically fixed.

# Post Task Review

**Important**

ALWAYS use the skill post-task-review before declaring a coding task complete.

# Maintain Model Invariants

When implementing any changes, ensure that the core invariants of the model as documented in the [Developer Guide](../docs/developer-guide.md) section "Model Invariants" are maintained.
