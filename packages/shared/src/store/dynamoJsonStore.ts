import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ScanCommand
} from "@aws-sdk/client-dynamodb";
import { AppState, Deposit, FundingAccount, Transfer, WebhookEventRecord, Withdrawal } from "../types";
import { StateStore } from "./stateStore";

type EntityType = "funding_account" | "deposit" | "transfer" | "withdrawal" | "webhook_event";

const emptyState = (): AppState => ({
  funding_accounts: {},
  deposits: {},
  transfers: {},
  withdrawals: {},
  webhook_events: {}
});

export class DynamoJsonStore implements StateStore {
  private readonly client: DynamoDBClient;

  constructor(
    private readonly tableName: string,
    region: string
  ) {
    this.client = new DynamoDBClient({ region });
  }

  async getState(): Promise<AppState> {
    const state = emptyState();
    const response = await this.client.send(
      new ScanCommand({
        TableName: this.tableName
      })
    );

    for (const item of response.Items ?? []) {
      const type = item.pk?.S as EntityType | undefined;
      const parsed = this.parseValue<unknown>(item.valueJson?.S);
      if (!type || !parsed) continue;

      if (type === "funding_account") {
        const value = parsed as FundingAccount;
        state.funding_accounts[value.id] = value;
      } else if (type === "deposit") {
        const value = parsed as Deposit;
        state.deposits[value.id] = value;
      } else if (type === "transfer") {
        const value = parsed as Transfer;
        state.transfers[value.id] = value;
      } else if (type === "withdrawal") {
        const value = parsed as Withdrawal;
        state.withdrawals[value.id] = value;
      } else if (type === "webhook_event") {
        const value = parsed as WebhookEventRecord;
        state.webhook_events[value.id] = value;
      }
    }

    return state;
  }

  async hasProcessedWebhook(id: string): Promise<boolean> {
    const record = await this.getEntity<WebhookEventRecord>("webhook_event", id);
    return record?.status === "processed";
  }

  async upsertWebhook(record: WebhookEventRecord): Promise<void> {
    const current = await this.getEntity<WebhookEventRecord>("webhook_event", record.id);
    const attempts =
      record.status === "received"
        ? (current?.attempts ?? 0) + 1
        : (current?.attempts ?? record.attempts);

    await this.putEntity("webhook_event", record.id, {
      ...current,
      ...record,
      attempts
    });
  }

  async upsertFundingAccount(account: FundingAccount): Promise<void> {
    await this.putEntity("funding_account", account.id, account);
  }

  async upsertDeposit(deposit: Deposit): Promise<void> {
    await this.putEntity("deposit", deposit.id, deposit);
  }

  async upsertTransfer(transfer: Transfer): Promise<void> {
    await this.putEntity("transfer", transfer.id, transfer);
  }

  async upsertWithdrawal(withdrawal: Withdrawal): Promise<void> {
    await this.putEntity("withdrawal", withdrawal.id, withdrawal);
  }

  async reset(): Promise<void> {
    const response = await this.client.send(
      new ScanCommand({
        TableName: this.tableName,
        ProjectionExpression: "pk, sk"
      })
    );

    for (const item of response.Items ?? []) {
      const pk = item.pk?.S;
      const sk = item.sk?.S;
      if (!pk || !sk) continue;

      await this.client.send(
        new DeleteItemCommand({
          TableName: this.tableName,
          Key: {
            pk: { S: pk },
            sk: { S: sk }
          }
        })
      );
    }
  }

  private async getEntity<T>(type: EntityType, id: string): Promise<T | undefined> {
    const response = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: {
          pk: { S: type },
          sk: { S: id }
        }
      })
    );

    return this.parseValue<T>(response.Item?.valueJson?.S);
  }

  private async putEntity<T>(type: EntityType, id: string, value: T): Promise<void> {
    await this.client.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: {
          pk: { S: type },
          sk: { S: id },
          valueJson: { S: JSON.stringify(value) }
        }
      })
    );
  }

  private parseValue<T>(value: string | undefined): T | undefined {
    if (!value) return undefined;
    return JSON.parse(value) as T;
  }
}
