/**
 * Sales ledger — append-only transaction log.
 *
 * Every sale is recorded here and never deleted.
 * Pattern matches the security log philosophy: immutable audit trail.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve } from "path";
import { env } from "../config/env.js";
import { logSecurity } from "../security/audit-log.js";
import type { SaleRecord, DailySalesReport } from "./types.js";

const LEDGER_PATH = resolve(env.ELDERBOT_HOME, "logs", "sales-ledger.json");

let cache: SaleRecord[] | null = null;

async function load(): Promise<SaleRecord[]> {
  if (cache) return cache;
  try {
    const raw = await readFile(LEDGER_PATH, "utf8");
    cache = JSON.parse(raw) as SaleRecord[];
  } catch {
    cache = [];
  }
  return cache;
}

async function save(records: SaleRecord[]): Promise<void> {
  const dir = resolve(env.ELDERBOT_HOME, "logs");
  await mkdir(dir, { recursive: true });
  await writeFile(LEDGER_PATH, JSON.stringify(records, null, 2), "utf8");
  cache = records;
}

/** Record a new sale (append-only) */
export async function recordSale(sale: SaleRecord): Promise<void> {
  const records = await load();
  records.push(sale);
  await save(records);

  logSecurity("COMMAND_EXECUTED", `Sale recorded: $${sale.amountUsd} via ${sale.provider}`, {
    productId: sale.productId,
    transactionId: sale.transactionId,
    provider: sale.provider,
    status: sale.status,
  });
}

/** Get sales for a specific date (YYYY-MM-DD) */
export async function getSalesForDate(date: string): Promise<SaleRecord[]> {
  const records = await load();
  return records.filter((r) => r.timestamp.startsWith(date));
}

/** Get sales for a date range */
export async function getSalesForRange(
  from: string,
  to: string
): Promise<SaleRecord[]> {
  const records = await load();
  return records.filter((r) => r.timestamp >= from && r.timestamp <= to + "T23:59:59");
}

/** Get today's sales */
export async function getTodaySales(): Promise<SaleRecord[]> {
  const today = new Date().toISOString().split("T")[0];
  return getSalesForDate(today);
}

/** Get all completed sales */
export async function getAllCompletedSales(): Promise<SaleRecord[]> {
  const records = await load();
  return records.filter((r) => r.status === "completed");
}

/** Build a daily summary */
export async function getDailySummary(date?: string): Promise<DailySalesReport> {
  const targetDate = date ?? new Date().toISOString().split("T")[0];
  const sales = await getSalesForDate(targetDate);
  const completed = sales.filter((s) => s.status === "completed");

  // Aggregate by product
  const productMap = new Map<string, { count: number; revenue: number }>();
  for (const sale of completed) {
    const existing = productMap.get(sale.productName) ?? { count: 0, revenue: 0 };
    existing.count += 1;
    existing.revenue += sale.amountUsd;
    productMap.set(sale.productName, existing);
  }

  // Aggregate by provider
  let squareTotal = 0;
  let coinbaseTotal = 0;
  for (const sale of completed) {
    if (sale.provider === "square") squareTotal += sale.amountUsd;
    else coinbaseTotal += sale.amountUsd;
  }

  return {
    date: targetDate,
    totalRevenueFiat: squareTotal,
    totalRevenueCrypto: coinbaseTotal,
    salesCount: completed.length,
    byProduct: Array.from(productMap.entries()).map(([productName, data]) => ({
      productName,
      ...data,
    })),
    byProvider: { square: squareTotal, coinbase: coinbaseTotal },
  };
}
