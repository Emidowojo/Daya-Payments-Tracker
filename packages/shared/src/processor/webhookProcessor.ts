import { AppConfig } from "../config";
import { log } from "../logger";
import { QueueClient } from "../queue/queueClient";
import { StateStore } from "../store/stateStore";
import { Deposit, DayaWebhookEvent, FundingAccount, QueueMessage, Transfer, Withdrawal } from "../types";

export interface ProcessedBatchSummary {
  processed: number;
  events: Array<{
    id: string;
    event: string;
    status: "processed" | "failed";
    error?: string;
  }>;
}

export async function processWebhookEvent(event: DayaWebhookEvent, store: StateStore): Promise<void> {
  if (await store.hasProcessedWebhook(event.id)) {
    await store.upsertWebhook({
      id: event.id,
      event: event.event,
      status: "skipped_duplicate",
      received_at: new Date().toISOString(),
      attempts: 0,
      payload: event
    });
    return;
  }

  await store.upsertWebhook({
    id: event.id,
    event: event.event,
    status: "received",
    received_at: new Date().toISOString(),
    attempts: 0,
    payload: event
  });

  if (event.event.startsWith("funding_account.")) {
    await store.upsertFundingAccount(event.data as unknown as FundingAccount);
  } else if (event.event.startsWith("deposit.")) {
    await store.upsertDeposit(event.data as unknown as Deposit);
  } else if (event.event.startsWith("transfer.")) {
    await store.upsertTransfer(event.data as unknown as Transfer);
  } else if (event.event.startsWith("withdrawal.")) {
    await store.upsertWithdrawal(event.data as unknown as Withdrawal);
  } else {
    log("warn", "Unknown webhook event family", {
      webhook_event_id: event.id,
      event: event.event
    });
  }

  await store.upsertWebhook({
    id: event.id,
    event: event.event,
    status: "processed",
    received_at: new Date().toISOString(),
    processed_at: new Date().toISOString(),
    attempts: 0,
    payload: event
  });
}

export async function processQueueMessage(message: QueueMessage, queue: QueueClient, store: StateStore): Promise<void> {
  try {
    await processWebhookEvent(message.body, store);
    await queue.complete(message);
    log("info", "Processed webhook event", {
      webhook_event_id: message.body.id,
      event: message.body.event
    });
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    await queue.fail(message, normalized);
    await store.upsertWebhook({
      id: message.body.id,
      event: message.body.event,
      status: "failed",
      received_at: new Date().toISOString(),
      attempts: 0,
      last_error: normalized.message,
      payload: message.body
    });
    log("error", "Failed to process webhook event", {
      webhook_event_id: message.body.id,
      event: message.body.event,
      error: normalized.message
    });
    throw normalized;
  }
}

export async function processQueueBatch(
  queue: QueueClient,
  store: StateStore,
  config: Pick<AppConfig, "workerBatchSize">
): Promise<ProcessedBatchSummary> {
  const messages = await queue.receive(config.workerBatchSize);
  const summary: ProcessedBatchSummary = {
    processed: 0,
    events: []
  };

  for (const message of messages) {
    try {
      await processQueueMessage(message, queue, store);
      summary.processed += 1;
      summary.events.push({
        id: message.body.id,
        event: message.body.event,
        status: "processed"
      });
    } catch (error) {
      summary.events.push({
        id: message.body.id,
        event: message.body.event,
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return summary;
}
