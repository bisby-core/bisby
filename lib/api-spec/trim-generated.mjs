import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "..", "..");
const files = [
  "lib/api-client-react/src/generated/api.ts",
  "lib/api-client-react/src/generated/api.schemas.ts",
  "lib/api-zod/src/generated/api.ts",
];

for (const relativePath of files) {
  const filePath = path.join(root, relativePath);
  const content = await readFile(filePath, "utf8");
  await writeFile(filePath, `${content.trimEnd()}\n`, "utf8");
}