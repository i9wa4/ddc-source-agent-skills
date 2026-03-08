# Contributing

## Development Setup

1. Clone the repository
2. Ensure you have Deno installed

## Type Check

Run type check before committing:

```sh
deno check denops/@ddc-sources/agent_skills.ts
```

## Running Tests

Run automated tests:

```sh
deno test --allow-read --allow-write --filter "scanDirectory" denops/@ddc-sources/
```

NOTE: The `--filter` option excludes tests from cached dependencies.

## Manual Testing in Vim/Neovim

1. Set up test directories:

```sh
# User-level skill
mkdir -p ~/.claude/skills/test-skill
cat > ~/.claude/skills/test-skill/SKILL.md << 'EOF'
---
name: test-skill
description: A test skill for development
---
# Test Skill
EOF

# Project-level skill (in your project directory)
mkdir -p .claude/skills/test-skill
cat > .claude/skills/test-skill/SKILL.md << 'EOF'
---
name: test-skill
description: A project-level test skill
---
# Test Skill
EOF
```

2. Open Vim/Neovim with ddc.vim configured

3. Type `/` at line start and verify:
   - `/test-skill [skills:user]` appears
   - `/test-skill [skills:project]` appears

## Code Style

- Follow existing code style
- Use TypeScript strict mode
- Add JSDoc comments for public functions
