import fs from "fs/promises";
import path from "path";
import { AppState, Deposit, FundingAccount, Transfer, WebhookEventRecord, Withdrawal } from "../types";
import { StateStore } from "./stateStore";

const emptyState = (): AppState => ({
  funding_accounts: {},
  deposits: {},
  transfers: {},
  withdrawals: {},
  webhook_events: {}
});

export class LocalStore implements StateStore {
  private readonly statePath: string;

  constructor(dataDir: string) {
    this.statePath = path.join(dataDir, "state.json");
  }

  async getState(): Promise<AppState> {
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });

    try {
      const raw = await fs.readFile(this.statePath, "utf8");
      return JSON.parse(raw) as AppState;
    } catch (error) {
      const initial = emptyState();
      await this.saveState(initial);
      return initial;
    }
  }

  async saveState(state: AppState): Promise<void> {
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    await fs.writeFile(this.statePath, JSON.stringify(state, null, 2));
  }

  async hasProcessedWebhook(id: string): Promise<boolean> {
    const state = await this.getState();
    const record = state.webhook_events[id];
    return record?.status === "processed";
  }

  async upsertWebhook(record: WebhookEventRecord): Promise<void> {
    const state = await this.getState();
    const current = state.webhook_events[record.id];
    const attempts =
      record.status === "received"
        ? (current?.attempts ?? 0) + 1
        : (current?.attempts ?? record.attempts);

    state.webhook_events[record.id] = {
      ...current,
      ...record,
      attempts
    };

    await this.saveState(state);
  }

  async upsertFundingAccount(account: FundingAccount): Promise<void> {
    const state = await this.getState();
    state.funding_accounts[account.id] = account;
    await this.saveState(state);
  }

  async upsertDeposit(deposit: Deposit): Promise<void> {
    const state = await this.getState();
    state.deposits[deposit.id] = deposit;
    await this.saveState(state);
  }

  async upsertTransfer(transfer: Transfer): Promise<void> {
    const state = await this.getState();
    state.transfers[transfer.id] = transfer;
    await this.saveState(state);
  }

  async upsertWithdrawal(withdrawal: Withdrawal): Promise<void> {
    const state = await this.getState();
    state.withdrawals[withdrawal.id] = withdrawal;
    await this.saveState(state);
  }

  async reset(): Promise<void> {
    await this.saveState(emptyState());
  }
}
