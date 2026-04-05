/**
 * Sales reporting — formatted summaries for Telegram and cron.
 */

import { getDailySummary, getAllCompletedSales } from "./sales-ledger.js";
import { formatGuardrailStatus } from "./guardrails.js";
import type { SaleRecord } from "./types.js";
import { isSquareConfigured } from "./square.js";
import { isCoinbaseConfigured } from "./coinbase.js";

/** Generate a daily sales report */
export async function generateDailyReport(date?: string): Promise<string> {
  const summary = await getDailySummary(date);

  if (summary.salesCount === 0) {
    return [
      `Sales Report — ${summary.date}`,
      "---",
      "No sales recorded today.",
      "",
      await formatGuardrailStatus(),
    ].join("\n");
  }

  const lines = [
    `Sales Report — ${summary.date}`,
    "---",
    `Total Sales: ${summary.salesCount}`,
    `Revenue (Card): $${summary.totalRevenueFiat.toFixed(2)}`,
    `Revenue (Crypto): $${summary.totalRevenueCrypto.toFixed(2)}`,
    `Total Revenue: $${(summary.totalRevenueFiat + summary.totalRevenueCrypto).toFixed(2)}`,
    "",
  ];

  if (summary.byProduct.length > 0) {
    lines.push("By Product:");
    for (const p of summary.byProduct) {
      lines.push(`  ${p.productName}: ${p.count} sales — $${p.revenue.toFixed(2)}`);
    }
    lines.push("");
  }

  lines.push("By Provider:");
  lines.push(`  Square: $${summary.byProvider.square.toFixed(2)}`);
  lines.push(`  Coinbase: $${summary.byProvider.coinbase.toFixed(2)}`);

  return lines.join("\n");
}

/** Generate an all-time revenue summary */
export async function generateRevenueSummary(): Promise<string> {
  const allSales = await getAllCompletedSales();

  const totalRevenue = allSales.reduce((sum, s) => sum + s.amountUsd, 0);
  const totalSales = allSales.length;

  // This month
  const thisMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
  const monthSales = allSales.filter((s) => s.timestamp.startsWith(thisMonth));
  const monthRevenue = monthSales.reduce((sum, s) => sum + s.amountUsd, 0);

  // By provider
  const squareRevenue = allSales
    .filter((s) => s.provider === "square")
    .reduce((sum, s) => sum + s.amountUsd, 0);
  const coinbaseRevenue = allSales
    .filter((s) => s.provider === "coinbase")
    .reduce((sum, s) => sum + s.amountUsd, 0);

  const guardrails = await formatGuardrailStatus();

  const providerStatus = [
    `Square: ${isSquareConfigured() ? "Connected" : "Not configured"}`,
    `Coinbase Commerce: ${isCoinbaseConfigured() ? "Connected" : "Not configured"}`,
  ].join("\n  ");

  return [
    "Elderbot Revenue Dashboard",
    "===",
    "",
    `All-Time Revenue: $${totalRevenue.toFixed(2)} (${totalSales} sales)`,
    `This Month: $${monthRevenue.toFixed(2)} (${monthSales.length} sales)`,
    "",
    "By Provider:",
    `  Square (Card): $${squareRevenue.toFixed(2)}`,
    `  Coinbase (Crypto): $${coinbaseRevenue.toFixed(2)}`,
    "",
    `Payment Providers:`,
    `  ${providerStatus}`,
    "",
    guardrails,
  ].join("\n");
}

/** Format a single sale notification */
export function formatSaleNotification(sale: SaleRecord): string {
  const provider = sale.provider === "square" ? "Card" : "Crypto";
  return [
    `New Sale!`,
    `Product: ${sale.productName}`,
    `Amount: $${sale.amountUsd.toFixed(2)} (${provider})`,
    `Status: ${sale.status}`,
    `Time: ${new Date(sale.timestamp).toLocaleString()}`,
  ].join("\n");
}
