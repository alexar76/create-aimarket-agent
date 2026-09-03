import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const KINDS = ["tool", "data-provider", "orchestrator"];

// Kept character-for-character identical to the Python generator so both
// flavours accept and reject exactly the same project names.
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/;

const TEMPLATE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "templates", "base");

export function slug(value) {
  const clean = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!clean) {
    throw new Error("project name must contain a letter or digit");
  }
  return clean;
}

export function validateName(value) {
  const name = value.trim();
  if (!SAFE_NAME.test(name)) {
    throw new Error(
      "project name must be 1-64 characters and contain only letters, digits, spaces, dots, dashes, or underscores",
    );
  }
  return name;
}

// npm never ships a file literally named `.gitignore` inside a tarball, so
// dotfiles are stored with a leading underscore and restored on the way out.
function restoreDotfiles(relativePath) {
  return relativePath
    .split(sep)
    .map((segment) => (segment.startsWith("_") ? `.${segment.slice(1)}` : segment))
    .join(sep);
}

function walk(root, prefix = "") {
  const entries = [];
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) {
      entries.push(...walk(root, relative));
    } else if (entry.isFile()) {
      entries.push(relative);
    }
  }
  return entries;
}

export function scaffold(target, { name, kind, metis }) {
  const projectName = validateName(name);
  if (!KINDS.includes(kind)) {
    throw new Error(`kind must be one of: ${KINDS.join(", ")}`);
  }
  const destination = resolve(target);
  if (existsSync(destination)) {
    throw new Error(`target already exists: ${destination}`);
  }
  const parent = dirname(destination);
  const base = destination.slice(parent.length + 1);
  mkdirSync(parent, { recursive: true });

  const replacements = {
    __PROJECT_NAME__: projectName,
    __PROJECT_SLUG__: slug(projectName),
    __AGENT_KIND__: kind,
    __METIS_ENABLED__: metis ? "true" : "false",
  };

  const stageRoot = mkdtempSync(join(parent, `.${base}.tmp-`));
  const staged = join(stageRoot, base);
  try {
    mkdirSync(staged, { recursive: true });
    for (const relative of walk(TEMPLATE_ROOT)) {
      const outputPath = join(staged, restoreDotfiles(relative));
      mkdirSync(dirname(outputPath), { recursive: true });
      let text = readFileSync(join(TEMPLATE_ROOT, relative), "utf8");
      for (const [placeholder, value] of Object.entries(replacements)) {
        text = text.split(placeholder).join(value);
      }
      writeFileSync(outputPath, text, { encoding: "utf8", mode: 0o644 });
    }
    if (existsSync(destination)) {
      throw new Error(`target appeared while scaffolding: ${destination}`);
    }
    renameSync(staged, destination);
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
  }
  // A generated tree that still carries a placeholder would publish a broken
  // manifest, so refuse to hand one back.
  for (const relative of walk(destination)) {
    const contents = readFileSync(join(destination, relative), "utf8");
    for (const placeholder of Object.keys(replacements)) {
      if (contents.includes(placeholder)) {
        rmSync(destination, { recursive: true, force: true });
        throw new Error(`template placeholder ${placeholder} survived in ${relative}`);
      }
    }
  }
  if (!lstatSync(destination).isDirectory()) {
    throw new Error(`target is not a directory: ${destination}`);
  }
  return destination;
}
