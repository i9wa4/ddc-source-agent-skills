import {
  BaseSource,
  type GatherArguments,
} from "jsr:@shougo/ddc-vim@9.5.0/source";
import type { Item } from "jsr:@shougo/ddc-vim@9.5.0/types";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  resolve,
} from "jsr:@std/path@^1.0.8";
import { exists, expandGlob } from "jsr:@std/fs@^1.0.8";

type Params = {
  userDirs: string[];
  projectDirs: string[];
  plugins: "auto" | "on" | "off";
  userPluginPaths: string[];
  projectPluginPaths: string[];
};

/**
 * Check if a path exists using Deno.stat.
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a directory is a valid Claude Code plugin.
 * A valid plugin must have .claude-plugin/plugin.json.
 */
async function isValidPlugin(pluginDir: string): Promise<boolean> {
  const manifestPath = join(pluginDir, ".claude-plugin", "plugin.json");
  return await pathExists(manifestPath);
}

/**
 * Check if a resolved path is within the specified boundary.
 * Uses Deno.realPath for symlink resolution.
 * Note: Deno.realPath internally handles symlink loops.
 */
export async function isWithinBoundary(
  path: string,
  boundary: string,
): Promise<boolean> {
  try {
    const realPath = await Deno.realPath(path);
    const realBoundary = await Deno.realPath(boundary);
    // Check if realPath starts with realBoundary
    return realPath.startsWith(realBoundary + "/") ||
      realPath === realBoundary;
  } catch {
    return false; // Path doesn't exist or permission denied
  }
}

/**
 * Scan a plugin directory for commands or skills.
 *
 * @param dir - Plugin subdirectory path (commands/ or skills/)
 * @param pluginName - Name of the plugin (directory name)
 * @param type - "commands" or "skills"
 * @param scope - "user" or "project"
 * @returns Array of completion items with [plugin:scope] menu
 */
export async function scanPluginDirectory(
  dir: string,
  pluginName: string,
  type: "commands" | "skills",
  scope: "user" | "project",
): Promise<Item[]> {
  if (!(await pathExists(dir))) {
    return [];
  }

  const items: Item[] = [];

  try {
    if (type === "skills") {
      // Skills: scan */SKILL.md pattern
      const entries: string[] = [];
      for await (const entry of expandGlob(join(dir, "*/SKILL.md"))) {
        const skillName = basename(dirname(entry.path));
        if (!skillName.startsWith(".")) {
          entries.push(skillName);
        }
      }
      // Lexical sort for deterministic results
      entries.sort((a, b) => a.localeCompare(b));
      for (const name of entries) {
        items.push({
          word: `/${pluginName}:${name}`,
          menu: `[plugin:${scope}]`,
        });
      }
    } else {
      // Commands: scan *.md files
      const entries: string[] = [];
      for await (const entry of Deno.readDir(dir)) {
        if (!entry.isFile) continue;
        if (entry.name.startsWith(".")) continue;
        if (!entry.name.endsWith(".md")) continue;
        entries.push(basename(entry.name, ".md"));
      }
      // Lexical sort for deterministic results
      entries.sort((a, b) => a.localeCompare(b));
      for (const name of entries) {
        items.push({
          word: `/${pluginName}:${name}`,
          menu: `[plugin:${scope}]`,
        });
      }
    }
  } catch {
    return [];
  }

  return items;
}

/**
 * Scan a Claude Code plugin for commands and skills.
 *
 * @param pluginDir - Plugin root directory
 * @param scope - "user" or "project"
 * @returns Array of completion items
 */
export async function scanPlugin(
  pluginDir: string,
  scope: "user" | "project",
): Promise<Item[]> {
  try {
    // Validate plugin
    if (!(await isValidPlugin(pluginDir))) {
      return [];
    }

    const pluginName = basename(pluginDir);
    const items: Item[] = [];

    // Scan commands/ directory
    const commandsDir = join(pluginDir, "commands");
    const commandItems = await scanPluginDirectory(
      commandsDir,
      pluginName,
      "commands",
      scope,
    );
    items.push(...commandItems);

    // Scan skills/ directory
    const skillsDir = join(pluginDir, "skills");
    const skillItems = await scanPluginDirectory(
      skillsDir,
      pluginName,
      "skills",
      scope,
    );
    items.push(...skillItems);

    return items;
  } catch {
    return []; // Silent failure for fault isolation
  }
}

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
      const entries: string[] = [];
      for await (const entry of expandGlob(join(dir, "*/SKILL.md"))) {
        const skillName = basename(dirname(entry.path));
        // Exclude hidden directories
        if (skillName.startsWith(".")) continue;
        entries.push(skillName);
      }
      // Lexical sort for deterministic results
      entries.sort((a, b) => a.localeCompare(b));
      for (const name of entries) {
        items.push({
          word: "/" + name,
          menu: `[skills:${scope}]`,
        });
      }
    } else {
      // Other directories: scan *.md files
      const entries: string[] = [];
      for await (const entry of Deno.readDir(dir)) {
        if (!entry.isFile) continue;
        // Exclude hidden files
        if (entry.name.startsWith(".")) continue;
        // Check .md extension
        if (!entry.name.endsWith(".md")) continue;
        entries.push(basename(entry.name, ".md"));
      }
      // Lexical sort for deterministic results
      entries.sort((a, b) => a.localeCompare(b));
      for (const name of entries) {
        items.push({
          word: "/" + name,
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

    // Scan plugins if enabled (plugins: "auto" or "on")
    if (params.plugins !== "off") {
      // Scan userPluginPaths (absolute paths with ~ expansion)
      for (const pluginPath of params.userPluginPaths) {
        // Skip empty or whitespace-only paths
        if (!pluginPath || !pluginPath.trim()) continue;
        const expandedPath = pluginPath.replace(/^~/, homeDir);
        const pluginItems = await scanPlugin(expandedPath, "user");
        items.push(...pluginItems);
      }

      // Scan projectPluginPaths (relative paths only, with boundary check)
      for (const pluginPath of params.projectPluginPaths) {
        // Skip empty or whitespace-only paths
        if (!pluginPath || !pluginPath.trim()) continue;
        // Reject absolute paths in projectPluginPaths
        if (isAbsolute(pluginPath)) continue;
        // Early rejection of path traversal attempts (defense in depth)
        if (pluginPath.includes("..")) continue;
        const resolvedPath = resolve(cwd, pluginPath);
        // Security: verify path is within project boundary
        if (!(await isWithinBoundary(resolvedPath, cwd))) continue;
        const pluginItems = await scanPlugin(resolvedPath, "project");
        items.push(...pluginItems);
      }
    }

    return items;
  }

  override params(): Params {
    return {
      userDirs: ["~/.claude/commands/", "~/.claude/skills/"],
      projectDirs: [".claude/commands/", ".claude/skills/"],
      plugins: "off",
      userPluginPaths: [],
      projectPluginPaths: [],
    };
  }
}
