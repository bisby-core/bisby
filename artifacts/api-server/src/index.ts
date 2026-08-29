import app from "./app";
import { logger } from "./lib/logger";
import { loadRuntimeConfig } from "./config/env";

const { port } = loadRuntimeConfig();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
