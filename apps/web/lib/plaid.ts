import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode
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

export async function createLinkToken(userId: string): Promise<{ linkToken: string }> {
  const client = getPlaidClient();
  const response = await client.linkTokenCreate({
    user: {
      client_user_id: userId
    },
    client_name: "Domus",
    products: [Products.Auth, Products.Transactions],
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
