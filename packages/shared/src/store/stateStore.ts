import { AppState, Deposit, FundingAccount, Transfer, WebhookEventRecord, Withdrawal } from "../types";

export interface StateStore {
  getState(): Promise<AppState>;
  hasProcessedWebhook(id: string): Promise<boolean>;
  upsertWebhook(record: WebhookEventRecord): Promise<void>;
  upsertFundingAccount(account: FundingAccount): Promise<void>;
  upsertDeposit(deposit: Deposit): Promise<void>;
  upsertTransfer(transfer: Transfer): Promise<void>;
  upsertWithdrawal(withdrawal: Withdrawal): Promise<void>;
  reset(): Promise<void>;
}
