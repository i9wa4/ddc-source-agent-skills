# ddc-source-slash-commands

Slash command and skill completion for ddc.vim.

Type `/` at line start or after space to complete Claude Code slash commands and skills.

## 1. Features

- Completion triggers when `/` is at line start or after a space
- Prevents unwanted completion in file paths
- Supports hyphenated command names
- Works with both prefix and fuzzy matching
- Supports both commands (files) and skills (directories with SKILL.md)
- Scans user-level and project-level directories

## 2. Installation

Using dein.vim

```vim
call dein#add('vim-denops/denops.vim')
call dein#add('Shougo/ddc.vim')
call dein#add('Shougo/ddc-matcher_head')  " or tani/ddc-fuzzy for fuzzy matching
call dein#add('i9wa4/ddc-source-slash-commands')
```

Using lazy.nvim

```lua
{
  'i9wa4/ddc-source-slash-commands',
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
call ddc#custom#patch_global('sources', ['slash_commands'])

call ddc#custom#patch_global('sourceOptions', {
  \ 'slash_commands': {
  \   'mark': '[slash]',
  \   'matchers': ['matcher_head'],
  \   'minAutoCompleteLength': 1,
  \   'isVolatile': v:true,
  \   'forceCompletionPattern': '\/[a-zA-Z0-9_-]*',
  \ }})
```

For fuzzy matching, change `matchers` to `matcher_fuzzy`.

## 4. Parameters

- `userDirs`
    - Default: `["~/.claude/commands/", "~/.claude/skills/"]`
    - User-level directories to scan (absolute paths, tilde expanded)
- `projectDirs`
    - Default: `[".claude/commands/", ".claude/skills/"]`
    - Project-level directories to scan (relative to current working directory)
- `plugins`
    - Default: `"off"`
    - Plugin scanning mode: `"auto"`, `"on"`, or `"off"`
    - `"auto"` and `"on"` enable plugin scanning (same behavior in current version)
    - `"off"` disables plugin scanning (default for backward compatibility)
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
  \ 'slash_commands': {
  \   'userDirs': ['~/.claude/commands/', '~/.claude/skills/'],
  \   'projectDirs': ['.claude/commands/', '.claude/skills/'],
  \ }})
```

Example with plugin support enabled

```vim
call ddc#custom#patch_global('sourceParams', {
  \ 'slash_commands': {
  \   'plugins': 'on',
  \   'userPluginPaths': ['~/my-plugins/code-review/'],
  \   'projectPluginPaths': ['.plugins/deploy/'],
  \ }})
```

See `:help ddc-source-slash-commands` for more options.

## 5. Skills Support

This plugin follows the [Agent Skills specification](https://agentskills.io).

For skills directories, only subdirectories containing a `SKILL.md` file are recognized as valid skills.

NOTE: Skills detection only works for directories named `skills`. Custom directory names are treated as command directories.

```text
~/.claude/skills/
  my-skill/
    SKILL.md      # Required - this makes it a valid skill
    other.md      # Optional additional files
  incomplete/
    readme.md     # Not recognized (no SKILL.md)
```

## 6. Menu Labels

Completion items show their source type and scope in the menu.

For default configuration:

- `[commands:user]` - User-level command
- `[commands:project]` - Project-level command
- `[skills:user]` - User-level skill
- `[skills:project]` - Project-level skill

For plugin sources:

- `[plugin:commands:user]` - User-level plugin command
- `[plugin:commands:project]` - Project-level plugin command
- `[plugin:skills:user]` - User-level plugin skill
- `[plugin:skills:project]` - Project-level plugin skill

NOTE: Menu labels use the directory name. Custom directories like `~/my-cmds/` will show `[my-cmds:user]`.

## 7. Migration from v1.x

The following parameters have been removed:

| Old Parameter  | Migration                             |
| -------------- | -----------                           |
| `commandsDir`  | Use `userDirs` (array of directories) |
| `extensions`   | Removed (hardcoded to `.md`)          |

Example migration

```vim
" Before (v1.x)
call ddc#custom#patch_global('sourceParams', {
  \ 'slash_commands': {
  \   'commandsDir': '~/my/commands',
  \ }})

" After (v2.x)
call ddc#custom#patch_global('sourceParams', {
  \ 'slash_commands': {
  \   'userDirs': ['~/my/commands/'],
  \ }})
```

## 8. License

MIT License
