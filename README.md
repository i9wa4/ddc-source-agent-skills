# ddc-source-slash-commands

Slash command and skill completion for ddc.vim.

Type `/` at line start or after space to complete Claude Code slash commands and skills.

## Features

- Completion triggers when `/` is at line start or after a space
- Prevents unwanted completion in file paths
- Supports hyphenated command names
- Works with both prefix and fuzzy matching
- Supports both commands (files) and skills (directories with SKILL.md)
- Scans user-level and project-level directories

## Installation

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

## Configuration

Basic setup

```vim
call ddc#custom#patch_global('sources', ['slash_commands'])

call ddc#custom#patch_global('sourceOptions', {
  \ 'slash_commands': {
  \   'mark': '[/]',
  \   'matchers': ['matcher_head'],
  \   'minAutoCompleteLength': 1,
  \   'isVolatile': v:true,
  \   'forceCompletionPattern': '\/[a-zA-Z0-9_-]*',
  \ }})
```

For fuzzy matching, change `matchers` to `matcher_fuzzy`.

## Parameters

- `userDirs`
    - Default: `["~/.claude/commands/", "~/.claude/skills/"]`
    - User-level directories to scan (absolute paths, tilde expanded)
- `projectDirs`
    - Default: `[".claude/commands/", ".claude/skills/"]`
    - Project-level directories to scan (relative to current working directory)

Example with custom directories

```vim
call ddc#custom#patch_global('sourceParams', {
  \ 'slash_commands': {
  \   'userDirs': ['~/.claude/commands/', '~/.claude/skills/'],
  \   'projectDirs': ['.claude/commands/', '.claude/skills/'],
  \ }})
```

See `:help ddc-source-slash-commands` for more options.

## Skills Support

This plugin follows the [Agent Skills specification](https://agentskills.io).

For skills directories, only subdirectories containing a `SKILL.md` file are recognized as valid skills.

NOTE: Skills detection only works for directories named `skills`. Custom directory names are treated as command directories.

```
~/.claude/skills/
  my-skill/
    SKILL.md      # Required - this makes it a valid skill
    other.md      # Optional additional files
  incomplete/
    readme.md     # Not recognized (no SKILL.md)
```

## Menu Labels

Completion items show their source type and scope in the menu.

For default configuration:

- `[commands:user]` - User-level command
- `[commands:project]` - Project-level command
- `[skills:user]` - User-level skill
- `[skills:project]` - Project-level skill

NOTE: Menu labels use the directory name. Custom directories like `~/my-cmds/` will show `[my-cmds:user]`.

## Migration from v1.x

The following parameters have been removed:

| Old Parameter | Migration |
|--------------|-----------|
| `commandsDir` | Use `userDirs` (array of directories) |
| `extensions` | Removed (hardcoded to `.md`) |

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

## License

MIT License
