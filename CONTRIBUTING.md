# Contributing

## Development Setup

1. Clone the repository
2. Ensure you have Deno installed

## Type Check

Run type check before committing:

```sh
deno check denops/@ddc-sources/slash_commands.ts
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
# User-level commands
mkdir -p ~/.claude/commands
echo "# Test Command" > ~/.claude/commands/test-command.md

# User-level skills
mkdir -p ~/.claude/skills/test-skill
cat > ~/.claude/skills/test-skill/SKILL.md << 'EOF'
---
name: test-skill
description: A test skill for development
---
# Test Skill
EOF

# Project-level (in your project directory)
mkdir -p .claude/commands
echo "# Project Command" > .claude/commands/project-cmd.md
```

2. Open Vim/Neovim with ddc.vim configured

3. Type `/` at line start and verify:
   - `/test-command [commands:user]` appears
   - `/test-skill [skills:user]` appears
   - `/project-cmd [commands:project]` appears

## Code Style

- Follow existing code style
- Use TypeScript strict mode
- Add JSDoc comments for public functions
