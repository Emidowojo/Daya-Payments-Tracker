import { AppConfig } from "../config";
import { LocalQueue } from "./localQueue";
import { QueueClient } from "./queueClient";
import { SqsQueue } from "./sqsQueue";

export function createQueue(config: AppConfig): QueueClient {
  if (config.queueMode === "sqs") {
    if (!config.sqsQueueUrl) {
      throw new Error("SQS_QUEUE_URL is required when QUEUE_MODE=sqs");
    }

    return new SqsQueue(config.sqsQueueUrl, config.awsRegion);
  }

  return new LocalQueue(config.dataDir);
}
