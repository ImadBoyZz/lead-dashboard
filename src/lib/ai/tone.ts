// Sector → toon mapping op basis van NACE code prefix

export type Tone = 'formal' | 'informal' | 'semi-formal';

const FORMAL_PREFIXES = [
  '691',   // Advocaten, notarissen
  '862',   // Tandartsen, medisch specialisten
  '711',   // Architecten, ingenieurs
  '68',    // Vastgoed (makelaars, beheer)
  '69',    // Boekhouders, accountants (brede groep)
];

const INFORMAL_PREFIXES = [
  '56',    // Horeca
  '47',    // Retail
  '9602',  // Beauty, kappers
  '43',    // Bouw, installateurs
  '8130',  // Tuinaanleg
  '45',    // Autohandel, garages
];

export function getToneForNace(naceCode: string | null | undefined): Tone {
  if (!naceCode) return 'semi-formal';

  if (FORMAL_PREFIXES.some((p) => naceCode.startsWith(p))) return 'formal';
  if (INFORMAL_PREFIXES.some((p) => naceCode.startsWith(p))) return 'informal';

  return 'semi-formal';
}

export function getToneInstruction(tone: Tone): string {
  switch (tone) {
    case 'formal':
      return 'Gebruik een professionele, formele toon. Spreek de ontvanger aan met "u". Vermijd informeel taalgebruik.';
    case 'informal':
      return 'Gebruik een vriendelijke, informele toon. Spreek de ontvanger aan met "je/jij". Wees direct en benaderbaar.';
    case 'semi-formal':
      return 'Gebruik een zakelijke maar toegankelijke toon. Spreek de ontvanger aan met "u" maar vermijd stijf taalgebruik.';
  }
}
