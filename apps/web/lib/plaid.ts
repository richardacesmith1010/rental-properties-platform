import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  DepositoryAccountSubtype
} from "plaid";

type PlaidEnv = "sandbox" | "development" | "production";

interface PlaidAccountSummary {
  accountId: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
}

function getPlaidEnvironment(env: string): string {
  if (env === "development" || env === "production" || env === "sandbox") {
    return PlaidEnvironments[env as PlaidEnv];
  }

  return PlaidEnvironments.sandbox;
}

function getPlaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV ?? "sandbox";

  if (!clientId || !secret) {
    throw new Error("Plaid credentials not configured");
  }

  const config = new Configuration({
    basePath: getPlaidEnvironment(env),
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret
      }
    }
  });

  return new PlaidApi(config);
}

export function validRedirectUri(value: string, platform: "web" | "ios" = "web"): boolean {
  if (platform === "ios") return value === "https://domusbase.com/owner/bank/oauth-app";
  try {
    const url = new URL(value);
    const allowedHost = (url.protocol === "https:" && url.hostname === "domusbase.com" && !url.port
      && /^https:\/\/domusbase\.com\//i.test(value))
      || (url.protocol === "http:" && url.hostname === "localhost");
    return allowedHost && url.pathname === "/owner/bank/oauth" && !url.username && !url.password
      && !url.search && !url.hash && !/[?#*\s\\]/.test(value);
  } catch { return false; }
}

export async function createLinkToken(input: {
  userId: string; mode: "create" | "update"; accessToken?: string; platform?: "web" | "ios";
}): Promise<{ linkToken: string }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || (input.mode === "update" && !input.accessToken)) {
    throw new Error("Bank connection is not set up yet.");
  }
  const platform = input.platform ?? "web";
  const redirectUri = platform === "ios" ? process.env.PLAID_REDIRECT_URI_IOS : process.env.PLAID_REDIRECT_URI;
  const redirectValid = redirectUri ? validRedirectUri(redirectUri, platform) : false;
  if (!redirectValid && (redirectUri || platform === "ios")) console.error("plaid_redirect_uri_invalid");
  if (platform === "ios" && !redirectValid) throw new Error("Bank connection is not set up yet.");
  const client = getPlaidClient();
  const response = await client.linkTokenCreate({
    user: {
      client_user_id: input.userId
    },
    client_name: "Domus",
    ...(input.mode === "create" ? {
      products: [Products.Transactions],
      transactions: { days_requested: 90 },
      account_filters: { depository: { account_subtypes: [
        DepositoryAccountSubtype.Checking, DepositoryAccountSubtype.Savings,
        DepositoryAccountSubtype.CashManagement
      ] } }
    } : { access_token: input.accessToken }),
    webhook: `${appUrl.replace(/\/$/, "")}/api/webhooks/plaid`,
    ...(redirectValid ? { redirect_uri: redirectUri } : {}),
    country_codes: [CountryCode.Us],
    language: "en"
  });

  return { linkToken: response.data.link_token };
}

export async function exchangePublicToken(
  publicToken: string
): Promise<{ accessToken: string; itemId: string }> {
  const client = getPlaidClient();
  const response = await client.itemPublicTokenExchange({ public_token: publicToken });

  return {
    accessToken: response.data.access_token,
    itemId: response.data.item_id
  };
}

export async function getAccounts(accessToken: string): Promise<PlaidAccountSummary[]> {
  const client = getPlaidClient();
  const response = await client.accountsGet({ access_token: accessToken });

  return (response.data.accounts ?? []).map((account) => ({
    accountId: account.account_id,
    name: account.name,
    mask: account.mask ?? null,
    type: account.type,
    subtype: account.subtype ?? null
  }));
}

export async function getAccountsSnapshot(accessToken: string) {
  const response = await getPlaidClient().accountsGet({ access_token: accessToken });
  return response.data;
}

export async function getInstitutionName(accessToken: string): Promise<string> {
  const client = getPlaidClient();
  const item = await client.itemGet({ access_token: accessToken });
  const institutionId = item.data.item.institution_id;
  if (!institutionId) throw new Error("Plaid item has no institution.");
  const institution = await client.institutionsGetById({ institution_id: institutionId,
    country_codes: [CountryCode.Us] });
  return institution.data.institution.name;
}

export class LeaseLost extends Error {
  constructor() { super("Bank sync lease lost."); }
}

function plaidCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = error as { response?: { data?: { error_code?: string } }; error_code?: string };
  return value.response?.data?.error_code ?? value.error_code;
}

export async function syncTransactions(accessToken: string, originalCursor: string | null,
  options: { onPage: () => Promise<void> }) {
  const client = getPlaidClient();
  let cursor = originalCursor;
  let added: Awaited<ReturnType<typeof client.transactionsSync>>["data"]["added"] = [];
  let modified: typeof added = [];
  let removed: Awaited<ReturnType<typeof client.transactionsSync>>["data"]["removed"] = [];
  let pages = 0;
  let restarts = 0;
  for (;;) {
    if (++pages > 50) throw new Error("Bank sync exceeded page limit.");
    await options.onPage();
    let response: Awaited<ReturnType<typeof client.transactionsSync>> | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await client.transactionsSync({ access_token: accessToken, cursor: cursor || undefined, count: 500 });
        break;
      } catch (error) {
        const code = plaidCode(error);
        if (code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") {
          if (++restarts > 3) throw error;
          cursor = originalCursor; added = []; modified = []; removed = [];
          response = undefined;
          break;
        }
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (attempt === 2 || (status !== 429 && !(status && status >= 500)
          && code !== "RATE_LIMIT_EXCEEDED")) throw error;
        await new Promise((resolve) => setTimeout(resolve, [500, 2000, 5000][attempt]));
      }
    }
    if (!response) continue;
    added.push(...response.data.added);
    modified.push(...response.data.modified);
    removed.push(...response.data.removed);
    cursor = response.data.next_cursor;
    if (!response.data.has_more) return { added, modified, removed, nextCursor: cursor };
  }
}

export async function removeItem(accessToken: string): Promise<void> {
  await getPlaidClient().itemRemove({ access_token: accessToken });
}

export async function getWebhookVerificationKey(keyId: string) {
  const result = await getPlaidClient().webhookVerificationKeyGet({ key_id: keyId });
  return result.data.key;
}

export async function getBalances(
  accessToken: string,
  accountId: string
): Promise<{ currentCents: number; availableCents: number | null }> {
  const client = getPlaidClient();
  const response = await client.accountsBalanceGet({ access_token: accessToken });
  const account = (response.data.accounts ?? []).find((candidate) => candidate.account_id === accountId);

  if (!account) {
    throw new Error("Selected Plaid account was not found.");
  }

  const current = account.balances.current;
  const available = account.balances.available;

  return {
    currentCents: Math.round((typeof current === "number" ? current : 0) * 100),
    availableCents: typeof available === "number" ? Math.round(available * 100) : null
  };
}
