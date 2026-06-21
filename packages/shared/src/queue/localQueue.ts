import fs from "fs/promises";
import path from "path";
import { DayaWebhookEvent, QueueMessage } from "../types";
import { QueueClient } from "./queueClient";

export class LocalQueue implements QueueClient {
  private readonly pendingDir: string;
  private readonly processedDir: string;
  private readonly failedDir: string;

  constructor(dataDir: string) {
    const queueDir = path.join(dataDir, "queue");
    this.pendingDir = path.join(queueDir, "pending");
    this.processedDir = path.join(queueDir, "processed");
    this.failedDir = path.join(queueDir, "failed");
  }

  async enqueue(event: DayaWebhookEvent): Promise<void> {
    await this.ensureDirs();
    const fileName = `${Date.now()}-${event.id}.json`;
    await fs.writeFile(path.join(this.pendingDir, fileName), JSON.stringify(event, null, 2));
  }

  async receive(maxMessages: number): Promise<QueueMessage[]> {
    await this.ensureDirs();
    const files = (await fs.readdir(this.pendingDir)).sort().slice(0, maxMessages);

    const messages: QueueMessage[] = [];
    for (const file of files) {
      const filePath = path.join(this.pendingDir, file);
      const raw = await fs.readFile(filePath, "utf8");
      messages.push({
        id: file,
        receiptHandle: filePath,
        body: JSON.parse(raw) as DayaWebhookEvent
      });
    }

    return messages;
  }

  async complete(message: QueueMessage): Promise<void> {
    if (!message.receiptHandle) return;
    await this.ensureDirs();
    await fs.rename(message.receiptHandle, path.join(this.processedDir, message.id));
  }

  async fail(message: QueueMessage, error: Error): Promise<void> {
    if (!message.receiptHandle) return;
    await this.ensureDirs();
    const failedPath = path.join(this.failedDir, message.id);
    const payload = {
      failed_at: new Date().toISOString(),
      error: error.message,
      event: message.body
    };
    await fs.writeFile(`${failedPath}.error.json`, JSON.stringify(payload, null, 2));
    await fs.rename(message.receiptHandle, failedPath);
  }

  async reset(): Promise<void> {
    await fs.rm(path.dirname(this.pendingDir), { recursive: true, force: true });
    await this.ensureDirs();
  }

  private async ensureDirs(): Promise<void> {
    await fs.mkdir(this.pendingDir, { recursive: true });
    await fs.mkdir(this.processedDir, { recursive: true });
    await fs.mkdir(this.failedDir, { recursive: true });
  }
}
