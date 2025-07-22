# Contributing to GameLord

Thank you for your interest in contributing to GameLord! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:
- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive criticism
- Respect differing viewpoints and experiences

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/gamelord.git`
3. Create a new branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Test your changes thoroughly
6. Commit with clear messages: `git commit -m "feat: add new feature"`
7. Push to your fork: `git push origin feature/your-feature-name`
8. Create a Pull Request

## Development Setup

```bash
# Install dependencies
pnpm install

# Start development server
pnpm start

# Run tests
pnpm test

# Check code style
pnpm run lint
```

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Test additions or modifications
- `chore:` Build process or auxiliary tool changes

Examples:
```
feat: add save state preview thumbnails
fix: resolve controller input lag on Windows
docs: update ROM compatibility list
```

## Code Review Guidelines

We use [Conventional Comments](https://conventionalcomments.org/) for code reviews to ensure clear and actionable feedback:

### Comment Format
```
<label> [decorations]: <subject>

[discussion]
```

### Labels
- **praise:** Highlight something positive
- **nitpick:** Small, non-blocking suggestions
- **suggestion:** Propose improvements
- **issue:** Highlight specific problems
- **question:** Ask for clarification
- **thought:** Share ideas that might not be actionable

### Decorations
- **blocking:** Must be resolved before merging
- **non-blocking:** Nice to have but not required
- **if-minor:** Only address if making other changes

### Examples
```
**suggestion:** Consider using `useMemo` here to prevent unnecessary re-renders.

**question (non-blocking):** Is there a reason we're not using the existing utility function for this?

**praise:** Great job on the error handling here! Very thorough.

**issue (blocking):** This will cause a memory leak - we need to clean up the event listener.
```

## Code Style

- Use TypeScript for all new code
- Follow the existing code style (enforced by ESLint)
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused

## Testing

- Write tests for new features
- Ensure all tests pass before submitting PR
- Test on multiple platforms if possible
- Include steps to reproduce bugs in issues

## Pull Request Process

1. Update the README.md with details of changes if needed
2. Ensure your PR description clearly describes the problem and solution
3. Link any relevant issues
4. Request review from maintainers
5. Address review feedback promptly

## Architecture Guidelines

When contributing to core functionality:

- Maintain process separation (main/renderer/utility)
- Use IPC for cross-process communication
- Follow the established patterns for state management
- Ensure security best practices are followed

## UI/UX Guidelines

- Follow the existing design language
- Use shadcn/ui components consistently
- Ensure accessibility (keyboard navigation, screen readers)
- Test on different screen sizes
- Maintain native platform feel

## Performance Considerations

- Profile your changes for performance impact
- Avoid blocking the main thread
- Optimize render cycles in React components
- Use memoization where appropriate
- Test with large ROM libraries

## Questions?

Feel free to:
- Open an issue for questions
- Join our Discord community
- Check existing issues and PRs

Thank you for contributing to GameLord!