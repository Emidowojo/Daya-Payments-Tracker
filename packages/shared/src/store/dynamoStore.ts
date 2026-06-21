import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { AppState, Deposit, FundingAccount, Transfer, WebhookEventRecord, Withdrawal } from "../types";
import { StateStore } from "./stateStore";

type EntityType = "funding_account" | "deposit" | "transfer" | "withdrawal" | "webhook_event";

interface StoredEntity<T> {
  pk: EntityType;
  sk: string;
  value: T;
}

const emptyState = (): AppState => ({
  funding_accounts: {},
  deposits: {},
  transfers: {},
  withdrawals: {},
  webhook_events: {}
});

export class DynamoStore implements StateStore {
  private readonly documentClient: DynamoDBDocumentClient;

  constructor(
    private readonly tableName: string,
    region: string
  ) {
    this.documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  }

  async getState(): Promise<AppState> {
    const state = emptyState();
    const response = await this.documentClient.send(
      new ScanCommand({
        TableName: this.tableName
      })
    );

    for (const item of response.Items ?? []) {
      const entity = item as StoredEntity<unknown>;

      if (entity.pk === "funding_account") {
        const value = entity.value as FundingAccount;
        state.funding_accounts[value.id] = value;
      } else if (entity.pk === "deposit") {
        const value = entity.value as Deposit;
        state.deposits[value.id] = value;
      } else if (entity.pk === "transfer") {
        const value = entity.value as Transfer;
        state.transfers[value.id] = value;
      } else if (entity.pk === "withdrawal") {
        const value = entity.value as Withdrawal;
        state.withdrawals[value.id] = value;
      } else if (entity.pk === "webhook_event") {
        const value = entity.value as WebhookEventRecord;
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
    const response = await this.documentClient.send(
      new ScanCommand({
        TableName: this.tableName,
        ProjectionExpression: "pk, sk"
      })
    );

    for (const item of response.Items ?? []) {
      await this.documentClient.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: {
            pk: item.pk,
            sk: item.sk
          }
        })
      );
    }
  }

  private async getEntity<T>(type: EntityType, id: string): Promise<T | undefined> {
    const response = await this.documentClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          pk: type,
          sk: id
        }
      })
    );

    return response.Item?.value as T | undefined;
  }

  private async putEntity<T>(type: EntityType, id: string, value: T): Promise<void> {
    await this.documentClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: type,
          sk: id,
          value
        }
      })
    );
  }
}
