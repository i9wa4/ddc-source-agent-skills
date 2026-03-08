import { assertEquals } from "jsr:@std/assert";
import { join } from "jsr:@std/path";
import {
  isWithinBoundary,
  scanDirectory,
  scanPlugin,
  scanPluginDirectory,
} from "./agent_skills.ts";

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

// Helper to create a valid skill directory
async function createSkill(
  parentDir: string,
  name: string,
  content?: string,
): Promise<void> {
  const dir = join(parentDir, name);
  await Deno.mkdir(dir, { recursive: true });
  await Deno.writeTextFile(join(dir, "SKILL.md"), content ?? `# ${name}`);
}

// Helper to create a valid plugin structure
async function createPlugin(
  pluginDir: string,
  options?: { skills?: string[] },
): Promise<void> {
  // Create .claude-plugin/plugin.json (required for valid plugin)
  const manifestDir = join(pluginDir, ".claude-plugin");
  await Deno.mkdir(manifestDir, { recursive: true });
  await Deno.writeTextFile(
    join(manifestDir, "plugin.json"),
    JSON.stringify({ name: "test-plugin", version: "1.0.0" }),
  );

  // Create skills
  if (options?.skills && options.skills.length > 0) {
    const skillsDir = join(pluginDir, "skills");
    await Deno.mkdir(skillsDir, { recursive: true });
    for (const skill of options.skills) {
      await createSkill(skillsDir, skill);
    }
  }
}

// ============================================================================
// scanDirectory Tests
// ============================================================================

Deno.test("scanDirectory - skills directory with SKILL.md", async () => {
  await withTempDir(async (tempDir) => {
    await createSkill(tempDir, "my-skill", "---\nname: my-skill\n---\n# My Skill");

    const items = await scanDirectory(tempDir, "user", "/");

    assertEquals(items.length, 1);
    assertEquals(items[0].word, "/my-skill");
    assertEquals(items[0].menu, "[skills:user]");
  });
});

Deno.test("scanDirectory - directory without SKILL.md is not recognized", async () => {
  await withTempDir(async (tempDir) => {
    const invalidDir = join(tempDir, "not-a-skill");
    await Deno.mkdir(invalidDir, { recursive: true });
    await Deno.writeTextFile(join(invalidDir, "README.md"), "# Not a skill");

    const items = await scanDirectory(tempDir, "user", "/");

    assertEquals(items.length, 0);
  });
});

Deno.test("scanDirectory - excludes hidden directories", async () => {
  await withTempDir(async (tempDir) => {
    await createSkill(tempDir, "visible-skill", "# Visible");
    await createSkill(tempDir, ".hidden-skill", "# Hidden");

    const items = await scanDirectory(tempDir, "user", "/");

    assertEquals(items.length, 1);
    assertEquals(items[0].word, "/visible-skill");
  });
});

Deno.test("scanDirectory - skills directory with symlinked skill entries", async () => {
  await withTempDir(async (tempDir) => {
    // Simulate Nix-managed skills: skill directories are symlinks
    const skillsDir = join(tempDir, "skills");
    await Deno.mkdir(skillsDir);

    // Real skill directory elsewhere (simulates Nix store)
    const realSkillDir = join(tempDir, "nix-store-skill");
    await Deno.mkdir(realSkillDir);
    await Deno.writeTextFile(join(realSkillDir, "SKILL.md"), "# Nix Skill");

    // Symlink inside skills/ pointing to the real directory
    await Deno.symlink(realSkillDir, join(skillsDir, "nix-skill"));

    const items = await scanDirectory(skillsDir, "user", "/");

    assertEquals(items.length, 1);
    assertEquals(items[0].word, "/nix-skill");
    assertEquals(items[0].menu, "[skills:user]");
  });
});

Deno.test("scanDirectory - non-existent directory returns empty", async () => {
  const items = await scanDirectory("/non/existent/path", "user", "/");
  assertEquals(items.length, 0);
});

Deno.test("scanDirectory - empty directory returns empty", async () => {
  await withTempDir(async (tempDir) => {
    const items = await scanDirectory(tempDir, "user", "/");
    assertEquals(items.length, 0);
  });
});

Deno.test("scanDirectory - project scope has correct menu label", async () => {
  await withTempDir(async (tempDir) => {
    await createSkill(tempDir, "my-skill");

    const items = await scanDirectory(tempDir, "project", "/");

    assertEquals(items[0].menu, "[skills:project]");
  });
});

Deno.test("scanDirectory - results are lexically sorted", async () => {
  await withTempDir(async (tempDir) => {
    for (const name of ["zeta", "alpha", "beta"]) {
      await createSkill(tempDir, name);
    }

    const items = await scanDirectory(tempDir, "user", "/");

    assertEquals(items.length, 3);
    assertEquals(items[0].word, "/alpha");
    assertEquals(items[1].word, "/beta");
    assertEquals(items[2].word, "/zeta");
  });
});

Deno.test("scanDirectory - dollar prefix for Codex CLI", async () => {
  await withTempDir(async (tempDir) => {
    await createSkill(tempDir, "my-skill");

    const items = await scanDirectory(tempDir, "user", "$");

    assertEquals(items[0].word, "$my-skill");
  });
});

Deno.test("scanDirectory - info field from inline description", async () => {
  await withTempDir(async (tempDir) => {
    await createSkill(
      tempDir,
      "my-skill",
      "---\nname: my-skill\ndescription: A simple skill description.\n---\n# Content",
    );

    const items = await scanDirectory(tempDir, "user", "/");

    assertEquals(items.length, 1);
    assertEquals(items[0].info, "A simple skill description.");
  });
});

Deno.test("scanDirectory - info field from block scalar description", async () => {
  await withTempDir(async (tempDir) => {
    await createSkill(
      tempDir,
      "my-skill",
      "---\nname: my-skill\ndescription: |\n  Git operations guide.\n  Use when writing commits.\n---\n# Content",
    );

    const items = await scanDirectory(tempDir, "user", "/");

    assertEquals(items.length, 1);
    assertEquals(items[0].info, "Git operations guide.");
  });
});

Deno.test("scanDirectory - info field from folded block scalar description", async () => {
  await withTempDir(async (tempDir) => {
    await createSkill(
      tempDir,
      "my-skill",
      "---\nname: my-skill\ndescription: >\n  Folded description line.\n  Second line.\n---\n# Content",
    );

    const items = await scanDirectory(tempDir, "user", "/");

    assertEquals(items.length, 1);
    assertEquals(items[0].info, "Folded description line.");
  });
});

Deno.test("scanDirectory - no info field when description absent", async () => {
  await withTempDir(async (tempDir) => {
    await createSkill(tempDir, "my-skill", "---\nname: my-skill\n---\n# Content");

    const items = await scanDirectory(tempDir, "user", "/");

    assertEquals(items.length, 1);
    assertEquals(items[0].info, undefined);
  });
});

Deno.test("scanDirectory - description truncated to 80 chars", async () => {
  await withTempDir(async (tempDir) => {
    const longDesc = "A".repeat(100);
    await createSkill(
      tempDir,
      "my-skill",
      `---\nname: my-skill\ndescription: ${longDesc}\n---\n# Content`,
    );

    const items = await scanDirectory(tempDir, "user", "/");

    assertEquals(items[0].info?.length, 80);
  });
});

// ============================================================================
// Plugin Tests
// ============================================================================

Deno.test("scanPlugin - valid plugin with skills", async () => {
  await withTempDir(async (tempDir) => {
    const pluginDir = join(tempDir, "my-plugin");
    await createPlugin(pluginDir, { skills: ["code-review", "testing"] });

    const items = await scanPlugin(pluginDir, "user", "/");

    assertEquals(items.length, 2);
    assertEquals(items.some((i) => i.word === "/my-plugin:code-review"), true);
    assertEquals(items.some((i) => i.word === "/my-plugin:testing"), true);
    assertEquals(items[0].menu, "[plugin:user]");
  });
});

Deno.test("scanPlugin - invalid plugin without manifest returns empty", async () => {
  await withTempDir(async (tempDir) => {
    const pluginDir = join(tempDir, "invalid-plugin");
    await Deno.mkdir(pluginDir);
    // Create skills but no .claude-plugin/plugin.json
    await createSkill(join(pluginDir, "skills"), "my-skill");

    const items = await scanPlugin(pluginDir, "user", "/");

    assertEquals(items.length, 0);
  });
});

Deno.test("scanPlugin - non-existent plugin returns empty", async () => {
  const items = await scanPlugin("/non/existent/plugin", "user", "/");
  assertEquals(items.length, 0);
});

Deno.test("scanPlugin - empty plugin (valid manifest but no skills)", async () => {
  await withTempDir(async (tempDir) => {
    const pluginDir = join(tempDir, "empty-plugin");
    await createPlugin(pluginDir, {}); // No skills

    const items = await scanPlugin(pluginDir, "user", "/");

    assertEquals(items.length, 0);
  });
});

Deno.test("scanPlugin - dollar prefix for Codex CLI", async () => {
  await withTempDir(async (tempDir) => {
    const pluginDir = join(tempDir, "my-plugin");
    await createPlugin(pluginDir, { skills: ["helper"] });

    const items = await scanPlugin(pluginDir, "user", "$");

    assertEquals(items[0].word, "$my-plugin:helper");
  });
});

Deno.test("scanPluginDirectory - skills with lexical sort", async () => {
  await withTempDir(async (tempDir) => {
    for (const name of ["zeta", "alpha", "beta"]) {
      await createSkill(tempDir, name);
    }

    const items = await scanPluginDirectory(
      tempDir,
      "test-plugin",
      "project",
      "/",
    );

    assertEquals(items.length, 3);
    assertEquals(items[0].word, "/test-plugin:alpha");
    assertEquals(items[1].word, "/test-plugin:beta");
    assertEquals(items[2].word, "/test-plugin:zeta");
    assertEquals(items[0].menu, "[plugin:project]");
  });
});

Deno.test("scanPluginDirectory - excludes hidden directories in skills", async () => {
  await withTempDir(async (tempDir) => {
    await createSkill(tempDir, "visible", "# Visible");
    await createSkill(tempDir, ".hidden", "# Hidden");

    const items = await scanPluginDirectory(
      tempDir,
      "test-plugin",
      "user",
      "/",
    );

    assertEquals(items.length, 1);
    assertEquals(items[0].word, "/test-plugin:visible");
  });
});

Deno.test("scanPluginDirectory - skills with symlinked skill entries", async () => {
  await withTempDir(async (tempDir) => {
    const skillsDir = join(tempDir, "skills");
    await Deno.mkdir(skillsDir);

    // Real skill directory elsewhere (simulates Nix store)
    const realSkillDir = join(tempDir, "nix-store-skill");
    await Deno.mkdir(realSkillDir);
    await Deno.writeTextFile(join(realSkillDir, "SKILL.md"), "# Nix Skill");

    // Symlink inside skills/ pointing to the real directory
    await Deno.symlink(realSkillDir, join(skillsDir, "nix-skill"));

    const items = await scanPluginDirectory(
      skillsDir,
      "test-plugin",
      "user",
      "/",
    );

    assertEquals(items.length, 1);
    assertEquals(items[0].word, "/test-plugin:nix-skill");
    assertEquals(items[0].menu, "[plugin:user]");
  });
});

Deno.test("scanPluginDirectory - non-existent directory returns empty", async () => {
  const items = await scanPluginDirectory(
    "/non/existent/dir",
    "test-plugin",
    "user",
    "/",
  );
  assertEquals(items.length, 0);
});

Deno.test("scanPlugin - duplicate skills across plugins produce separate items", async () => {
  await withTempDir(async (tempDir) => {
    const plugin1 = join(tempDir, "plugin1");
    const plugin2 = join(tempDir, "plugin2");
    await createPlugin(plugin1, { skills: ["shared-skill"] });
    await createPlugin(plugin2, { skills: ["shared-skill"] });

    const items1 = await scanPlugin(plugin1, "user", "/");
    const items2 = await scanPlugin(plugin2, "user", "/");

    assertEquals(items1.length, 1);
    assertEquals(items2.length, 1);
    assertEquals(items1[0].word, "/plugin1:shared-skill");
    assertEquals(items2[0].word, "/plugin2:shared-skill");
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
