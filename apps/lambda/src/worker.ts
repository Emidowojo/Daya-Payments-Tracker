import { processWebhookEvent } from "../../../packages/shared/src/processor/webhookProcessor";
import { DynamoJsonStore } from "../../../packages/shared/src/store/dynamoJsonStore";
import { DayaWebhookEvent } from "../../../packages/shared/src/types";
import { getRuntimeConfig, SqsBatchResponse, SqsEvent } from "./runtime";

const config = getRuntimeConfig();
const store = new DynamoJsonStore(config.stateTableName!, config.awsRegion);

export async function handler(event: SqsEvent): Promise<SqsBatchResponse> {
  const batchItemFailures: SqsBatchResponse["batchItemFailures"] = [];

  for (const record of event.Records) {
    try {
      const webhookEvent = JSON.parse(record.body) as DayaWebhookEvent;
      await processWebhookEvent(webhookEvent, store);
    } catch {
      batchItemFailures.push({
        itemIdentifier: record.messageId
      });
    }
  }

  return { batchItemFailures };
}
