import { assertEquals } from "jsr:@std/assert";
import { join } from "jsr:@std/path";
import { scanDirectory } from "./slash_commands.ts";

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
