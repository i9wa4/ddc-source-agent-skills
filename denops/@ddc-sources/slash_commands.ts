import {
  BaseSource,
  type GatherArguments,
} from "jsr:@shougo/ddc-vim@9.5.0/source";
import type { Item } from "jsr:@shougo/ddc-vim@9.5.0/types";
import { basename, dirname, join, resolve } from "jsr:@std/path@^1.0.8";
import { exists, expandGlob } from "jsr:@std/fs@^1.0.8";

type Params = {
  userDirs: string[];
  projectDirs: string[];
};

/**
 * Scan a directory for slash commands or skills.
 *
 * @param dir - Directory path to scan
 * @param scope - "user" or "project" for menu label
 * @returns Array of completion items
 */
export async function scanDirectory(
  dir: string,
  scope: "user" | "project",
): Promise<Item[]> {
  if (!(await exists(dir))) {
    return [];
  }

  const items: Item[] = [];
  const dirName = basename(dir);

  try {
    if (dirName === "skills") {
      // Skills: scan */SKILL.md pattern (Agent Skills standard)
      for await (const entry of expandGlob(join(dir, "*/SKILL.md"))) {
        const skillName = basename(dirname(entry.path));
        // Exclude hidden directories
        if (skillName.startsWith(".")) continue;
        items.push({
          word: "/" + skillName,
          menu: `[skills:${scope}]`,
        });
      }
    } else {
      // Other directories: scan *.md files
      for await (const entry of Deno.readDir(dir)) {
        if (!entry.isFile) continue;
        // Exclude hidden files
        if (entry.name.startsWith(".")) continue;
        // Check .md extension
        if (!entry.name.endsWith(".md")) continue;

        const commandName = basename(entry.name, ".md");
        items.push({
          word: "/" + commandName,
          menu: `[${dirName}:${scope}]`,
        });
      }
    }
  } catch (_e) {
    // Return empty array if directory reading fails
    return [];
  }

  return items;
}

export class Source extends BaseSource<Params> {
  override getCompletePosition(args: GatherArguments<Params>): Promise<number> {
    // Find the position of / at the beginning or after a space
    const slashMatch = args.context.input.match(/(^|\s)(\/[a-zA-Z0-9_-]*)$/);
    if (!slashMatch) {
      return Promise.resolve(-1);
    }

    // Return the position of / (accounting for leading space if present)
    return Promise.resolve(args.context.input.length - slashMatch[2].length);
  }

  override async gather({
    denops,
    context,
    sourceParams,
  }: GatherArguments<Params>): Promise<Item[]> {
    const params = sourceParams as Params;

    // Check if input contains / at the beginning or after a space
    const slashMatch = context.input.match(/(^|\s)(\/[a-zA-Z0-9_-]*)$/);
    if (!slashMatch) {
      return [];
    }

    // Expand ~ to home directory
    const homeDir = (await denops.call("expand", "~")) as string;

    // Get Vim's current working directory for projectDirs
    const cwd = (await denops.call("getcwd")) as string;

    const items: Item[] = [];

    // Scan userDirs (absolute paths with ~ expansion)
    for (const dir of params.userDirs) {
      const expandedDir = dir.replace(/^~/, homeDir);
      const dirItems = await scanDirectory(expandedDir, "user");
      items.push(...dirItems);
    }

    // Scan projectDirs (relative paths resolved from cwd)
    for (const dir of params.projectDirs) {
      const resolvedDir = resolve(cwd, dir);
      const dirItems = await scanDirectory(resolvedDir, "project");
      items.push(...dirItems);
    }

    return items;
  }

  override params(): Params {
    return {
      userDirs: ["~/.claude/commands/", "~/.claude/skills/"],
      projectDirs: [".claude/commands/", ".claude/skills/"],
    };
  }
}
