# Documentation

README.md provides documentation on user guide, high level system requirements and design.
Review the file after each task to see if it should be updated.

# Git Commits

Do not commit after individual TDD steps. Only commit once per high-level task defined in the plan.

Include the task number or spec filename in every commit message (e.g., feat: implement logic for [plan-xyz.md:Task 2]).

# Maintain Model Invariants

When implementing any changes, ensure that the core invariants of the model as documented in the [Developer Guide](docs/developer-guide.md) section "Model Invariants" are maintained.

# Linting

Follow the coding standards defined in the project's .prettierrc and .eslintrc files. After making any changes, you must run `npm run lint:fix` to automatically fix any linting issues and ensure that the code adheres to the defined style guidelines. You should also fix any
other issues reported by the linter that cannot be automatically fixed.
