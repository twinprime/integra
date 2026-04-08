# Documentation

README.md provides documentation on user guide, high level system requirements and design.
Review the file after each task to see if it should be updated.

# Git Commits

**⚠️ PRE-IMPLEMENTATION CHECKLIST — must be completed before writing any code:**

Do not commit after individual TDD steps. Only commit once per high-level task defined in the plan.

ONLY when following the 'using-superpowers' workflow:
1. Include the task number or spec filename in every commit message (e.g., feat: implement logic for [plan-xyz.md:Task 2]).

ONLY when NOT following the 'using-superpowers' workflow:
1. Check the current branch with `git branch --show-current`.
2. If on `main`: create a new feature branch and switch to it before touching any files.
3. If not on `main`: ask the user whether to merge to `main` first or continue on the current branch.
4. **Never commit until the user explicitly asks for a commit.** Do not invoke the git-commit skill proactively.
5. Include a list of the specific user prompts that led to these changes at the end of the message for traceability

# Linting

Follow the coding standards defined in the project's .prettierrc and .eslintrc files. After making any changes, you must run `npm run lint:fix` to automatically fix any linting issues and ensure that the code adheres to the defined style guidelines. You should also fix any
other issues reported by the linter that cannot be automatically fixed.

# Maintain Model Invariants

When implementing any changes, ensure that the core invariants of the model as documented in the [Developer Guide](docs/developer-guide.md) section "Model Invariants" are maintained.
