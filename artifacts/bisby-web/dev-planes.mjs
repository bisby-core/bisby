import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = dirname(fileURLToPath(import.meta.url));
const planes = [
  { name: "Platform", port: "25321", key: "platform" },
  { name: "Design", port: "3001", key: "design" },
  { name: "Clientalpha", port: "3002", key: "clientalpha" },
];

const children = planes.map((plane) => {
  const child = spawn(
    "pnpm",
    ["exec", "vite", "--config", "vite.config.ts", "--host", "0.0.0.0"],
    {
      cwd: packageDirectory,
      env: {
        ...process.env,
        PORT: plane.port,
        VITE_BISBY_DEV_PLANE: plane.key,
      },
      stdio: "inherit",
    },
  );

  child.on("exit", (code, signal) => {
    if (code !== 0 && signal === null) {
      console.error(`${plane.name} development preview exited with code ${code}.`);
      process.exitCode = code ?? 1;
    }
  });

  return child;
});

const stopChildren = (signal) => {
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
};

process.on("SIGINT", () => stopChildren("SIGINT"));
process.on("SIGTERM", () => stopChildren("SIGTERM"));