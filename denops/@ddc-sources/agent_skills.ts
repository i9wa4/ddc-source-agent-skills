import {
  BaseSource,
  type GatherArguments,
} from "jsr:@shougo/ddc-vim@9.5.0/source";
import type { Item } from "jsr:@shougo/ddc-vim@9.5.0/types";
import {
  basename,
  isAbsolute,
  join,
  resolve,
} from "jsr:@std/path@^1.0.8";
import { exists } from "jsr:@std/fs@^1.0.8";

type Params = {
  userDirs: string[];
  projectDirs: string[];
  plugins: "on" | "off";
  userPluginPaths: string[];
  projectPluginPaths: string[];
  prefix: string | string[];
};

/**
 * Check if a directory is a valid Claude Code plugin.
 * A valid plugin must have .claude-plugin/plugin.json.
 */
async function isValidPlugin(pluginDir: string): Promise<boolean> {
  return await exists(join(pluginDir, ".claude-plugin", "plugin.json"));
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
    return realPath.startsWith(realBoundary + "/") ||
      realPath === realBoundary;
  } catch {
    return false; // Path doesn't exist or permission denied
  }
}

/**
 * Read the description field from a SKILL.md YAML frontmatter.
 * Returns the first non-empty description line, truncated to 80 chars.
 * Returns empty string if SKILL.md cannot be read or frontmatter is absent.
 */
async function readSkillDescription(skillMdPath: string): Promise<string> {
  try {
    const content = await Deno.readTextFile(skillMdPath);
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) return "";
    const fm = fmMatch[1];
    const descMatch = fm.match(/^description:\s*(.*)$/m);
    if (!descMatch) return "";
    const firstLine = descMatch[1].trim();
    if (firstLine && firstLine !== "|" && firstLine !== ">") {
      return firstLine.slice(0, 80);
    }
    // Block scalar: find first non-empty indented continuation line
    const afterDesc = fm.slice(descMatch.index! + descMatch[0].length);
    const blockMatch = afterDesc.match(/\n[ \t]+(\S[^\n]*)/);
    return blockMatch ? blockMatch[1].trim().slice(0, 80) : "";
  } catch {
    return "";
  }
}

/**
 * Collect skill names from a directory: subdirs containing SKILL.md,
 * excluding hidden entries, sorted lexically.
 */
async function collectSkillNames(dir: string): Promise<string[]> {
  const names: string[] = [];
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (entry.name.startsWith(".")) continue;
      try {
        await Deno.stat(join(dir, entry.name, "SKILL.md"));
        names.push(entry.name);
      } catch {
        // no SKILL.md, skip
      }
    }
  } catch {
    return [];
  }
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

/**
 * Scan a plugin skills directory for skills.
 *
 * @param dir - Plugin skills/ subdirectory path
 * @param pluginName - Name of the plugin (directory name)
 * @param scope - "user" or "project"
 * @param prefix - Completion prefix ("/" for Claude Code, "$" for Codex CLI)
 * @returns Array of completion items with [plugin:scope] menu
 */
export async function scanPluginDirectory(
  dir: string,
  pluginName: string,
  scope: "user" | "project",
  prefix: string,
): Promise<Item[]> {
  if (!(await exists(dir))) return [];
  const names = await collectSkillNames(dir);
  const items: Item[] = [];
  for (const name of names) {
    const info = await readSkillDescription(join(dir, name, "SKILL.md"));
    const item: Item = {
      word: `${prefix}${pluginName}:${name}`,
      menu: `[plugin:${scope}]`,
    };
    if (info) item.info = info;
    items.push(item);
  }
  return items;
}

/**
 * Scan a Claude Code plugin for skills.
 *
 * @param pluginDir - Plugin root directory
 * @param scope - "user" or "project"
 * @param prefix - Completion prefix
 * @returns Array of completion items
 */
export async function scanPlugin(
  pluginDir: string,
  scope: "user" | "project",
  prefix: string,
): Promise<Item[]> {
  try {
    if (!(await isValidPlugin(pluginDir))) return [];
    const pluginName = basename(pluginDir);
    return await scanPluginDirectory(
      join(pluginDir, "skills"),
      pluginName,
      scope,
      prefix,
    );
  } catch {
    return []; // Silent failure for fault isolation
  }
}

/**
 * Scan a skills directory.
 *
 * @param dir - Directory path to scan
 * @param scope - "user" or "project" for menu label
 * @param prefix - Completion prefix ("/" for Claude Code, "$" for Codex CLI)
 * @returns Array of completion items
 */
export async function scanDirectory(
  dir: string,
  scope: "user" | "project",
  prefix: string,
): Promise<Item[]> {
  if (!(await exists(dir))) return [];
  const names = await collectSkillNames(dir);
  const items: Item[] = [];
  for (const name of names) {
    const info = await readSkillDescription(join(dir, name, "SKILL.md"));
    const item: Item = {
      word: prefix + name,
      menu: `[skills:${scope}]`,
    };
    if (info) item.info = info;
    items.push(item);
  }
  return items;
}

/** Module-level cache: binary name → built-in command names ([] = tried, nothing found) */
const _builtinCache = new Map<string, string[]>();

/**
 * Extract built-in command names from a CLI binary via grep.
 * Results are cached in memory for the lifetime of the process.
 * Returns [] if binary is not found or extraction yields nothing.
 */
async function extractBuiltins(binaryName: string): Promise<string[]> {
  if (_builtinCache.has(binaryName)) return _builtinCache.get(binaryName)!;
  const empty: string[] = [];
  try {
    const whichResult = await new Deno.Command("which", {
      args: [binaryName],
      stdout: "piped",
      stderr: "null",
    }).output();
    if (!whichResult.success) {
      _builtinCache.set(binaryName, empty);
      return empty;
    }
    const binPath = new TextDecoder().decode(whichResult.stdout).trim();
    const realPath = await Deno.realPath(binPath);

    let names: string[] = [];
    if (binaryName === "claude") {
      // Claude Code: compiled JS bundle embeds userFacingName":"commandname"
      const grepResult = await new Deno.Command("grep", {
        args: ["-oa", 'userFacingName":"[^"]*"', realPath],
        stdout: "piped",
        stderr: "null",
      }).output();
      const output = new TextDecoder().decode(grepResult.stdout);
      names = [
        ...new Set(
          [...output.matchAll(/userFacingName":"([^"]+)"/g)].map((m) => m[1]),
        ),
      ].sort();
    } else if (binaryName === "codex") {
      // Codex CLI: Rust binary with known built-in command names
      const pattern =
        "add-dir\\|compact\\|agents\\|clear\\|config\\|continue\\|cost\\|fork\\|help\\|init\\|login\\|logout\\|mcp\\|memory\\|model\\|quit\\|resume\\|review\\|run\\|status\\|bug";
      const grepResult = await new Deno.Command("grep", {
        args: ["-oa", pattern, realPath],
        stdout: "piped",
        stderr: "null",
      }).output();
      const output = new TextDecoder().decode(grepResult.stdout);
      names = [
        ...new Set(
          output.split("\n").map((l) => l.trim()).filter((l) => l.length > 0),
        ),
      ].sort();
    }

    _builtinCache.set(binaryName, names);
    return names;
  } catch {
    _builtinCache.set(binaryName, empty);
    return empty;
  }
}

/** Map a completion prefix to its associated CLI binary name. */
function prefixToBinary(prefix: string): string {
  return prefix === "$" ? "codex" : "claude";
}

export class Source extends BaseSource<Params> {
  #prefixRe(prefix: string | string[]): RegExp {
    const prefixes = Array.isArray(prefix) ? prefix : [prefix];
    const escaped = prefixes
      .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    return new RegExp(`(^|\\s)((${escaped})[a-zA-Z0-9_:-]*)$`);
  }

  override getCompletePosition(args: GatherArguments<Params>): Promise<number> {
    const match = args.context.input.match(
      this.#prefixRe((args.sourceParams as Params).prefix),
    );
    if (!match) return Promise.resolve(-1);
    return Promise.resolve(args.context.input.length - match[2].length);
  }

  override async gather({
    denops,
    context,
    sourceParams,
  }: GatherArguments<Params>): Promise<Item[]> {
    const params = sourceParams as Params;
    const prefixes = Array.isArray(params.prefix)
      ? params.prefix
      : [params.prefix];

    const match = context.input.match(this.#prefixRe(prefixes));
    if (!match) return [];

    // match[3] is the prefix capture group from #prefixRe
    const typedPrefix = match[3];

    const homeDir = (await denops.call("expand", "~")) as string;
    const cwd = (await denops.call("getcwd")) as string;

    const items: Item[] = [];

    // Built-in commands (extracted once at first gather, then cached)
    const binaryName = prefixToBinary(typedPrefix);
    const builtinNames = await extractBuiltins(binaryName);
    for (const name of builtinNames) {
      items.push({ word: `${typedPrefix}${name}`, menu: `[builtins:${binaryName}]`, info: "" });
    }

    for (const dir of params.userDirs) {
      items.push(
        ...await scanDirectory(dir.replace(/^~/, homeDir), "user", typedPrefix),
      );
    }

    for (const dir of params.projectDirs) {
      items.push(
        ...await scanDirectory(resolve(cwd, dir), "project", typedPrefix),
      );
    }

    if (params.plugins !== "off") {
      for (const pluginPath of params.userPluginPaths) {
        if (!pluginPath || !pluginPath.trim()) continue;
        items.push(
          ...await scanPlugin(
            pluginPath.replace(/^~/, homeDir),
            "user",
            typedPrefix,
          ),
        );
      }

      for (const pluginPath of params.projectPluginPaths) {
        if (!pluginPath || !pluginPath.trim()) continue;
        if (isAbsolute(pluginPath) || pluginPath.includes("..")) continue;
        const resolvedPath = resolve(cwd, pluginPath);
        if (!(await isWithinBoundary(resolvedPath, cwd))) continue;
        items.push(...await scanPlugin(resolvedPath, "project", typedPrefix));
      }
    }

    return items;
  }

  override params(): Params {
    return {
      userDirs: ["~/.claude/skills/"],
      projectDirs: [".claude/skills/"],
      plugins: "off",
      userPluginPaths: [],
      projectPluginPaths: [],
      prefix: ["/", "$"],
    };
  }
}
