/**
 * Shared types for the payments subsystem.
 */

export interface Product {
  id: string;
  name: string;
  description: string;
  priceUsd: number;
  status: "active" | "archived";
  squareCatalogId?: string;
  coinbaseChargeId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CheckoutResult {
  provider: "square" | "coinbase";
  checkoutUrl: string;
  chargeId: string;
  expiresAt?: string;
}

export interface SaleRecord {
  id: string;
  productId: string;
  productName: string;
  provider: "square" | "coinbase";
  amountUsd: number;
  currency: string;
  status: "pending" | "completed" | "refunded" | "failed";
  customerEmail?: string;
  transactionId: string;
  timestamp: string;
}

export interface DailySalesReport {
  date: string;
  totalRevenueFiat: number;
  totalRevenueCrypto: number;
  salesCount: number;
  byProduct: Array<{ productName: string; count: number; revenue: number }>;
  byProvider: { square: number; coinbase: number };
}

export interface SpendingLimits {
  dailyMaxUsd: number;
  singleTransactionMaxUsd: number;
  requireApprovalAboveUsd: number;
}
