# Documentation

README.md provides documentation on user guide, high level system requirements and design.
Review the file after each task to see if it should be updated.

# Git Branch Management

Before implementation of any plans or tasks, if the current branch is not main, check with user if he wants to merge the current branch to main then create a new branch for the implementation. If current branch is main, create a new branch for the implementation.

Do not commit changes until explicitly asked by the user. When committing, use the skill git-commit.

# Maintain Model Invariants

When implementing any changes, ensure that the core invariants of the model as documented in the README.md section "Model Invariants" are maintained.

# Linting

Follow the coding standards defined in the project's .prettierrc and .eslintrc files. After making any changes, you must run `npm run lint:fix` to automatically fix any linting issues and ensure that the code adheres to the defined style guidelines. You should also fix any
other issues reported by the linter that cannot be automatically fixed.
