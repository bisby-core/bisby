import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = dirname(fileURLToPath(import.meta.url));
const child = spawn(
  "pnpm",
  ["exec", "vite", "--config", "vite.config.ts", "--host", "0.0.0.0"],
  {
    cwd: packageDirectory,
    env: {
      ...process.env,
      PORT: process.env.PORT ?? "25321",
      VITE_BISBY_DEV_PLANE: "design",
    },
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (code !== 0 && signal === null) {
    console.error(`Design development preview exited with code ${code}.`);
    process.exitCode = code ?? 1;
  }
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));