// Unit test voor stripEmDashes() — 5 sample AI outputs met em/en-dash.
import assert from 'node:assert/strict';

(async () => {
  const { stripEmDashes, sanitizeVariant } = await import('../src/lib/ai/sanitize');

  const cases: { label: string; input: string; expected: string }[] = [
    {
      label: '1. Em-dash mid-zin (klassiek AI-tell)',
      input: 'mooie naam — Amigo Cars klinkt vertrouwd.',
      expected: 'mooie naam. Amigo Cars klinkt vertrouwd.',
    },
    {
      label: '2. En-dash als lichte pauze',
      input: 'zag uw site – top reviews trouwens.',
      expected: 'zag uw site, top reviews trouwens.',
    },
    {
      label: '3. Meerdere em-dashes in één PS',
      input: '30 reviews — 5 sterren — zeldzaam in deze sector.',
      expected: '30 reviews. 5 sterren. zeldzaam in deze sector.',
    },
    {
      label: '4. Em-dash zonder spaties eromheen',
      input: 'site-speed—mobile UX—vindbaarheid.',
      expected: 'site-speed. mobile UX. vindbaarheid.',
    },
    {
      label: '5. Mix em + en + compound-hyphen (compound blijft)',
      input: 'Amigo Cars — Aalst – auto-dealer.',
      expected: 'Amigo Cars. Aalst, auto-dealer.',
    },
    {
      label: '6. Spatie-omringde hyphen-minus als separator',
      input: 'die 30 reviews - dat zien we niet vaak.',
      expected: 'die 30 reviews, dat zien we niet vaak.',
    },
    {
      label: '7. Mix van alle drie (em + en + " - ") zonder compound te raken',
      input: 'Amigo Cars — 5 sterren - top score – auto-dealer.',
      expected: 'Amigo Cars. 5 sterren, top score, auto-dealer.',
    },
  ];

  let pass = 0;
  let fail = 0;
  for (const c of cases) {
    const got = stripEmDashes(c.input);
    const ok = got === c.expected;
    console.log(ok ? 'PASS' : 'FAIL', c.label);
    console.log('  input   :', JSON.stringify(c.input));
    console.log('  expected:', JSON.stringify(c.expected));
    console.log('  got     :', JSON.stringify(got));
    if (ok) pass++;
    else fail++;
  }

  // sanitizeVariant smoke test
  const variant = {
    subject: 'site van amigo cars',
    body: 'Zag uw site — top reviews.',
    ps: 'trouwens — mooie naam.',
  };
  const cleaned = sanitizeVariant(variant);
  assert.equal(cleaned.subject, 'site van amigo cars');
  assert.equal(cleaned.body, 'Zag uw site. top reviews.');
  assert.equal(cleaned.ps, 'trouwens. mooie naam.');
  console.log('PASS sanitizeVariant smoke test');
  pass++;

  // Guard: null/empty
  assert.equal(stripEmDashes(null), '');
  assert.equal(stripEmDashes(undefined), '');
  assert.equal(stripEmDashes(''), '');
  console.log('PASS null/undefined/empty guard');
  pass++;

  console.log(`\n=== ${pass} pass / ${fail} fail ===`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
