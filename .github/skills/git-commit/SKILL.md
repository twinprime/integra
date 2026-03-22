---
name: git-commit
description: 'Use this skill to commit changes to git with a well formatted commit message.'
---

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
    - Always use real newlines for formatting. Never include literal \n strings in the body.
4. AI Context: Include a list of the specific user prompts that led to these changes at the end of the message for traceability.
