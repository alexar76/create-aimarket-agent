import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { KINDS, scaffold, slug, validateName } from "./scaffold.mjs";

const USAGE = `usage: create-aimarket-agent [name] [--kind ${KINDS.join("|")}] [--metis|--no-metis] [--directory DIR]

Scaffold an AIMarket Protocol v2 capability provider in TypeScript.

  name           project name (prompted when a terminal is attached)
  --kind         ${KINDS.join(", ")} (default: tool)
  --metis        request Metis verification in the manifest (default)
  --no-metis     publish without verification
  --directory    output directory (default: ./<slug>)
  -h, --help     show this message
`;

export function parseArgs(argv) {
  const options = { name: undefined, kind: "tool", metis: true, directory: undefined, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "-h" || argument === "--help") {
      options.help = true;
    } else if (argument === "--metis") {
      options.metis = true;
    } else if (argument === "--no-metis") {
      options.metis = false;
    } else if (argument === "--kind" || argument === "--directory") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${argument} requires a value`);
      }
      index += 1;
      if (argument === "--kind") {
        options.kind = value;
      } else {
        options.directory = value;
      }
    } else if (argument.startsWith("--kind=")) {
      options.kind = argument.slice("--kind=".length);
    } else if (argument.startsWith("--directory=")) {
      options.directory = argument.slice("--directory=".length);
    } else if (argument.startsWith("-")) {
      throw new Error(`unknown option: ${argument}`);
    } else if (options.name === undefined) {
      options.name = argument;
    } else {
      throw new Error(`unexpected argument: ${argument}`);
    }
  }
  return options;
}

export async function main(argv = process.argv.slice(2), { write = console.log, fail = console.error } = {}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    fail(`error: ${error.message}`);
    fail(USAGE);
    return 2;
  }
  if (options.help) {
    write(USAGE);
    return 0;
  }
  let name = options.name;
  if (!name && stdin.isTTY) {
    const reader = createInterface({ input: stdin, output: stdout });
    try {
      name = (await reader.question("Agent name: ")).trim();
    } finally {
      reader.close();
    }
  }
  if (!name) {
    fail("error: name is required");
    fail(USAGE);
    return 2;
  }
  try {
    name = validateName(name);
    const target = options.directory ? resolve(options.directory) : resolve(process.cwd(), slug(name));
    scaffold(target, { name, kind: options.kind, metis: options.metis });
    write(`Created ${name} in ${target}`);
    write(`Next: cd ${target} && npm install`);
    write("Then: npm run configure && npm test && npm run dev");
  } catch (error) {
    fail(`error: ${error.message}`);
    return 2;
  }
  return 0;
}
