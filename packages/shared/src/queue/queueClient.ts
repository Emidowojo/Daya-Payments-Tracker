import { DayaWebhookEvent, QueueMessage } from "../types";

export interface QueueClient {
  enqueue(event: DayaWebhookEvent): Promise<void>;
  receive(maxMessages: number): Promise<QueueMessage[]>;
  complete(message: QueueMessage): Promise<void>;
  fail(message: QueueMessage, error: Error): Promise<void>;
  reset?(): Promise<void>;
}
