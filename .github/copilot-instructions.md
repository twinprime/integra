# Documentation

README.md provides documentation on user guide, high level system requirements and design.
Review the file after each task to see if it should be updated.

# Git Commits

Do not commit after individual TDD steps. Only commit once per high-level task defined in the plan.

ONLY when following the 'using-superpowers' workflow:
1. Include the task number or spec filename in every commit message (e.g., feat: implement logic for [plan-xyz.md:Task 2]).

ONLY when NOT following the 'using-superpowers' workflow:
1. Before implementation of any plans or tasks, if the current branch is not main, check with user if he wants to merge the current branch to main then create a new branch for the implementation. If current branch is main, create a new branch for the implementation.
2. Do not commit changes until explicitly asked by the user. 
3. Include a list of the specific user prompts that led to these changes at the end of the message for traceability

# Maintain Model Invariants

When implementing any changes, ensure that the core invariants of the model as documented in the [Developer Guide](docs/developer-guide.md) section "Model Invariants" are maintained.

# Linting

Follow the coding standards defined in the project's .prettierrc and .eslintrc files. After making any changes, you must run `npm run lint:fix` to automatically fix any linting issues and ensure that the code adheres to the defined style guidelines. You should also fix any
other issues reported by the linter that cannot be automatically fixed.
