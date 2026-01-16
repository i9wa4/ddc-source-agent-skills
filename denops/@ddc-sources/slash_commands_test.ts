import { assertEquals } from "jsr:@std/assert";
import { join } from "jsr:@std/path";
import {
  isWithinBoundary,
  scanDirectory,
  scanPlugin,
  scanPluginDirectory,
} from "./slash_commands.ts";

// Helper to create temp directory structure
async function withTempDir(
  fn: (tempDir: string) => Promise<void>,
): Promise<void> {
  const tempDir = await Deno.makeTempDir();
  try {
    await fn(tempDir);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
}

Deno.test("scanDirectory - commands directory with .md files", async () => {
  await withTempDir(async (tempDir) => {
    const commandsDir = join(tempDir, "commands");
    await Deno.mkdir(commandsDir);
    await Deno.writeTextFile(join(commandsDir, "test-cmd.md"), "# Test");
    await Deno.writeTextFile(join(commandsDir, "another.md"), "# Another");

    const items = await scanDirectory(commandsDir, "user");

    assertEquals(items.length, 2);
    assertEquals(items.some((i) => i.word === "/test-cmd"), true);
    assertEquals(items.some((i) => i.word === "/another"), true);
    assertEquals(items[0].menu, "[commands:user]");
  });
});

Deno.test("scanDirectory - commands directory excludes non-.md files", async () => {
  await withTempDir(async (tempDir) => {
    const commandsDir = join(tempDir, "commands");
    await Deno.mkdir(commandsDir);
    await Deno.writeTextFile(join(commandsDir, "valid.md"), "# Valid");
    await Deno.writeTextFile(join(commandsDir, "invalid.txt"), "Invalid");

    const items = await scanDirectory(commandsDir, "user");

    assertEquals(items.length, 1);
    assertEquals(items[0].word, "/valid");
  });
});

Deno.test("scanDirectory - commands directory excludes hidden files", async () => {
  await withTempDir(async (tempDir) => {
    const commandsDir = join(tempDir, "commands");
    await Deno.mkdir(commandsDir);
    await Deno.writeTextFile(join(commandsDir, "visible.md"), "# Visible");
    await Deno.writeTextFile(join(commandsDir, ".hidden.md"), "# Hidden");

    const items = await scanDirectory(commandsDir, "user");

    assertEquals(items.length, 1);
    assertEquals(items[0].word, "/visible");
  });
});

Deno.test("scanDirectory - skills directory with SKILL.md", async () => {
  await withTempDir(async (tempDir) => {
    const skillsDir = join(tempDir, "skills");
    const skillDir = join(skillsDir, "my-skill");
    await Deno.mkdir(skillDir, { recursive: true });
    await Deno.writeTextFile(
      join(skillDir, "SKILL.md"),
      "---\nname: my-skill\n---\n# My Skill",
    );

    const items = await scanDirectory(skillsDir, "user");

    assertEquals(items.length, 1);
    assertEquals(items[0].word, "/my-skill");
    assertEquals(items[0].menu, "[skills:user]");
  });
});

Deno.test("scanDirectory - skills directory without SKILL.md is not recognized", async () => {
  await withTempDir(async (tempDir) => {
    const skillsDir = join(tempDir, "skills");
    const invalidDir = join(skillsDir, "not-a-skill");
    await Deno.mkdir(invalidDir, { recursive: true });
    await Deno.writeTextFile(join(invalidDir, "README.md"), "# Not a skill");

    const items = await scanDirectory(skillsDir, "user");

    assertEquals(items.length, 0);
  });
});

Deno.test("scanDirectory - skills directory excludes hidden directories", async () => {
  await withTempDir(async (tempDir) => {
    const skillsDir = join(tempDir, "skills");

    // Visible skill
    const visibleDir = join(skillsDir, "visible-skill");
    await Deno.mkdir(visibleDir, { recursive: true });
    await Deno.writeTextFile(join(visibleDir, "SKILL.md"), "# Visible");

    // Hidden skill (should be excluded)
    const hiddenDir = join(skillsDir, ".hidden-skill");
    await Deno.mkdir(hiddenDir, { recursive: true });
    await Deno.writeTextFile(join(hiddenDir, "SKILL.md"), "# Hidden");

    const items = await scanDirectory(skillsDir, "user");

    assertEquals(items.length, 1);
    assertEquals(items[0].word, "/visible-skill");
  });
});

Deno.test("scanDirectory - non-existent directory returns empty", async () => {
  const items = await scanDirectory("/non/existent/path", "user");
  assertEquals(items.length, 0);
});

Deno.test("scanDirectory - empty directory returns empty", async () => {
  await withTempDir(async (tempDir) => {
    const emptyDir = join(tempDir, "commands");
    await Deno.mkdir(emptyDir);

    const items = await scanDirectory(emptyDir, "user");

    assertEquals(items.length, 0);
  });
});

Deno.test("scanDirectory - project scope has correct menu label", async () => {
  await withTempDir(async (tempDir) => {
    const commandsDir = join(tempDir, "commands");
    await Deno.mkdir(commandsDir);
    await Deno.writeTextFile(join(commandsDir, "cmd.md"), "# Command");

    const items = await scanDirectory(commandsDir, "project");

    assertEquals(items[0].menu, "[commands:project]");
  });
});

// ============================================================================
// Plugin Tests
// ============================================================================

// Helper to create a valid plugin structure
async function createPlugin(
  pluginDir: string,
  options?: { commands?: string[]; skills?: string[] },
): Promise<void> {
  // Create .claude-plugin/plugin.json (required for valid plugin)
  const manifestDir = join(pluginDir, ".claude-plugin");
  await Deno.mkdir(manifestDir, { recursive: true });
  await Deno.writeTextFile(
    join(manifestDir, "plugin.json"),
    JSON.stringify({ name: "test-plugin", version: "1.0.0" }),
  );

  // Create commands
  if (options?.commands && options.commands.length > 0) {
    const commandsDir = join(pluginDir, "commands");
    await Deno.mkdir(commandsDir, { recursive: true });
    for (const cmd of options.commands) {
      await Deno.writeTextFile(join(commandsDir, `${cmd}.md`), `# ${cmd}`);
    }
  }

  // Create skills
  if (options?.skills && options.skills.length > 0) {
    const skillsDir = join(pluginDir, "skills");
    await Deno.mkdir(skillsDir, { recursive: true });
    for (const skill of options.skills) {
      const skillDir = join(skillsDir, skill);
      await Deno.mkdir(skillDir, { recursive: true });
      await Deno.writeTextFile(join(skillDir, "SKILL.md"), `# ${skill}`);
    }
  }
}

Deno.test("scanPlugin - valid plugin with commands", async () => {
  await withTempDir(async (tempDir) => {
    const pluginDir = join(tempDir, "my-plugin");
    await createPlugin(pluginDir, { commands: ["review", "deploy"] });

    const items = await scanPlugin(pluginDir, "user");

    assertEquals(items.length, 2);
    assertEquals(items.some((i) => i.word === "/my-plugin:review"), true);
    assertEquals(items.some((i) => i.word === "/my-plugin:deploy"), true);
    assertEquals(items[0].menu, "[plugin:user]");
  });
});

Deno.test("scanPlugin - valid plugin with skills", async () => {
  await withTempDir(async (tempDir) => {
    const pluginDir = join(tempDir, "my-plugin");
    await createPlugin(pluginDir, { skills: ["code-review", "testing"] });

    const items = await scanPlugin(pluginDir, "user");

    assertEquals(items.length, 2);
    assertEquals(items.some((i) => i.word === "/my-plugin:code-review"), true);
    assertEquals(items.some((i) => i.word === "/my-plugin:testing"), true);
    assertEquals(items[0].menu, "[plugin:user]");
  });
});

Deno.test("scanPlugin - valid plugin with both commands and skills", async () => {
  await withTempDir(async (tempDir) => {
    const pluginDir = join(tempDir, "my-plugin");
    await createPlugin(pluginDir, {
      commands: ["commit", "push"],
      skills: ["git-helper"],
    });

    const items = await scanPlugin(pluginDir, "project");

    assertEquals(items.length, 3);
    // All items have same menu format [plugin:scope]
    assertEquals(items.filter((i) => i.menu === "[plugin:project]").length, 3);
    // Verify command format: /plugin-name:command-name
    assertEquals(items.some((i) => i.word === "/my-plugin:commit"), true);
    assertEquals(items.some((i) => i.word === "/my-plugin:push"), true);
    assertEquals(items.some((i) => i.word === "/my-plugin:git-helper"), true);
  });
});

Deno.test("scanPlugin - invalid plugin without manifest returns empty", async () => {
  await withTempDir(async (tempDir) => {
    const pluginDir = join(tempDir, "invalid-plugin");
    await Deno.mkdir(pluginDir);
    // Create commands but no .claude-plugin/plugin.json
    const commandsDir = join(pluginDir, "commands");
    await Deno.mkdir(commandsDir);
    await Deno.writeTextFile(join(commandsDir, "cmd.md"), "# Command");

    const items = await scanPlugin(pluginDir, "user");

    assertEquals(items.length, 0);
  });
});

Deno.test("scanPlugin - non-existent plugin returns empty", async () => {
  const items = await scanPlugin("/non/existent/plugin", "user");
  assertEquals(items.length, 0);
});

Deno.test("scanPlugin - empty plugin (valid manifest but no commands/skills)", async () => {
  await withTempDir(async (tempDir) => {
    const pluginDir = join(tempDir, "empty-plugin");
    await createPlugin(pluginDir, {}); // No commands or skills

    const items = await scanPlugin(pluginDir, "user");

    assertEquals(items.length, 0);
  });
});

Deno.test("scanPluginDirectory - commands with lexical sort", async () => {
  await withTempDir(async (tempDir) => {
    const commandsDir = join(tempDir, "commands");
    await Deno.mkdir(commandsDir);
    // Create in non-alphabetical order
    await Deno.writeTextFile(join(commandsDir, "zebra.md"), "# Z");
    await Deno.writeTextFile(join(commandsDir, "alpha.md"), "# A");
    await Deno.writeTextFile(join(commandsDir, "middle.md"), "# M");

    const items = await scanPluginDirectory(
      commandsDir,
      "test-plugin",
      "commands",
      "user",
    );

    assertEquals(items.length, 3);
    // Should be sorted alphabetically with plugin name prefix
    assertEquals(items[0].word, "/test-plugin:alpha");
    assertEquals(items[1].word, "/test-plugin:middle");
    assertEquals(items[2].word, "/test-plugin:zebra");
  });
});

Deno.test("scanPluginDirectory - skills with lexical sort", async () => {
  await withTempDir(async (tempDir) => {
    const skillsDir = join(tempDir, "skills");
    // Create in non-alphabetical order
    for (const name of ["zeta", "alpha", "beta"]) {
      const dir = join(skillsDir, name);
      await Deno.mkdir(dir, { recursive: true });
      await Deno.writeTextFile(join(dir, "SKILL.md"), `# ${name}`);
    }

    const items = await scanPluginDirectory(
      skillsDir,
      "test-plugin",
      "skills",
      "project",
    );

    assertEquals(items.length, 3);
    // Should be sorted alphabetically with plugin name prefix
    assertEquals(items[0].word, "/test-plugin:alpha");
    assertEquals(items[1].word, "/test-plugin:beta");
    assertEquals(items[2].word, "/test-plugin:zeta");
    assertEquals(items[0].menu, "[plugin:project]");
  });
});

Deno.test("scanPluginDirectory - excludes hidden files in commands", async () => {
  await withTempDir(async (tempDir) => {
    const commandsDir = join(tempDir, "commands");
    await Deno.mkdir(commandsDir);
    await Deno.writeTextFile(join(commandsDir, "visible.md"), "# Visible");
    await Deno.writeTextFile(join(commandsDir, ".hidden.md"), "# Hidden");

    const items = await scanPluginDirectory(
      commandsDir,
      "test-plugin",
      "commands",
      "user",
    );

    assertEquals(items.length, 1);
    assertEquals(items[0].word, "/test-plugin:visible");
  });
});

Deno.test("scanPluginDirectory - excludes hidden directories in skills", async () => {
  await withTempDir(async (tempDir) => {
    const skillsDir = join(tempDir, "skills");

    // Visible skill
    const visibleDir = join(skillsDir, "visible");
    await Deno.mkdir(visibleDir, { recursive: true });
    await Deno.writeTextFile(join(visibleDir, "SKILL.md"), "# Visible");

    // Hidden skill
    const hiddenDir = join(skillsDir, ".hidden");
    await Deno.mkdir(hiddenDir, { recursive: true });
    await Deno.writeTextFile(join(hiddenDir, "SKILL.md"), "# Hidden");

    const items = await scanPluginDirectory(
      skillsDir,
      "test-plugin",
      "skills",
      "user",
    );

    assertEquals(items.length, 1);
    assertEquals(items[0].word, "/test-plugin:visible");
  });
});

Deno.test("scanPluginDirectory - excludes non-.md files in commands", async () => {
  await withTempDir(async (tempDir) => {
    const commandsDir = join(tempDir, "commands");
    await Deno.mkdir(commandsDir);
    await Deno.writeTextFile(join(commandsDir, "valid.md"), "# Valid");
    await Deno.writeTextFile(join(commandsDir, "invalid.txt"), "Invalid");
    await Deno.writeTextFile(join(commandsDir, "also-invalid.json"), "{}");

    const items = await scanPluginDirectory(
      commandsDir,
      "test-plugin",
      "commands",
      "user",
    );

    assertEquals(items.length, 1);
    assertEquals(items[0].word, "/test-plugin:valid");
  });
});

Deno.test("scanPluginDirectory - non-existent directory returns empty", async () => {
  const items = await scanPluginDirectory(
    "/non/existent/dir",
    "test-plugin",
    "commands",
    "user",
  );
  assertEquals(items.length, 0);
});

Deno.test("scanPlugin - duplicate commands across plugins produce separate items", async () => {
  await withTempDir(async (tempDir) => {
    // Create two plugins with same command name
    const plugin1 = join(tempDir, "plugin1");
    const plugin2 = join(tempDir, "plugin2");
    await createPlugin(plugin1, { commands: ["shared-cmd"] });
    await createPlugin(plugin2, { commands: ["shared-cmd"] });

    const items1 = await scanPlugin(plugin1, "user");
    const items2 = await scanPlugin(plugin2, "user");

    // Both should return the command with their plugin name prefix
    assertEquals(items1.length, 1);
    assertEquals(items2.length, 1);
    assertEquals(items1[0].word, "/plugin1:shared-cmd");
    assertEquals(items2[0].word, "/plugin2:shared-cmd");
  });
});

Deno.test("scanPlugin - mixed valid/invalid continues scanning", async () => {
  await withTempDir(async (tempDir) => {
    const pluginDir = join(tempDir, "mixed-plugin");
    await createPlugin(pluginDir, { commands: ["valid-cmd"] });

    // Create an invalid skill directory (no SKILL.md)
    const invalidSkillDir = join(pluginDir, "skills", "invalid-skill");
    await Deno.mkdir(invalidSkillDir, { recursive: true });
    await Deno.writeTextFile(join(invalidSkillDir, "README.md"), "# Not a skill");

    const items = await scanPlugin(pluginDir, "user");

    // Should still return the valid command with plugin name prefix
    assertEquals(items.length, 1);
    assertEquals(items[0].word, "/mixed-plugin:valid-cmd");
  });
});

// ============================================================================
// Security Tests
// ============================================================================

Deno.test("isWithinBoundary - path within boundary returns true", async () => {
  await withTempDir(async (tempDir) => {
    const subDir = join(tempDir, "subdir");
    await Deno.mkdir(subDir);

    const result = await isWithinBoundary(subDir, tempDir);

    assertEquals(result, true);
  });
});

Deno.test("isWithinBoundary - exact boundary path returns true", async () => {
  await withTempDir(async (tempDir) => {
    const result = await isWithinBoundary(tempDir, tempDir);

    assertEquals(result, true);
  });
});

Deno.test("isWithinBoundary - path outside boundary returns false", async () => {
  await withTempDir(async (tempDir) => {
    const outsidePath = "/tmp";

    const result = await isWithinBoundary(outsidePath, tempDir);

    assertEquals(result, false);
  });
});

Deno.test("isWithinBoundary - non-existent path returns false", async () => {
  await withTempDir(async (tempDir) => {
    const nonExistent = join(tempDir, "does-not-exist");

    const result = await isWithinBoundary(nonExistent, tempDir);

    assertEquals(result, false);
  });
});

Deno.test("isWithinBoundary - symlink within boundary returns true", async () => {
  await withTempDir(async (tempDir) => {
    const targetDir = join(tempDir, "target");
    await Deno.mkdir(targetDir);
    const symlinkPath = join(tempDir, "link");
    await Deno.symlink(targetDir, symlinkPath);

    const result = await isWithinBoundary(symlinkPath, tempDir);

    assertEquals(result, true);
  });
});

Deno.test("isWithinBoundary - symlink outside boundary returns false", async () => {
  await withTempDir(async (tempDir) => {
    // Create symlink pointing outside the temp directory
    const symlinkPath = join(tempDir, "escape-link");
    await Deno.symlink("/tmp", symlinkPath);

    const result = await isWithinBoundary(symlinkPath, tempDir);

    assertEquals(result, false);
  });
});

Deno.test("isWithinBoundary - similar prefix path returns false", async () => {
  // Test that /project-other is not considered within /project
  await withTempDir(async (tempDir) => {
    const projectDir = join(tempDir, "project");
    const projectOtherDir = join(tempDir, "project-other");
    await Deno.mkdir(projectDir);
    await Deno.mkdir(projectOtherDir);

    const result = await isWithinBoundary(projectOtherDir, projectDir);

    assertEquals(result, false);
  });
});

Deno.test("scanDirectory - results are lexically sorted", async () => {
  await withTempDir(async (tempDir) => {
    const commandsDir = join(tempDir, "commands");
    await Deno.mkdir(commandsDir);
    // Create in non-alphabetical order
    await Deno.writeTextFile(join(commandsDir, "zebra.md"), "# Z");
    await Deno.writeTextFile(join(commandsDir, "alpha.md"), "# A");
    await Deno.writeTextFile(join(commandsDir, "middle.md"), "# M");

    const items = await scanDirectory(commandsDir, "user");

    assertEquals(items.length, 3);
    assertEquals(items[0].word, "/alpha");
    assertEquals(items[1].word, "/middle");
    assertEquals(items[2].word, "/zebra");
  });
});

Deno.test("scanDirectory - skills results are lexically sorted", async () => {
  await withTempDir(async (tempDir) => {
    const skillsDir = join(tempDir, "skills");
    // Create in non-alphabetical order
    for (const name of ["zeta", "alpha", "beta"]) {
      const dir = join(skillsDir, name);
      await Deno.mkdir(dir, { recursive: true });
      await Deno.writeTextFile(join(dir, "SKILL.md"), `# ${name}`);
    }

    const items = await scanDirectory(skillsDir, "user");

    assertEquals(items.length, 3);
    assertEquals(items[0].word, "/alpha");
    assertEquals(items[1].word, "/beta");
    assertEquals(items[2].word, "/zeta");
  });
});
