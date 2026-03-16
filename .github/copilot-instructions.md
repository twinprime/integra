# Documentation

README.md provides documentation on user guide, high level system requirements and design.
Review the file after each task to see if it should be updated.

# Git Branch Management

Before implementation of any plans or tasks, if the current branch is not main, check with user if he wants to merge the current branch to main then create a new branch for the implementation. If current branch is main, create a new branch for the implementation.

After implementation, commit the changes but wait for confirmation from user before pushing the changes to the remote repository.

# Commit Messages

For every commit, follow these strict rules:

1. Format: Use the Conventional Commits specification (e.g., feat:, fix:, refactor:, docs:, style:, chore:).
2. Subject Line:
   - Limit to 100 characters.
   - Use the imperative mood (e.g., 'Add feature' instead of 'Added feature').
   - Do not end with a period.
3. Body (The 'Why'):
   - Separate the subject from the body with a blank line.
   - Wrap lines at 72 characters.
   - Focus on the 'What' and 'Why', not the 'How'.
   - Use bullet points to list specific changes.
   - Reference any related issue numbers or tickets (e.g., 'Fixes #123').
4. AI Context: Include a list of the specific user prompts that led to these changes at the end of the message for traceability.

# Maintain Model Invariants

When implementing any changes, ensure that the core invariants of the model as documented in the README.md section "Model Invariants" are maintained.
