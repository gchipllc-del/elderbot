/**
 * Coinbase Commerce integration (crypto payments).
 *
 * Uses Coinbase Commerce API v2 directly with fetch.
 * Accepts BTC, ETH, USDC, SOL, and more.
 */

import { env } from "../config/env.js";
import { logSecurity } from "../security/audit-log.js";
import type { Product, CheckoutResult, SaleRecord } from "./types.js";

const BASE_URL = "https://api.commerce.coinbase.com";

export function isCoinbaseConfigured(): boolean {
  return !!env.COINBASE_COMMERCE_API_KEY;
}

async function coinbaseFetch(
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>
): Promise<unknown> {
  const url = `${BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      "X-CC-Api-Key": env.COINBASE_COMMERCE_API_KEY,
      "X-CC-Version": "2018-03-22",
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errText = await response.text();
    logSecurity("COMMAND_EXECUTED", `Coinbase Commerce error ${response.status}`, {
      endpoint,
      error: errText.substring(0, 200),
    });
    throw new Error(`Coinbase Commerce error (${response.status}): ${errText.substring(0, 150)}`);
  }

  return response.json();
}

/** Create a crypto payment charge for a product */
export async function createCoinbaseCharge(product: Product): Promise<CheckoutResult> {
  if (!isCoinbaseConfigured()) {
    throw new Error("Coinbase Commerce not configured. Add COINBASE_COMMERCE_API_KEY to secrets.");
  }

  const result = await coinbaseFetch("/charges", "POST", {
    name: product.name,
    description: product.description,
    pricing_type: "fixed_price",
    local_price: {
      amount: product.priceUsd.toFixed(2),
      currency: "USD",
    },
    metadata: {
      product_id: product.id,
      source: "elderbot",
    },
  }) as {
    data?: {
      id?: string;
      hosted_url?: string;
      expires_at?: string;
      code?: string;
    };
  };

  const charge = result.data;
  if (!charge?.hosted_url) throw new Error("Coinbase returned no checkout URL");

  logSecurity("COMMAND_EXECUTED", `Coinbase charge created for ${product.name}`, {
    productId: product.id,
    chargeId: charge.id ?? "unknown",
  });

  return {
    provider: "coinbase",
    checkoutUrl: charge.hosted_url,
    chargeId: charge.id ?? charge.code ?? "unknown",
    expiresAt: charge.expires_at,
  };
}

/** Get status of a specific charge */
export async function getCoinbaseCharge(chargeId: string): Promise<SaleRecord | null> {
  if (!isCoinbaseConfigured()) return null;

  try {
    const result = await coinbaseFetch(`/charges/${chargeId}`) as {
      data?: {
        id: string;
        name: string;
        pricing?: { local?: { amount: string; currency: string } };
        timeline?: Array<{ status: string; time: string }>;
        metadata?: { product_id?: string };
        created_at: string;
      };
    };

    const charge = result.data;
    if (!charge) return null;

    const lastStatus = charge.timeline?.[charge.timeline.length - 1]?.status ?? "NEW";

    const statusMap: Record<string, SaleRecord["status"]> = {
      NEW: "pending",
      PENDING: "pending",
      COMPLETED: "completed",
      RESOLVED: "completed",
      EXPIRED: "failed",
      CANCELED: "failed",
      UNRESOLVED: "pending",
    };

    return {
      id: `cb-${charge.id}`,
      productId: charge.metadata?.product_id ?? "unknown",
      productName: charge.name,
      provider: "coinbase",
      amountUsd: parseFloat(charge.pricing?.local?.amount ?? "0"),
      currency: charge.pricing?.local?.currency ?? "USD",
      status: statusMap[lastStatus] ?? "pending",
      transactionId: charge.id,
      timestamp: charge.created_at,
    };
  } catch {
    return null;
  }
}

/** List recent charges */
export async function listCoinbaseCharges(): Promise<SaleRecord[]> {
  if (!isCoinbaseConfigured()) return [];

  try {
    const result = await coinbaseFetch("/charges") as {
      data?: Array<{
        id: string;
        name: string;
        pricing?: { local?: { amount: string; currency: string } };
        timeline?: Array<{ status: string }>;
        metadata?: { product_id?: string };
        created_at: string;
      }>;
    };

    return (result.data ?? []).map((c) => {
      const lastStatus = c.timeline?.[c.timeline.length - 1]?.status ?? "NEW";
      const statusMap: Record<string, SaleRecord["status"]> = {
        NEW: "pending",
        PENDING: "pending",
        COMPLETED: "completed",
        RESOLVED: "completed",
        EXPIRED: "failed",
        CANCELED: "failed",
      };

      return {
        id: `cb-${c.id}`,
        productId: c.metadata?.product_id ?? "unknown",
        productName: c.name,
        provider: "coinbase" as const,
        amountUsd: parseFloat(c.pricing?.local?.amount ?? "0"),
        currency: c.pricing?.local?.currency ?? "USD",
        status: statusMap[lastStatus] ?? ("pending" as const),
        transactionId: c.id,
        timestamp: c.created_at,
      };
    });
  } catch {
    return [];
  }
}
