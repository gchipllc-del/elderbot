/**
 * Square payment integration (fiat).
 *
 * Uses Square REST API directly with fetch (no heavy SDK).
 * Supports sandbox and production environments.
 */

import { env } from "../config/env.js";
import { logSecurity } from "../security/audit-log.js";
import type { Product, CheckoutResult, SaleRecord } from "./types.js";

const SANDBOX_BASE = "https://connect.squareupsandbox.com/v2";
const PRODUCTION_BASE = "https://connect.squareup.com/v2";

function getBaseUrl(): string {
  return env.SQUARE_ENVIRONMENT === "production" ? PRODUCTION_BASE : SANDBOX_BASE;
}

export function isSquareConfigured(): boolean {
  return !!(env.SQUARE_ACCESS_TOKEN && env.SQUARE_LOCATION_ID);
}

async function squareFetch(
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>
): Promise<unknown> {
  const url = `${getBaseUrl()}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Square-Version": "2024-12-18",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errText = await response.text();
    logSecurity("COMMAND_EXECUTED", `Square API error ${response.status}`, {
      endpoint,
      error: errText.substring(0, 200),
    });
    throw new Error(`Square API error (${response.status}): ${errText.substring(0, 150)}`);
  }

  return response.json();
}

/** Create a checkout payment link for a product */
export async function createSquareCheckout(product: Product): Promise<CheckoutResult> {
  if (!isSquareConfigured()) {
    throw new Error("Square not configured. Add SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID to secrets.");
  }

  const idempotencyKey = `elder-${product.id}-${Date.now()}`;

  const result = await squareFetch("/online-checkout/payment-links", "POST", {
    idempotency_key: idempotencyKey,
    quick_pay: {
      name: product.name,
      price_money: {
        amount: Math.round(product.priceUsd * 100), // cents
        currency: "USD",
      },
      location_id: env.SQUARE_LOCATION_ID,
    },
  }) as {
    payment_link?: { url?: string; id?: string; created_at?: string };
  };

  const link = result.payment_link;
  if (!link?.url) throw new Error("Square returned no checkout URL");

  logSecurity("COMMAND_EXECUTED", `Square checkout created for ${product.name}`, {
    productId: product.id,
    linkId: link.id ?? "unknown",
  });

  return {
    provider: "square",
    checkoutUrl: link.url,
    chargeId: link.id ?? idempotencyKey,
  };
}

/** List recent payments from Square */
export async function listSquarePayments(
  beginTime?: string,
  endTime?: string
): Promise<SaleRecord[]> {
  if (!isSquareConfigured()) return [];

  const params = new URLSearchParams({ location_id: env.SQUARE_LOCATION_ID });
  if (beginTime) params.set("begin_time", beginTime);
  if (endTime) params.set("end_time", endTime);

  try {
    const result = await squareFetch(`/payments?${params.toString()}`) as {
      payments?: Array<{
        id: string;
        amount_money?: { amount: number; currency: string };
        status: string;
        created_at: string;
        note?: string;
        receipt_email?: string;
      }>;
    };

    return (result.payments ?? []).map((p) => ({
      id: `sq-${p.id}`,
      productId: "unknown",
      productName: p.note ?? "Square Payment",
      provider: "square" as const,
      amountUsd: (p.amount_money?.amount ?? 0) / 100,
      currency: p.amount_money?.currency ?? "USD",
      status: p.status === "COMPLETED" ? "completed" as const : "pending" as const,
      customerEmail: p.receipt_email,
      transactionId: p.id,
      timestamp: p.created_at,
    }));
  } catch {
    return [];
  }
}
