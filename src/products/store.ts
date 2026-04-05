/**
 * Product catalog — local JSON store.
 *
 * Manages digital products that Elderbot can sell.
 * Pattern follows sessions.ts / registry.ts (JSON on disk, in-memory cache).
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve } from "path";
import { env } from "../config/env.js";
import { logSecurity } from "../security/audit-log.js";
import type { Product } from "../payments/types.js";

const STORE_PATH = resolve(env.ELDERBOT_HOME, "config", "products.json");

let cache: Product[] | null = null;

async function load(): Promise<Product[]> {
  if (cache) return cache;
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    cache = JSON.parse(raw) as Product[];
  } catch {
    cache = [];
  }
  return cache;
}

async function save(products: Product[]): Promise<void> {
  const dir = resolve(env.ELDERBOT_HOME, "config");
  await mkdir(dir, { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(products, null, 2), "utf8");
  cache = products;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 30);
}

/** Create a new product */
export async function createProduct(
  name: string,
  priceUsd: number,
  description: string
): Promise<Product> {
  const products = await load();

  const product: Product = {
    id: `${Date.now()}-${slugify(name)}`,
    name,
    description,
    priceUsd,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  products.push(product);
  await save(products);

  logSecurity("CONFIG_CHANGE", `Product created: ${name} ($${priceUsd})`, {
    productId: product.id,
  });

  return product;
}

/** Get a product by ID */
export async function getProduct(id: string): Promise<Product | null> {
  const products = await load();
  return products.find((p) => p.id === id) ?? null;
}

/** List all products (optionally including archived) */
export async function listProducts(includeArchived = false): Promise<Product[]> {
  const products = await load();
  return includeArchived ? products : products.filter((p) => p.status === "active");
}

/** Archive a product (soft-delete) */
export async function archiveProduct(id: string): Promise<boolean> {
  const products = await load();
  const product = products.find((p) => p.id === id);
  if (!product) return false;

  product.status = "archived";
  product.updatedAt = new Date().toISOString();
  await save(products);

  logSecurity("CONFIG_CHANGE", `Product archived: ${product.name}`, {
    productId: id,
  });

  return true;
}

/** Update product fields */
export async function updateProduct(
  id: string,
  updates: Partial<Pick<Product, "name" | "description" | "priceUsd">>
): Promise<Product | null> {
  const products = await load();
  const product = products.find((p) => p.id === id);
  if (!product) return null;

  Object.assign(product, updates, { updatedAt: new Date().toISOString() });
  await save(products);

  logSecurity("CONFIG_CHANGE", `Product updated: ${product.name}`, {
    productId: id,
  });

  return product;
}

/** Format product list for Telegram */
export function formatProductList(products: Product[]): string {
  if (products.length === 0) return "No products yet. Create one with /product create";

  return products
    .map(
      (p) =>
        `${p.status === "active" ? "+" : "x"} ${p.name} — $${p.priceUsd.toFixed(2)}\n  ID: ${p.id}\n  ${p.description.substring(0, 60)}`
    )
    .join("\n\n");
}
