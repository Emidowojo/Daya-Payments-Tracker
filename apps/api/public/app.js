const lastAction = document.querySelector("#lastAction");
const fundingAccountCount = document.querySelector("#fundingAccountCount");
const depositCount = document.querySelector("#depositCount");
const webhookCount = document.querySelector("#webhookCount");
const processedCount = document.querySelector("#processedCount");
const fundingAccountSelect = document.querySelector("#fundingAccountSelect");
const fundingAccountsTable = document.querySelector("#fundingAccountsTable");
const depositsTable = document.querySelector("#depositsTable");
const webhooksTable = document.querySelector("#webhooksTable");
const stateJson = document.querySelector("#stateJson");

const buttons = Array.from(document.querySelectorAll("button"));

function setBusy(isBusy) {
  buttons.forEach((button) => {
    button.disabled = isBusy;
  });
}

function setAction(message) {
  lastAction.textContent = message;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    },
    ...options
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed: ${response.status}`);
  }

  return payload;
}

function values(record) {
  return Object.values(record ?? {});
}

function shortId(id) {
  if (!id) return "-";
  if (id.length <= 18) return id;
  return `${id.slice(0, 10)}...${id.slice(-6)}`;
}

function paymentTypeLabel(rail) {
  if (rail === "CRYPTO_ADDRESS") return "Crypto address";
  if (rail === "NGN_VIRTUAL_ACCOUNT") return "Bank transfer";
  return rail ?? "-";
}

function instructionLabel(account) {
  const instruction = account.instructions?.[0] ?? {};
  if (account.rail === "CRYPTO_ADDRESS") {
    return `${instruction.address ?? "address pending"} / ${instruction.chain ?? account.chain ?? "-"}`;
  }

  return `${instruction.bank_name ?? "bank pending"} / ${instruction.account_number ?? "-"}`;
}

function amountLabel(deposit) {
  const unit = deposit.currency ?? deposit.asset ?? "";
  return `${deposit.amount ?? "-"} ${unit}`.trim();
}

function renderEmpty(rowTarget, columns, label) {
  rowTarget.innerHTML = `<tr><td class="empty" colspan="${columns}">${label}</td></tr>`;
}

function renderFundingAccounts(accounts) {
  fundingAccountSelect.innerHTML = "";

  if (accounts.length === 0) {
    fundingAccountSelect.innerHTML = '<option value="">Create payment details first</option>';
    renderEmpty(fundingAccountsTable, 5, "No payment accounts yet");
    return;
  }

  fundingAccountSelect.innerHTML = accounts
    .map((account) => {
      const label = `${paymentTypeLabel(account.rail)} - ${shortId(account.id)}`;
      return `<option value="${account.id}">${label}</option>`;
    })
    .join("");

  fundingAccountsTable.innerHTML = accounts
    .map(
      (account) => `
        <tr>
          <td title="${account.id}">${shortId(account.id)}</td>
          <td><span class="tag ${account.rail === "CRYPTO_ADDRESS" ? "blue" : ""}">${paymentTypeLabel(account.rail)}</span></td>
          <td>${account.customer_id ?? "-"}</td>
          <td>${account.status ?? "-"}</td>
          <td>${instructionLabel(account)}</td>
        </tr>
      `
    )
    .join("");
}

function renderDeposits(deposits) {
  if (deposits.length === 0) {
    renderEmpty(depositsTable, 5, "No deposits yet");
    return;
  }

  depositsTable.innerHTML = deposits
    .map(
      (deposit) => `
        <tr>
          <td title="${deposit.id}">${shortId(deposit.id)}</td>
          <td title="${deposit.funding_account_id ?? ""}">${shortId(deposit.funding_account_id)}</td>
          <td>${amountLabel(deposit)}</td>
          <td>${deposit.status ?? "-"}</td>
          <td>${deposit.settlement_status ?? deposit.settlement_mode ?? "-"}</td>
        </tr>
      `
    )
    .join("");
}

function renderWebhooks(webhooks) {
  if (webhooks.length === 0) {
    renderEmpty(webhooksTable, 3, "No webhook events yet");
    return;
  }

  webhooksTable.innerHTML = webhooks
    .map(
      (event) => `
        <tr>
          <td title="${event.id}">${shortId(event.id)}</td>
          <td>${event.event}</td>
          <td><span class="tag ${event.status === "processed" ? "" : "amber"}">${event.status}</span></td>
        </tr>
      `
    )
    .join("");
}

function renderState(state) {
  const fundingAccounts = values(state.funding_accounts).sort((left, right) =>
    right.created_at.localeCompare(left.created_at)
  );
  const deposits = values(state.deposits).sort((left, right) =>
    (right.created_at ?? "").localeCompare(left.created_at ?? "")
  );
  const webhooks = values(state.webhook_events).sort((left, right) =>
    right.received_at.localeCompare(left.received_at)
  );
  const processed = webhooks.filter((event) => event.status === "processed");

  fundingAccountCount.textContent = fundingAccounts.length;
  depositCount.textContent = deposits.length;
  webhookCount.textContent = webhooks.length;
  processedCount.textContent = processed.length;

  renderFundingAccounts(fundingAccounts);
  renderDeposits(deposits);
  renderWebhooks(webhooks);
  stateJson.textContent = JSON.stringify(state, null, 2);
}

async function refresh() {
  const health = await request("/health");
  const state = await request("/records");
  if (!health.ok) throw new Error("Unable to load payments");
  renderState(state);
}

async function runAction(message, callback) {
  setBusy(true);
  try {
    await callback();
    await refresh();
    setAction(message);
  } catch (error) {
    setAction(error instanceof Error ? error.message : String(error));
  } finally {
    setBusy(false);
  }
}

document.querySelector("#refreshBtn").addEventListener("click", () => {
  runAction("State refreshed", async () => refresh());
});

document.querySelector("#ngnForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  runAction("Bank details created", async () => {
    await request("/payment-accounts/bank", {
      method: "POST",
      body: JSON.stringify({
        customer_id: form.get("customer_id"),
        amount: Number(form.get("amount"))
      })
    });
  });
});

document.querySelector("#cryptoForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  runAction("Crypto address created", async () => {
    await request("/payment-accounts/crypto", {
      method: "POST",
      body: JSON.stringify({
        customer_id: form.get("customer_id"),
        asset: form.get("asset"),
        chain: form.get("chain")
      })
    });
  });
});

document.querySelector("#depositForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  runAction("Test payment sent", async () => {
    await request("/payments/test", {
      method: "POST",
      body: JSON.stringify({
        funding_account_id: form.get("funding_account_id") || undefined,
        amount: form.get("amount")
      })
    });
  });
});

document.querySelector("#processBtn").addEventListener("click", () => {
  runAction("Payment confirmed", async () => {
    await request("/payments/confirm", {
      method: "POST",
      body: "{}"
    });
  });
});

document.querySelector("#resetBtn").addEventListener("click", () => {
  runAction("Cleared", async () => {
    await request("/records/clear", {
      method: "POST",
      body: "{}"
    });
  });
});

refresh().catch((error) => {
  setAction(error instanceof Error ? error.message : String(error));
});
