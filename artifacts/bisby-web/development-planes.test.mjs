import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { after, before, test } from "node:test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = dirname(fileURLToPath(import.meta.url));
const proxyPort = 3301;
let targetServer;
let targetPort;
let vite;
let receivedHeaders;
let receivedPath;

const waitForPort = async (port) => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const available = await new Promise((resolve) => {
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    if (available) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for port ${port}.`);
};

before(async () => {
  targetServer = http.createServer((request, response) => {
    receivedHeaders = request.headers;
    receivedPath = request.url;
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  });
  await new Promise((resolve) => targetServer.listen(0, "127.0.0.1", resolve));
  targetPort = targetServer.address().port;

  vite = spawn(
    "pnpm",
    ["exec", "vite", "--config", "vite.config.ts", "--host", "127.0.0.1"],
    {
      cwd: packageDirectory,
      env: {
        ...process.env,
        PORT: String(proxyPort),
        BASE_PATH: "/",
        VITE_BISBY_DEV_PLANE: "design",
        BISBY_DEV_API_URL: `http://127.0.0.1:${targetPort}`,
      },
      stdio: "ignore",
    },
  );
  await waitForPort(proxyPort);
});

after(async () => {
  if (vite && !vite.killed) vite.kill("SIGTERM");
  if (targetServer) {
    await new Promise((resolve) => targetServer.close(resolve));
  }
});

test("development proxy replaces conflicting host headers", async () => {
  const status = await new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port: proxyPort,
        path: "/api/probe",
        headers: {
          host: "attacker.invalid",
          "x-forwarded-host": "clientalpha.bisby.pro",
        },
      },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode));
      },
    );
    request.once("error", reject);
    request.end();
  });

  assert.equal(status, 200);
  assert.equal(receivedHeaders.host, "design.bisby.pro");
  assert.equal(receivedHeaders["x-forwarded-host"], "design.bisby.pro");
});

test("development preview launches only the Design tenant plane", async () => {
  const runner = await readFile(
    new URL("./dev-planes.mjs", import.meta.url),
    "utf8",
  );

  assert.match(runner, /VITE_BISBY_DEV_PLANE:\s*"design"/);
  assert.doesNotMatch(runner, /key:\s*"platform"/);
  assert.doesNotMatch(runner, /key:\s*"clientalpha"/);
  assert.equal(receivedPath, "/api/probe");
});