#!/usr/bin/env node

require('dotenv/config');

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const abbreviations = [
  [/\btab\.?\b/g, 'tablet'],
  [/\bcaps?\.?\b/g, 'capsule'],
  [/\bsusp\.?\b/g, 'suspension'],
  [/\binj\.?\b/g, 'injection'],
  [/\bi\.?v\.?\b/g, 'iv'],
  [/\bi\.?m\.?\b/g, 'im'],
];

function normalizeName(value) {
  let result = value.normalize('NFKC').toLocaleLowerCase('en');
  for (const [pattern, replacement] of abbreviations) {
    result = result.replace(pattern, replacement);
  }
  return result
    .replace(/[^\p{L}\p{N}%+/.]+/gu, ' ')
    .replace(/\s*([%+/.])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const defaultDataset = path.resolve(
    __dirname,
    '../../research/palestine-medication-coverage/palestine-human-drug-products.json',
  );
  const datasetPath = path.resolve(process.argv[2] || defaultDataset);
  const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  const products = dataset.products;

  if (!Array.isArray(products) || products.length !== 2510) {
    throw new Error(`Expected 2,510 Palestinian human medicines, got ${products?.length}`);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');
    for (const product of products) {
      await client.query(
        `INSERT INTO medication_catalog
          (name, normalized_name, manufacturer, dosage_form, source, external_id)
         VALUES ($1, $2, $3, $4, 'palestine_moh', $5)
         ON CONFLICT (source, external_id) DO UPDATE SET
           name = EXCLUDED.name,
           normalized_name = EXCLUDED.normalized_name,
           manufacturer = EXCLUDED.manufacturer,
           dosage_form = EXCLUDED.dosage_form,
           updated_at = now()`,
        [
          product.name.trim(),
          normalizeName(product.name),
          product.manufacturer?.trim() || null,
          product.dosageForm?.trim() || null,
          String(product.productId),
        ],
      );
    }
    await client.query('COMMIT');
    console.log(`Imported ${products.length} Palestinian MOH catalog records.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
