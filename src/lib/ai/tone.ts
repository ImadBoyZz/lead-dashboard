// Sector → toon + pain-angle + vocabulaire-ban mapping op basis van NACE code prefix.
// Bron memory: reference_nace_tone_override.md

export type Tone = 'formal' | 'informal' | 'semi-formal';

export type NaceCluster =
  | 'horeca'
  | 'bouw'
  | 'kappers'
  | 'auto'
  | 'retail'
  | 'professional'
  | 'default';

export interface ClusterConfig {
  tone: Tone;
  pronoun: 'u' | 'je';
  bodyMaxWords: number;
  painAngles: string[];          // 3-5 specifieke pain points
  vocabularyBlacklist: string[]; // woorden die extra slecht zijn voor deze sector
  vocabularyWhitelist: string[]; // sector-specifiek taalgebruik dat credibility toont
  sendWindowHint: string;        // menselijke timing-hint voor AI prompt
}

// ── Cluster → NACE mapping ───────────────────────────

const CLUSTER_PREFIXES: Record<NaceCluster, string[]> = {
  horeca: ['56'],
  bouw: ['41', '42', '43'],
  kappers: ['9602'],
  auto: ['45'],
  retail: ['47'],
  professional: ['691', '862', '711', '68', '69'],
  default: [],
};

export function getClusterForNace(naceCode: string | null | undefined): NaceCluster {
  if (!naceCode) return 'default';
  for (const [cluster, prefixes] of Object.entries(CLUSTER_PREFIXES) as [NaceCluster, string[]][]) {
    if (prefixes.some((p) => naceCode.startsWith(p))) return cluster;
  }
  return 'default';
}

// ── Cluster configs ──────────────────────────────────

const CLUSTER_CONFIGS: Record<NaceCluster, ClusterConfig> = {
  horeca: {
    tone: 'informal',
    pronoun: 'je',
    bodyMaxWords: 120,
    painAngles: [
      'meer reservaties op rustige dagen (ma/di)',
      'no-shows verminderen',
      'telefoontjes in de service tegenhouden',
      'online boeking buiten openingsuren',
    ],
    vocabularyBlacklist: [
      'transformatie', 'optimaliseren', 'synergie', 'strategie',
      'innovatief', 'dynamisch', 'oplossing',
    ],
    vocabularyWhitelist: ['couverts', 'reservaties', 'service', 'shift', 'menukaart'],
    sendWindowHint: 'di/wo 14u-16u (tussen lunch en diner)',
  },

  bouw: {
    tone: 'semi-formal',
    pronoun: 'u',
    bodyMaxWords: 80,
    painAngles: [
      'offertes maken kost uren per stuk',
      'leadtijd tussen contact en werf',
      'Google Maps reviews die leads opleveren',
      'werfreferenties die niet online staan',
    ],
    vocabularyBlacklist: [
      'transformatie', 'synergie', 'ecosysteem', 'op maat',
      'innovatief', 'dynamisch', 'naadloos', 'journey',
    ],
    vocabularyWhitelist: ['offerte', 'werf', 'oplevering', 'lead', 'bestek'],
    sendWindowHint: 'wo/do 07u30-08u30 (voor werf) of wo 14u-15u',
  },

  kappers: {
    tone: 'informal',
    pronoun: 'je',
    bodyMaxWords: 110,
    painAngles: [
      'online boekingen buiten uren (20u-22u)',
      'no-shows afbouwen',
      'Instagram als vitrine gebruiken',
      'klanten die via SMS/DM proberen te boeken',
    ],
    vocabularyBlacklist: [
      'booking widget', 'CTA', 'conversion', 'funnel',
      'optimaliseren', 'dashboard', 'strategie',
    ],
    vocabularyWhitelist: ['boekingsknop', 'afspraak', 'klantenboek', 'salon'],
    sendWindowHint: 'di/wo 13u-14u (lunch tussen klanten)',
  },

  auto: {
    tone: 'informal',
    pronoun: 'je',
    bodyMaxWords: 110,
    painAngles: [
      'seizoenspieken (oktober winterbanden, maart zomerbanden)',
      'klanten die bellen ipv online boeken',
      'admin chaos tijdens spits',
      'herinneringen voor onderhoudsbeurten',
    ],
    vocabularyBlacklist: ['transformatie', 'synergie', 'oplossing', 'journey'],
    vocabularyWhitelist: ['TPMS', 'runflat', 'diagnose', 'bandenhotel', 'keuring'],
    sendWindowHint: 'wo 09u30-11u of 15u-16u30 (tussen piekmomenten)',
  },

  retail: {
    tone: 'semi-formal',
    pronoun: 'u',
    bodyMaxWords: 120,
    painAngles: [
      'webshop conversie verbeteren',
      'lokale SEO versus grote ketens',
      'Google Shopping / Facebook Shop integratie',
    ],
    vocabularyBlacklist: ['transformatie', 'journey', 'ecosysteem'],
    vocabularyWhitelist: ['klantenservice', 'voorraad', 'kortingsactie', 'webshop'],
    sendWindowHint: 'di/wo/do 10u-11u of 14u-15u',
  },

  professional: {
    tone: 'formal',
    pronoun: 'u',
    bodyMaxWords: 130,
    painAngles: [
      'professionele uitstraling matcht expertise niet',
      'moeilijk vindbaar via Google voor specifieke zoektermen',
      'geen duidelijke specialisatie zichtbaar',
    ],
    vocabularyBlacklist: ['casual', 'hip', 'cool', 'gezellig'],
    vocabularyWhitelist: ['expertise', 'dossier', 'praktijk', 'kantoor', 'specialisatie'],
    sendWindowHint: 'di/wo/do 10u-12u',
  },

  default: {
    tone: 'semi-formal',
    pronoun: 'u',
    bodyMaxWords: 120,
    painAngles: [
      'website niet up-to-date',
      'lokale vindbaarheid beperkt',
      'mobiele ervaring matig',
    ],
    vocabularyBlacklist: [
      'transformatie', 'synergie', 'ecosysteem', 'op maat',
      'innovatief', 'dynamisch', 'journey', 'naadloos',
    ],
    vocabularyWhitelist: [],
    sendWindowHint: 'wo 10u-12u of 13u30-15u',
  },
};

export function getClusterConfig(cluster: NaceCluster): ClusterConfig {
  return CLUSTER_CONFIGS[cluster];
}

// ── Legacy helpers (blijven voor backwards compat) ────

export function getToneForNace(naceCode: string | null | undefined): Tone {
  return getClusterConfig(getClusterForNace(naceCode)).tone;
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
