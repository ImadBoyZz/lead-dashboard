// Meet accuracy van Layer 1+2 franchise classifier op de ground-truth set.
// Gebruik: npx tsx scripts/test-franchise-classifier.ts
// Loopt standalone (geen DB nodig voor Layer 1 — valt terug op SEED_FRANCHISE_PATTERNS).
//
// Output: per-case verdict + samenvatting met accuracy, false positives/negatives.
// Plan §Fase 1 validatie: "seed 30 ground-truth leads handmatig gelabeld →
// run layers 1-2 → measure accuracy baseline vóór LLM layers toevoegen".

import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface GroundTruthCase {
  name: string;
  googleReviewCount: number | null;
  hasGoogleBusinessProfile: boolean | null;
  website: string | null;
  expectedChainClassification: string;
  notes?: string;
}

async function main() {
  const raw = readFileSync(resolve('scripts/ground-truth-set.json'), 'utf8');
  const data = JSON.parse(raw) as { cases: GroundTruthCase[] };
  const cases = data.cases;

  const { classifyChainLayers1And2 } = await import('../src/lib/classify/franchise');

  const results: Array<{
    name: string;
    expected: string;
    actual: string;
    confidence: number;
    reason: string;
    layer: string;
    correct: boolean;
  }> = [];

  for (const c of cases) {
    const result = await classifyChainLayers1And2({
      name: c.name,
      googleReviewCount: c.googleReviewCount,
      googlePlaceId: null,
      website: c.website,
      hasGoogleBusinessProfile: c.hasGoogleBusinessProfile,
    });
    results.push({
      name: c.name,
      expected: c.expectedChainClassification,
      actual: result.classification,
      confidence: result.confidence,
      reason: result.reason,
      layer: result.layerUsed,
      correct: result.classification === c.expectedChainClassification,
    });
  }

  console.log('\n=== Franchise Classifier — Layer 1+2 Accuracy Test ===\n');
  for (const r of results) {
    const icon = r.correct ? '✓' : '✗';
    const confStr = r.confidence > 0 ? `conf=${r.confidence.toFixed(2)}` : 'conf=0.00';
    console.log(`  ${icon} ${r.name}`);
    console.log(
      `      expected=${r.expected.padEnd(12)}  actual=${r.actual.padEnd(12)}  ${confStr}  layer=${r.layer}`,
    );
    if (!r.correct) console.log(`      → ${r.reason}`);
  }

  const total = results.length;
  const correct = results.filter((r) => r.correct).length;
  const pct = ((correct / total) * 100).toFixed(1);
  console.log(`\n  Accuracy: ${correct}/${total} = ${pct}%`);

  // Per-class breakdown
  const classes = Array.from(new Set(results.map((r) => r.expected)));
  console.log('\n  Per-class accuracy:');
  for (const cls of classes) {
    const subset = results.filter((r) => r.expected === cls);
    const hits = subset.filter((r) => r.correct).length;
    console.log(`    ${cls.padEnd(12)} ${hits}/${subset.length}`);
  }

  // False positives (geclassificeerd als keten, verwacht onafhankelijk/unknown)
  const fps = results.filter(
    (r) =>
      (r.actual === 'chain' || r.actual === 'corporate' || r.actual === 'franchise') &&
      r.expected !== r.actual &&
      (r.expected === 'independent' || r.expected === 'unknown'),
  );
  if (fps.length > 0) {
    console.log('\n  ⚠ False positives (wrongly classified as keten):');
    for (const fp of fps) {
      console.log(`    - ${fp.name}: expected=${fp.expected}, got=${fp.actual} via ${fp.layer}`);
    }
  }

  // False negatives (verwacht keten, niet gevangen)
  const fns = results.filter(
    (r) =>
      (r.expected === 'chain' || r.expected === 'corporate' || r.expected === 'franchise') &&
      r.actual !== r.expected,
  );
  if (fns.length > 0) {
    console.log('\n  ⚠ False negatives (keten niet herkend):');
    for (const fn of fns) {
      console.log(`    - ${fn.name}: expected=${fn.expected}, got=${fn.actual} via ${fn.layer}`);
    }
  }

  console.log('\n  Target baseline: ≥80% (plan §verificatie #2). <80% → patterns bijwerken.\n');

  process.exit(correct === total ? 0 : 0); // altijd 0 — dit is meetinstrument, geen gate
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
