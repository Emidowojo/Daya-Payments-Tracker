import { DeleteMessageCommand, PurgeQueueCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { DayaWebhookEvent, QueueMessage } from "../types";
import { QueueClient } from "./queueClient";

export class SqsQueue implements QueueClient {
  private readonly client: SQSClient;

  constructor(
    private readonly queueUrl: string,
    region: string
  ) {
    this.client = new SQSClient({ region });
  }

  async enqueue(event: DayaWebhookEvent): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(event)
      })
    );
  }

  async receive(maxMessages: number): Promise<QueueMessage[]> {
    const response = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: Math.min(maxMessages, 10),
        WaitTimeSeconds: 10
      })
    );

    return (response.Messages ?? []).map((message) => ({
      id: message.MessageId ?? crypto.randomUUID(),
      receiptHandle: message.ReceiptHandle,
      body: JSON.parse(message.Body ?? "{}") as DayaWebhookEvent
    }));
  }

  async complete(message: QueueMessage): Promise<void> {
    if (!message.receiptHandle) return;

    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: message.receiptHandle
      })
    );
  }

  async fail(_message: QueueMessage, _error: Error): Promise<void> {
    // Leave the message on SQS so visibility timeout and DLQ policy can handle retry.
  }

  async reset(): Promise<void> {
    try {
      await this.client.send(
        new PurgeQueueCommand({
          QueueUrl: this.queueUrl
        })
      );
    } catch (error) {
      if (error instanceof Error && error.name === "PurgeQueueInProgress") return;
      throw error;
    }
  }
}
