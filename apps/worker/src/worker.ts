import { getConfig } from "../../../packages/shared/src/config";
import { log } from "../../../packages/shared/src/logger";
import { processQueueBatch } from "../../../packages/shared/src/processor/webhookProcessor";
import { createQueue } from "../../../packages/shared/src/queue/createQueue";
import { createStore } from "../../../packages/shared/src/store/createStore";

const config = getConfig();
const queue = createQueue(config);
const store = createStore(config);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOnce(): Promise<number> {
  const summary = await processQueueBatch(queue, store, config);
  return summary.events.length;
}

async function main(): Promise<void> {
  log("info", "Worker service started", {
    queue_mode: config.queueMode,
    worker_once: config.workerOnce
  });

  do {
    const processed = await runOnce();
    if (config.workerOnce) break;
    if (processed === 0) {
      await sleep(config.workerPollIntervalMs);
    }
  } while (true);
}

main().catch((error) => {
  log("error", "Worker crashed", {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
