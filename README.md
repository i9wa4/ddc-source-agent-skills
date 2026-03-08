# ddc-source-agent-skills

Skill completion for ddc.vim. Supports Claude Code (`/`) and Codex CLI (`$`).

Type `/` or `$` at line start or after space to complete Agent Skills from your skills directories.

## 1. Features

- Completion triggers when the prefix (`/` or `$`) is at line start or after a space
- Prevents unwanted completion in file paths
- Supports hyphenated skill names
- Works with both prefix and fuzzy matching
- Scans user-level and project-level skills directories
- Reads `description` from `SKILL.md` frontmatter and shows it as `info`

## 2. Installation

Using dein.vim

```vim
call dein#add('vim-denops/denops.vim')
call dein#add('Shougo/ddc.vim')
call dein#add('Shougo/ddc-matcher_head')  " or tani/ddc-fuzzy for fuzzy matching
call dein#add('i9wa4/ddc-source-agent-skills')
```

Using lazy.nvim

```lua
{
  'i9wa4/ddc-source-agent-skills',
  dependencies = {
    'vim-denops/denops.vim',
    'Shougo/ddc.vim',
    'Shougo/ddc-matcher_head',  -- or tani/ddc-fuzzy for fuzzy matching
  },
}
```

## 3. Configuration

Basic setup

```vim
call ddc#custom#patch_global('sources', ['agent_skills'])

call ddc#custom#patch_global('sourceOptions', {
  \ 'agent_skills': {
  \   'mark': '[slash]',
  \   'matchers': ['matcher_head'],
  \   'minAutoCompleteLength': 1,
  \   'isVolatile': v:true,
  \   'forceCompletionPattern': '\/[a-zA-Z0-9_:-]*',
  \ }})
```

For fuzzy matching, change `matchers` to `matcher_fuzzy`.

## 4. Parameters

- `userDirs`
    - Default: `["~/.claude/skills/"]`
    - User-level skills directories to scan (absolute paths, tilde expanded)
- `projectDirs`
    - Default: `[".claude/skills/"]`
    - Project-level skills directories to scan (relative to current working directory)
- `prefix`
    - Default: `"/"`
    - Completion trigger prefix. Use `"/"` for Claude Code, `"$"` for Codex CLI
- `plugins`
    - Default: `"off"`
    - Plugin scanning mode: `"on"` or `"off"`
    - `"on"` enables plugin scanning
    - `"off"` disables plugin scanning (default)
- `userPluginPaths`
    - Default: `[]`
    - User-level plugin directories (absolute paths, tilde expanded)
    - Each path must be a valid Claude Code plugin with `.claude-plugin/plugin.json`
- `projectPluginPaths`
    - Default: `[]`
    - Project-level plugin directories (relative paths only)
    - Absolute paths are rejected for security
    - Paths must resolve within the project directory

Example with custom directories

```vim
call ddc#custom#patch_global('sourceParams', {
  \ 'agent_skills': {
  \   'userDirs': ['~/.claude/skills/', '~/.codex/skills/'],
  \   'projectDirs': ['.claude/skills/', '.codex/skills/'],
  \ }})
```

Example for Codex CLI (`$` prefix)

```vim
call ddc#custom#patch_global('sourceParams', {
  \ 'agent_skills': {
  \   'prefix': '$',
  \ }})

call ddc#custom#patch_global('sourceOptions', {
  \ 'agent_skills': {
  \   'forceCompletionPattern': '\$[a-zA-Z0-9_:-]*',
  \ }})
```

Example with plugin support enabled

```vim
call ddc#custom#patch_global('sourceParams', {
  \ 'agent_skills': {
  \   'plugins': 'on',
  \   'userPluginPaths': ['~/my-plugins/code-review/'],
  \   'projectPluginPaths': ['.plugins/deploy/'],
  \ }})
```

See `:help ddc-source-agent-skills` for more options.

## 5. Skills Support

This plugin follows the [Agent Skills specification](https://agentskills.io).

Only subdirectories containing a `SKILL.md` file are recognized as valid skills. Symlinked directories (e.g., Nix-managed skills) are supported.

```text
~/.claude/skills/
  my-skill/
    SKILL.md      # Required - this makes it a valid skill
    other.md      # Optional additional files
  incomplete/
    readme.md     # Not recognized (no SKILL.md)
```

If `SKILL.md` contains a `description` field in its YAML frontmatter, the first line of the description is shown as the `info` field in the completion popup.

```yaml
---
name: my-skill
description: |
  Brief description shown in popup.
---
```

## 6. Menu Labels

Completion items show their scope in the menu.

For default configuration:

- `[skills:user]` - User-level skill (e.g., `~/.claude/skills/`)
- `[skills:project]` - Project-level skill (e.g., `.claude/skills/`)

For plugin sources:

- `[plugin:user]` - User-level plugin skill
- `[plugin:project]` - Project-level plugin skill

## 7. Migration

### From v1.x

The following parameters have been removed:

| Old Parameter  | Migration                             |
| -------------- | -----------                           |
| `commandsDir`  | Use `userDirs` (array of directories) |
| `extensions`   | Removed (hardcoded to `.md`)          |

### Commands support removed (v3.x)

Command directory scanning has been removed. Only skills directories (with `SKILL.md`) are supported.

If you previously scanned `commands/` directories, remove them from your config:

```vim
" Before
call ddc#custom#patch_global('sourceParams', {
  \ 'agent_skills': {
  \   'userDirs': ['~/.claude/commands/', '~/.claude/skills/'],
  \   'projectDirs': ['.claude/commands/', '.claude/skills/'],
  \ }})

" After
call ddc#custom#patch_global('sourceParams', {
  \ 'agent_skills': {
  \   'userDirs': ['~/.claude/skills/'],
  \   'projectDirs': ['.claude/skills/'],
  \ }})
```

## 8. License

MIT License
