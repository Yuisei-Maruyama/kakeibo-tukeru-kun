# CLAUDE.md - AI Development Guidelines

## Overview

This is a LINE Bot-based household expense management system integrated with Google Calendar. The codebase is primarily in Japanese.

## Critical Rule: Documentation First

**IMPORTANT: Before implementing any new feature or modification, you MUST:**

1. **Document the specification in `docs/` directory FIRST**
2. **Get user confirmation on the specification**
3. **Only then proceed with implementation**

### Documentation Workflow

```
1. User requests a feature
     ↓
2. Write/update specification in docs/01_requirements.md
     ↓
3. Confirm specification with user
     ↓
4. Implement the feature
     ↓
5. Simplify and refine code (using code-simplifier agent)
     ↓
6. Update @ヘルプ message if user-facing command
     ↓
7. Build and verify
```

### What to Document

For any new feature, document the following in `docs/01_requirements.md`:

- **Command syntax**: How users invoke the feature (e.g., `@コマンド名`)
- **Dialog flow**: Step-by-step interaction if interactive
- **Data model**: New fields or types required
- **Business logic**: How the feature works
- **Example outputs**: What users will see
- **Edge cases**: Error handling and special conditions

### Documentation Location

| Document | Purpose |
|----------|---------|
| `docs/01_requirements.md` | Main requirements and feature specifications |
| `functions/src/services/line.ts` (`createHelpMessage`) | User-facing help text |

## Project Structure

```
kakeibo-tukeru-kun/
├── CLAUDE.md              # This file - AI guidelines
├── docs/
│   └── 01_requirements.md # Feature specifications (DOCUMENT HERE FIRST)
├── functions/
│   ├── src/
│   │   ├── index.ts       # Cloud Functions entry points
│   │   ├── handlers/      # Request handlers
│   │   │   ├── webhook.ts      # LINE webhook handler
│   │   │   ├── conversation.ts # Dialog flow handlers
│   │   │   └── scheduler.ts    # Scheduled task handlers
│   │   ├── services/      # External service integrations
│   │   │   ├── firestore.ts    # Database operations
│   │   │   ├── line.ts         # LINE messaging & help text
│   │   │   ├── calendar.ts     # Google Calendar operations
│   │   │   └── gemini.ts       # AI image analysis
│   │   ├── types/
│   │   │   └── index.ts        # TypeScript type definitions
│   │   └── utils/              # Utility functions
│   └── package.json
└── Makefile               # Build and deployment commands
```

## Key Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Build TypeScript (run from `functions/`) |
| `make deploy` | Deploy to Cloud Functions |
| `make pull-cloud-functions` | Sync deployed code to local |

## Code Quality Standards

**CRITICAL: Always simplify and refine code after implementation**

After implementing any feature or making code changes, you MUST:

1. **Automatically use the `code-simplifier` agent** to review and improve the code
2. **Focus areas for simplification:**
   - Remove unnecessary complexity
   - Improve readability and maintainability
   - Eliminate code duplication
   - Ensure consistent coding patterns
   - Simplify logic where possible
   - Remove redundant comments

3. **When to trigger simplification:**
   - After implementing a new feature
   - After modifying existing code
   - After writing multiple functions or files
   - Before marking implementation as complete

4. **How to use:**
   - AI will automatically invoke the `code-simplifier` agent via Task tool
   - Agent analyzes recently modified code (git diff)
   - Agent provides simplification suggestions and applies improvements

**Note:** This is NOT a user-invocable command. The AI assistant handles this automatically as part of the development workflow.

## Development Checklist

When implementing a feature:

- [ ] Specification documented in `docs/01_requirements.md`
- [ ] User confirmed the specification
- [ ] Types added/updated in `functions/src/types/index.ts`
- [ ] Database functions in `functions/src/services/firestore.ts`
- [ ] Handler logic implemented
- [ ] **Code simplified using code-simplifier agent**
- [ ] `@ヘルプ` updated in `functions/src/services/line.ts`
- [ ] `npm run build` succeeds
- [ ] Documentation matches implementation

## Language Notes

- User-facing messages: Japanese
- Code comments: Japanese
- Variable/function names: English
- Documentation: Japanese (requirements), English (this file)
