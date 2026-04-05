import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';
import { computeScore } from '../scoring';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const sqlClient = neon(databaseUrl);
const db = drizzle(sqlClient, { schema });

// ── Business Data ──────────────────────────────────────

interface BusinessSeed {
  name: string;
  registryId: string;
  naceCode: string;
  naceDescription: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  province: string;
  website: string | null;
  email: string | null;
  phone: string;
  foundedDate: string;
  googleRating: number | null;
  googleReviewCount: number | null;
  legalForm: string;
}

const businessesData: BusinessSeed[] = [
  // === NO WEBSITE (7) ===
  {
    name: "Bakkerij Van Damme",
    registryId: "0456.123.001",
    naceCode: "1071",
    naceDescription: "Vervaardiging van brood en vers banketbakkerswerk",
    street: "Korenmarkt",
    houseNumber: "12",
    postalCode: "9000",
    city: "Gent",
    province: "Oost-Vlaanderen",
    website: null,
    email: null,
    phone: "+32 9 223 45 67",
    foundedDate: "1998-03-15",
    googleRating: 4.6,
    googleReviewCount: 87,
    legalForm: "BV",
  },
  {
    name: "Slagerij De Cock",
    registryId: "0456.123.002",
    naceCode: "4671",
    naceDescription: "Groothandel in brandstoffen en aanverwante producten",
    street: "Vrijdagmarkt",
    houseNumber: "8",
    postalCode: "9300",
    city: "Aalst",
    province: "Oost-Vlaanderen",
    website: null,
    email: null,
    phone: "+32 53 77 12 34",
    foundedDate: "1995-06-20",
    googleRating: 4.3,
    googleReviewCount: 42,
    legalForm: "Eenmanszaak",
  },
  {
    name: "Elektro Willems",
    registryId: "0456.123.003",
    naceCode: "4321",
    naceDescription: "Elektrotechnische installatiewerken",
    street: "Statiestraat",
    houseNumber: "45",
    postalCode: "3500",
    city: "Hasselt",
    province: "Limburg",
    website: null,
    email: null,
    phone: "+32 11 22 33 44",
    foundedDate: "2005-09-01",
    googleRating: 4.1,
    googleReviewCount: 23,
    legalForm: "BV",
  },
  {
    name: "Loodgieterij Maes",
    registryId: "0456.123.004",
    naceCode: "4322",
    naceDescription: "Loodgieterswerk, installatie van verwarming en klimaatregeling",
    street: "Dorpsstraat",
    houseNumber: "110",
    postalCode: "2800",
    city: "Mechelen",
    province: "Antwerpen",
    website: null,
    email: null,
    phone: "+32 15 41 56 78",
    foundedDate: "2001-01-10",
    googleRating: 3.8,
    googleReviewCount: 15,
    legalForm: "BV",
  },
  {
    name: "Kapsalon Frizuur",
    registryId: "0456.123.005",
    naceCode: "9602",
    naceDescription: "Kappers en schoonheidsverzorging",
    street: "Groenplaats",
    houseNumber: "3",
    postalCode: "2000",
    city: "Antwerpen",
    province: "Antwerpen",
    website: null,
    email: null,
    phone: "+32 3 225 67 89",
    foundedDate: "2012-04-15",
    googleRating: 4.5,
    googleReviewCount: 65,
    legalForm: "Eenmanszaak",
  },
  {
    name: "Tandartspraktijk Claeys",
    registryId: "0456.123.006",
    naceCode: "8623",
    naceDescription: "Praktijken van tandartsen",
    street: "Bondgenotenlaan",
    houseNumber: "78",
    postalCode: "3000",
    city: "Leuven",
    province: "Vlaams-Brabant",
    website: null,
    email: null,
    phone: "+32 16 23 45 67",
    foundedDate: "2008-11-01",
    googleRating: 4.2,
    googleReviewCount: 34,
    legalForm: "BV",
  },
  {
    name: "Aannemersbedrijf Pieters",
    registryId: "0456.123.007",
    naceCode: "4120",
    naceDescription: "Algemene burgerlijke en utiliteitsbouw",
    street: "Leiestraat",
    houseNumber: "22",
    postalCode: "8500",
    city: "Kortrijk",
    province: "West-Vlaanderen",
    website: null,
    email: null,
    phone: "+32 56 21 33 44",
    foundedDate: "1993-07-12",
    googleRating: null,
    googleReviewCount: null,
    legalForm: "NV",
  },

  // === POOR WEBSITES (8) — PageSpeed 15-40 ===
  {
    name: "Restaurant 't Fornuis",
    registryId: "0456.123.008",
    naceCode: "5610",
    naceDescription: "Eet- en drinkgelegenheden met volledige bediening",
    street: "Reyndersstraat",
    houseNumber: "24",
    postalCode: "2000",
    city: "Antwerpen",
    province: "Antwerpen",
    website: "https://www.hetfornuis.be",
    email: "info@hetfornuis.be",
    phone: "+32 3 233 62 70",
    foundedDate: "1992-05-20",
    googleRating: 4.7,
    googleReviewCount: 156,
    legalForm: "BV",
  },
  {
    name: "Garage Peeters",
    registryId: "0456.123.009",
    naceCode: "4520",
    naceDescription: "Onderhoud en reparatie van motorvoertuigen",
    street: "Mechelsesteenweg",
    houseNumber: "187",
    postalCode: "2000",
    city: "Antwerpen",
    province: "Antwerpen",
    website: "https://www.garagepeeters.be",
    email: "info@garagepeeters.be",
    phone: "+32 3 216 78 90",
    foundedDate: "1997-02-14",
    googleRating: 4.0,
    googleReviewCount: 89,
    legalForm: "BV",
  },
  {
    name: "Bouwbedrijf Janssens & Zonen",
    registryId: "0456.123.010",
    naceCode: "4120",
    naceDescription: "Algemene burgerlijke en utiliteitsbouw",
    street: "Industriezone Noord",
    houseNumber: "5",
    postalCode: "9300",
    city: "Aalst",
    province: "Oost-Vlaanderen",
    website: "http://www.janssens-bouw.be",
    email: "info@janssens-bouw.be",
    phone: "+32 53 78 45 12",
    foundedDate: "1990-08-01",
    googleRating: 4.2,
    googleReviewCount: 31,
    legalForm: "NV",
  },
  {
    name: "Huisartsenpraktijk Van den Berghe",
    registryId: "0456.123.011",
    naceCode: "8621",
    naceDescription: "Praktijken van huisartsen",
    street: "Kerkstraat",
    houseNumber: "56",
    postalCode: "9000",
    city: "Gent",
    province: "Oost-Vlaanderen",
    website: "https://www.doktersvandenberghe.be",
    email: "praktijk@vandenberghe.be",
    phone: "+32 9 225 11 22",
    foundedDate: "2003-01-15",
    googleRating: 3.9,
    googleReviewCount: 67,
    legalForm: "BV",
  },
  {
    name: "Kapsalon Belle",
    registryId: "0456.123.012",
    naceCode: "9602",
    naceDescription: "Kappers en schoonheidsverzorging",
    street: "Steenstraat",
    houseNumber: "41",
    postalCode: "8000",
    city: "Brugge",
    province: "West-Vlaanderen",
    website: "http://www.kapsalonbelle.be",
    email: "info@kapsalonbelle.be",
    phone: "+32 50 33 44 55",
    foundedDate: "2010-06-01",
    googleRating: 4.4,
    googleReviewCount: 52,
    legalForm: "Eenmanszaak",
  },
  {
    name: "Advocatenkantoor Goossens",
    registryId: "0456.123.013",
    naceCode: "6910",
    naceDescription: "Rechtskundige dienstverlening",
    street: "Koophandelplein",
    houseNumber: "9",
    postalCode: "9000",
    city: "Gent",
    province: "Oost-Vlaanderen",
    website: "https://www.advocaatgoossens.be",
    email: "kantoor@goossens-law.be",
    phone: "+32 9 233 78 90",
    foundedDate: "1999-03-10",
    googleRating: 4.1,
    googleReviewCount: 18,
    legalForm: "BV",
  },
  {
    name: "Autobedrijf De Vlaeminck",
    registryId: "0456.123.014",
    naceCode: "4520",
    naceDescription: "Onderhoud en reparatie van motorvoertuigen",
    street: "Brusselsesteenweg",
    houseNumber: "312",
    postalCode: "9300",
    city: "Aalst",
    province: "Oost-Vlaanderen",
    website: "http://www.devlaeminck-auto.be",
    email: "info@devlaeminck-auto.be",
    phone: "+32 53 21 56 78",
    foundedDate: "2002-09-15",
    googleRating: 3.6,
    googleReviewCount: 28,
    legalForm: "BV",
  },
  {
    name: "Bakkerij Verhoeven",
    registryId: "0456.123.015",
    naceCode: "1071",
    naceDescription: "Vervaardiging van brood en vers banketbakkerswerk",
    street: "Markt",
    houseNumber: "17",
    postalCode: "3000",
    city: "Leuven",
    province: "Vlaams-Brabant",
    website: "http://www.bakkerijverhoeven.be",
    email: "info@bakkerijverhoeven.be",
    phone: "+32 16 22 33 44",
    foundedDate: "1996-12-01",
    googleRating: 4.8,
    googleReviewCount: 132,
    legalForm: "BV",
  },

  // === MEDIOCRE WEBSITES (8) — PageSpeed 40-65 ===
  {
    name: "Accountantskantoor Vermeersch",
    registryId: "0456.123.016",
    naceCode: "6920",
    naceDescription: "Accountancy, boekhouding en belastingadvies",
    street: "Veldstraat",
    houseNumber: "88",
    postalCode: "9000",
    city: "Gent",
    province: "Oost-Vlaanderen",
    website: "https://www.vermeersch-accountancy.be",
    email: "info@vermeersch-accountancy.be",
    phone: "+32 9 224 56 78",
    foundedDate: "2000-04-01",
    googleRating: 4.3,
    googleReviewCount: 25,
    legalForm: "BV",
  },
  {
    name: "Immo Vlaanderen",
    registryId: "0456.123.017",
    naceCode: "6820",
    naceDescription: "Verhuur en exploitatie van eigen of geleasd onroerend goed",
    street: "Lange Nieuwstraat",
    houseNumber: "32",
    postalCode: "2000",
    city: "Antwerpen",
    province: "Antwerpen",
    website: "https://www.immovlaanderen.be",
    email: "info@immovlaanderen.be",
    phone: "+32 3 231 45 67",
    foundedDate: "2006-10-15",
    googleRating: 3.8,
    googleReviewCount: 45,
    legalForm: "BV",
  },
  {
    name: "Tandartspraktijk De Smedt",
    registryId: "0456.123.018",
    naceCode: "8623",
    naceDescription: "Praktijken van tandartsen",
    street: "Grote Markt",
    houseNumber: "15",
    postalCode: "9300",
    city: "Aalst",
    province: "Oost-Vlaanderen",
    website: "https://www.tandartsdesmedt.be",
    email: "praktijk@desmedt-tand.be",
    phone: "+32 53 77 88 99",
    foundedDate: "2007-02-28",
    googleRating: 4.5,
    googleReviewCount: 73,
    legalForm: "BV",
  },
  {
    name: "Kinesitherapie Declercq",
    registryId: "0456.123.019",
    naceCode: "8690",
    naceDescription: "Overige menselijke gezondheidszorg",
    street: "Zuidstraat",
    houseNumber: "67",
    postalCode: "8000",
    city: "Brugge",
    province: "West-Vlaanderen",
    website: "https://www.kinedeclercq.be",
    email: "afspraak@kinedeclercq.be",
    phone: "+32 50 34 56 78",
    foundedDate: "2011-05-01",
    googleRating: 4.6,
    googleReviewCount: 38,
    legalForm: "BV",
  },
  {
    name: "Restaurant De Karmeliet",
    registryId: "0456.123.020",
    naceCode: "5610",
    naceDescription: "Eet- en drinkgelegenheden met volledige bediening",
    street: "Langestraat",
    houseNumber: "19",
    postalCode: "8000",
    city: "Brugge",
    province: "West-Vlaanderen",
    website: "https://www.dekarmeliet.be",
    email: "reservatie@dekarmeliet.be",
    phone: "+32 50 33 82 59",
    foundedDate: "1994-03-15",
    googleRating: 4.4,
    googleReviewCount: 180,
    legalForm: "BV",
  },
  {
    name: "Garage Van Acker",
    registryId: "0456.123.021",
    naceCode: "4520",
    naceDescription: "Onderhoud en reparatie van motorvoertuigen",
    street: "Antwerpsesteenweg",
    houseNumber: "220",
    postalCode: "2800",
    city: "Mechelen",
    province: "Antwerpen",
    website: "https://www.garagevanacker.be",
    email: "info@garagevanacker.be",
    phone: "+32 15 43 21 09",
    foundedDate: "2004-08-20",
    googleRating: 3.9,
    googleReviewCount: 55,
    legalForm: "BV",
  },
  {
    name: "Elektricien Bogaert",
    registryId: "0456.123.022",
    naceCode: "4321",
    naceDescription: "Elektrotechnische installatiewerken",
    street: "Nieuwstraat",
    houseNumber: "14",
    postalCode: "3500",
    city: "Hasselt",
    province: "Limburg",
    website: "https://www.bogaert-elektro.be",
    email: "info@bogaert-elektro.be",
    phone: "+32 11 25 67 89",
    foundedDate: "2009-01-10",
    googleRating: 4.0,
    googleReviewCount: 19,
    legalForm: "Eenmanszaak",
  },
  {
    name: "Slagerij Mertens",
    registryId: "0456.123.023",
    naceCode: "4671",
    naceDescription: "Groothandel in brandstoffen en aanverwante producten",
    street: "Hoogstraat",
    houseNumber: "51",
    postalCode: "3000",
    city: "Leuven",
    province: "Vlaams-Brabant",
    website: "https://www.slagerijmertens.be",
    email: "bestelling@slagerijmertens.be",
    phone: "+32 16 20 11 22",
    foundedDate: "2000-06-15",
    googleRating: 4.7,
    googleReviewCount: 95,
    legalForm: "BV",
  },

  // === DECENT WEBSITES (7) — PageSpeed 65-90 ===
  {
    name: "Immo Gent Centrum",
    registryId: "0456.123.024",
    naceCode: "6820",
    naceDescription: "Verhuur en exploitatie van eigen of geleasd onroerend goed",
    street: "Kouter",
    houseNumber: "7",
    postalCode: "9000",
    city: "Gent",
    province: "Oost-Vlaanderen",
    website: "https://www.immogentcentrum.be",
    email: "info@immogentcentrum.be",
    phone: "+32 9 226 78 90",
    foundedDate: "2015-03-01",
    googleRating: 4.3,
    googleReviewCount: 62,
    legalForm: "BV",
  },
  {
    name: "Accountancy Baert & Partners",
    registryId: "0456.123.025",
    naceCode: "6920",
    naceDescription: "Accountancy, boekhouding en belastingadvies",
    street: "Koning Albertlaan",
    houseNumber: "44",
    postalCode: "8500",
    city: "Kortrijk",
    province: "West-Vlaanderen",
    website: "https://www.baert-partners.be",
    email: "info@baert-partners.be",
    phone: "+32 56 22 33 44",
    foundedDate: "2013-09-15",
    googleRating: 4.5,
    googleReviewCount: 30,
    legalForm: "BV",
  },
  {
    name: "Restaurant Brasserie Leopold",
    registryId: "0456.123.026",
    naceCode: "5610",
    naceDescription: "Eet- en drinkgelegenheden met volledige bediening",
    street: "Grote Markt",
    houseNumber: "1",
    postalCode: "3500",
    city: "Hasselt",
    province: "Limburg",
    website: "https://www.brasserieleopold.be",
    email: "reservatie@brasserieleopold.be",
    phone: "+32 11 24 56 78",
    foundedDate: "2016-06-01",
    googleRating: 4.2,
    googleReviewCount: 110,
    legalForm: "BV",
  },
  {
    name: "Advocatenkantoor Martens & Verstraeten",
    registryId: "0456.123.027",
    naceCode: "6910",
    naceDescription: "Rechtskundige dienstverlening",
    street: "Meir",
    houseNumber: "100",
    postalCode: "2000",
    city: "Antwerpen",
    province: "Antwerpen",
    website: "https://www.martens-verstraeten.be",
    email: "kantoor@martens-verstraeten.be",
    phone: "+32 3 234 56 78",
    foundedDate: "2010-11-01",
    googleRating: 4.0,
    googleReviewCount: 12,
    legalForm: "BV",
  },
  {
    name: "Bouwwerken De Groote",
    registryId: "0456.123.028",
    naceCode: "4120",
    naceDescription: "Algemene burgerlijke en utiliteitsbouw",
    street: "Gentsesteenweg",
    houseNumber: "156",
    postalCode: "9300",
    city: "Aalst",
    province: "Oost-Vlaanderen",
    website: "https://www.degroote-bouw.be",
    email: "info@degroote-bouw.be",
    phone: "+32 53 70 12 34",
    foundedDate: "2014-01-20",
    googleRating: 4.1,
    googleReviewCount: 22,
    legalForm: "BV",
  },
  {
    name: "Kapsalon Nouveau",
    registryId: "0456.123.029",
    naceCode: "9602",
    naceDescription: "Kappers en schoonheidsverzorging",
    street: "Lippenslaan",
    houseNumber: "33",
    postalCode: "8300",
    city: "Knokke-Heist",
    province: "West-Vlaanderen",
    website: "https://www.kapsalonnouveau.be",
    email: "boek@kapsalonnouveau.be",
    phone: "+32 50 62 33 44",
    foundedDate: "2018-04-01",
    googleRating: 4.8,
    googleReviewCount: 48,
    legalForm: "Eenmanszaak",
  },
  {
    name: "Kinesist Van Hoeck",
    registryId: "0456.123.030",
    naceCode: "8690",
    naceDescription: "Overige menselijke gezondheidszorg",
    street: "Diestsestraat",
    houseNumber: "89",
    postalCode: "3000",
    city: "Leuven",
    province: "Vlaams-Brabant",
    website: "https://www.kinevanhoeck.be",
    email: "afspraak@kinevanhoeck.be",
    phone: "+32 16 21 78 90",
    foundedDate: "2017-08-15",
    googleRating: 4.4,
    googleReviewCount: 29,
    legalForm: "BV",
  },
];

// ── Audit data templates ───────────────────────────────

interface AuditSeed {
  pagespeedMobile: number;
  pagespeedDesktop: number;
  pagespeedFcp: number;
  pagespeedLcp: number;
  pagespeedCls: number;
  hasSsl: boolean;
  isMobileResponsive: boolean;
  hasViewportMeta: boolean;
  detectedCms: string | null;
  cmsVersion: string | null;
  detectedTechnologies: string[];
  hasGoogleAnalytics: boolean;
  hasGoogleTagManager: boolean;
  hasFacebookPixel: boolean;
  hasCookieBanner: boolean;
  hasMetaDescription: boolean;
  hasOpenGraph: boolean;
  hasStructuredData: boolean;
}

// Poor sites (index 7-14, PageSpeed 15-40)
const poorAudits: AuditSeed[] = [
  { pagespeedMobile: 18, pagespeedDesktop: 35, pagespeedFcp: 6.2, pagespeedLcp: 12.1, pagespeedCls: 0.45, hasSsl: false, isMobileResponsive: false, hasViewportMeta: false, detectedCms: "Joomla 3.9", cmsVersion: "3.9", detectedTechnologies: ["jQuery", "PHP"], hasGoogleAnalytics: false, hasGoogleTagManager: false, hasFacebookPixel: false, hasCookieBanner: false, hasMetaDescription: false, hasOpenGraph: false, hasStructuredData: false },
  { pagespeedMobile: 22, pagespeedDesktop: 40, pagespeedFcp: 5.8, pagespeedLcp: 10.5, pagespeedCls: 0.38, hasSsl: true, isMobileResponsive: false, hasViewportMeta: false, detectedCms: "WordPress 4.9", cmsVersion: "4.9", detectedTechnologies: ["jQuery", "PHP", "WordPress"], hasGoogleAnalytics: false, hasGoogleTagManager: false, hasFacebookPixel: false, hasCookieBanner: false, hasMetaDescription: true, hasOpenGraph: false, hasStructuredData: false },
  { pagespeedMobile: 15, pagespeedDesktop: 28, pagespeedFcp: 7.1, pagespeedLcp: 14.3, pagespeedCls: 0.52, hasSsl: false, isMobileResponsive: false, hasViewportMeta: false, detectedCms: null, cmsVersion: null, detectedTechnologies: ["jQuery"], hasGoogleAnalytics: false, hasGoogleTagManager: false, hasFacebookPixel: false, hasCookieBanner: false, hasMetaDescription: false, hasOpenGraph: false, hasStructuredData: false },
  { pagespeedMobile: 28, pagespeedDesktop: 45, pagespeedFcp: 4.9, pagespeedLcp: 9.8, pagespeedCls: 0.31, hasSsl: true, isMobileResponsive: false, hasViewportMeta: false, detectedCms: "WordPress 5.2", cmsVersion: "5.2", detectedTechnologies: ["jQuery", "PHP", "WordPress"], hasGoogleAnalytics: true, hasGoogleTagManager: false, hasFacebookPixel: false, hasCookieBanner: false, hasMetaDescription: true, hasOpenGraph: false, hasStructuredData: false },
  { pagespeedMobile: 32, pagespeedDesktop: 48, pagespeedFcp: 4.5, pagespeedLcp: 8.7, pagespeedCls: 0.28, hasSsl: false, isMobileResponsive: true, hasViewportMeta: true, detectedCms: "Wix", cmsVersion: null, detectedTechnologies: ["Wix"], hasGoogleAnalytics: false, hasGoogleTagManager: false, hasFacebookPixel: false, hasCookieBanner: true, hasMetaDescription: true, hasOpenGraph: true, hasStructuredData: false },
  { pagespeedMobile: 25, pagespeedDesktop: 38, pagespeedFcp: 5.5, pagespeedLcp: 11.2, pagespeedCls: 0.41, hasSsl: true, isMobileResponsive: false, hasViewportMeta: false, detectedCms: "Drupal 7", cmsVersion: "7", detectedTechnologies: ["jQuery", "Drupal", "PHP"], hasGoogleAnalytics: false, hasGoogleTagManager: false, hasFacebookPixel: false, hasCookieBanner: false, hasMetaDescription: false, hasOpenGraph: false, hasStructuredData: false },
  { pagespeedMobile: 35, pagespeedDesktop: 50, pagespeedFcp: 4.2, pagespeedLcp: 8.1, pagespeedCls: 0.25, hasSsl: false, isMobileResponsive: false, hasViewportMeta: false, detectedCms: null, cmsVersion: null, detectedTechnologies: ["jQuery", "Bootstrap 3"], hasGoogleAnalytics: false, hasGoogleTagManager: false, hasFacebookPixel: false, hasCookieBanner: false, hasMetaDescription: true, hasOpenGraph: false, hasStructuredData: false },
  { pagespeedMobile: 38, pagespeedDesktop: 52, pagespeedFcp: 3.9, pagespeedLcp: 7.8, pagespeedCls: 0.22, hasSsl: true, isMobileResponsive: true, hasViewportMeta: true, detectedCms: "WordPress 5.0", cmsVersion: "5.0", detectedTechnologies: ["jQuery", "WordPress", "PHP"], hasGoogleAnalytics: false, hasGoogleTagManager: false, hasFacebookPixel: false, hasCookieBanner: false, hasMetaDescription: true, hasOpenGraph: true, hasStructuredData: false },
];

// Mediocre sites (index 15-22, PageSpeed 40-65)
const mediocreAudits: AuditSeed[] = [
  { pagespeedMobile: 48, pagespeedDesktop: 62, pagespeedFcp: 3.2, pagespeedLcp: 6.5, pagespeedCls: 0.18, hasSsl: true, isMobileResponsive: true, hasViewportMeta: true, detectedCms: "WordPress 6.2", cmsVersion: "6.2", detectedTechnologies: ["jQuery", "WordPress", "PHP"], hasGoogleAnalytics: true, hasGoogleTagManager: false, hasFacebookPixel: false, hasCookieBanner: true, hasMetaDescription: true, hasOpenGraph: true, hasStructuredData: false },
  { pagespeedMobile: 42, pagespeedDesktop: 58, pagespeedFcp: 3.5, pagespeedLcp: 7.0, pagespeedCls: 0.20, hasSsl: true, isMobileResponsive: true, hasViewportMeta: true, detectedCms: "Squarespace", cmsVersion: null, detectedTechnologies: ["Squarespace"], hasGoogleAnalytics: true, hasGoogleTagManager: false, hasFacebookPixel: false, hasCookieBanner: true, hasMetaDescription: true, hasOpenGraph: true, hasStructuredData: true },
  { pagespeedMobile: 55, pagespeedDesktop: 70, pagespeedFcp: 2.8, pagespeedLcp: 5.5, pagespeedCls: 0.15, hasSsl: true, isMobileResponsive: true, hasViewportMeta: true, detectedCms: "WordPress 6.4", cmsVersion: "6.4", detectedTechnologies: ["jQuery", "WordPress", "PHP", "Elementor"], hasGoogleAnalytics: true, hasGoogleTagManager: true, hasFacebookPixel: false, hasCookieBanner: true, hasMetaDescription: true, hasOpenGraph: true, hasStructuredData: true },
  { pagespeedMobile: 52, pagespeedDesktop: 68, pagespeedFcp: 2.9, pagespeedLcp: 5.8, pagespeedCls: 0.16, hasSsl: true, isMobileResponsive: true, hasViewportMeta: true, detectedCms: "WordPress 6.1", cmsVersion: "6.1", detectedTechnologies: ["jQuery", "WordPress", "PHP"], hasGoogleAnalytics: false, hasGoogleTagManager: false, hasFacebookPixel: false, hasCookieBanner: false, hasMetaDescription: true, hasOpenGraph: false, hasStructuredData: false },
  { pagespeedMobile: 60, pagespeedDesktop: 75, pagespeedFcp: 2.5, pagespeedLcp: 4.8, pagespeedCls: 0.12, hasSsl: true, isMobileResponsive: true, hasViewportMeta: true, detectedCms: "WordPress 6.3", cmsVersion: "6.3", detectedTechnologies: ["jQuery", "WordPress", "PHP", "WooCommerce"], hasGoogleAnalytics: true, hasGoogleTagManager: false, hasFacebookPixel: true, hasCookieBanner: true, hasMetaDescription: true, hasOpenGraph: true, hasStructuredData: true },
  { pagespeedMobile: 45, pagespeedDesktop: 60, pagespeedFcp: 3.4, pagespeedLcp: 6.8, pagespeedCls: 0.19, hasSsl: true, isMobileResponsive: true, hasViewportMeta: true, detectedCms: "Wix", cmsVersion: null, detectedTechnologies: ["Wix"], hasGoogleAnalytics: true, hasGoogleTagManager: false, hasFacebookPixel: false, hasCookieBanner: true, hasMetaDescription: true, hasOpenGraph: true, hasStructuredData: false },
  { pagespeedMobile: 58, pagespeedDesktop: 72, pagespeedFcp: 2.6, pagespeedLcp: 5.2, pagespeedCls: 0.14, hasSsl: true, isMobileResponsive: true, hasViewportMeta: true, detectedCms: "WordPress 6.0", cmsVersion: "6.0", detectedTechnologies: ["jQuery", "WordPress", "PHP"], hasGoogleAnalytics: false, hasGoogleTagManager: false, hasFacebookPixel: false, hasCookieBanner: false, hasMetaDescription: true, hasOpenGraph: true, hasStructuredData: false },
  { pagespeedMobile: 50, pagespeedDesktop: 65, pagespeedFcp: 3.0, pagespeedLcp: 6.0, pagespeedCls: 0.17, hasSsl: true, isMobileResponsive: true, hasViewportMeta: true, detectedCms: "WordPress 6.2", cmsVersion: "6.2", detectedTechnologies: ["jQuery", "WordPress", "PHP", "Yoast SEO"], hasGoogleAnalytics: true, hasGoogleTagManager: false, hasFacebookPixel: false, hasCookieBanner: true, hasMetaDescription: true, hasOpenGraph: true, hasStructuredData: true },
];

// Decent sites (index 23-29, PageSpeed 65-90)
const decentAudits: AuditSeed[] = [
  { pagespeedMobile: 78, pagespeedDesktop: 92, pagespeedFcp: 1.5, pagespeedLcp: 2.8, pagespeedCls: 0.05, hasSsl: true, isMobileResponsive: true, hasViewportMeta: true, detectedCms: "WordPress 6.5", cmsVersion: "6.5", detectedTechnologies: ["jQuery", "WordPress", "PHP", "Elementor Pro"], hasGoogleAnalytics: true, hasGoogleTagManager: true, hasFacebookPixel: true, hasCookieBanner: true, hasMetaDescription: true, hasOpenGraph: true, hasStructuredData: true },
  { pagespeedMobile: 72, pagespeedDesktop: 88, pagespeedFcp: 1.8, pagespeedLcp: 3.2, pagespeedCls: 0.07, hasSsl: true, isMobileResponsive: true, hasViewportMeta: true, detectedCms: "WordPress 6.4", cmsVersion: "6.4", detectedTechnologies: ["jQuery", "WordPress", "PHP", "Yoast SEO"], hasGoogleAnalytics: true, hasGoogleTagManager: true, hasFacebookPixel: false, hasCookieBanner: true, hasMetaDescription: true, hasOpenGraph: true, hasStructuredData: true },
  { pagespeedMobile: 82, pagespeedDesktop: 95, pagespeedFcp: 1.2, pagespeedLcp: 2.5, pagespeedCls: 0.03, hasSsl: true, isMobileResponsive: true, hasViewportMeta: true, detectedCms: null, cmsVersion: null, detectedTechnologies: ["Next.js", "React", "Vercel"], hasGoogleAnalytics: true, hasGoogleTagManager: true, hasFacebookPixel: true, hasCookieBanner: true, hasMetaDescription: true, hasOpenGraph: true, hasStructuredData: true },
  { pagespeedMobile: 75, pagespeedDesktop: 90, pagespeedFcp: 1.6, pagespeedLcp: 3.0, pagespeedCls: 0.06, hasSsl: true, isMobileResponsive: true, hasViewportMeta: true, detectedCms: "WordPress 6.5", cmsVersion: "6.5", detectedTechnologies: ["jQuery", "WordPress", "PHP", "WPBakery"], hasGoogleAnalytics: true, hasGoogleTagManager: false, hasFacebookPixel: false, hasCookieBanner: true, hasMetaDescription: true, hasOpenGraph: true, hasStructuredData: true },
  { pagespeedMobile: 68, pagespeedDesktop: 85, pagespeedFcp: 2.0, pagespeedLcp: 3.5, pagespeedCls: 0.08, hasSsl: true, isMobileResponsive: true, hasViewportMeta: true, detectedCms: "WordPress 6.3", cmsVersion: "6.3", detectedTechnologies: ["jQuery", "WordPress", "PHP"], hasGoogleAnalytics: true, hasGoogleTagManager: false, hasFacebookPixel: false, hasCookieBanner: true, hasMetaDescription: true, hasOpenGraph: true, hasStructuredData: false },
  { pagespeedMobile: 88, pagespeedDesktop: 96, pagespeedFcp: 1.0, pagespeedLcp: 2.2, pagespeedCls: 0.02, hasSsl: true, isMobileResponsive: true, hasViewportMeta: true, detectedCms: null, cmsVersion: null, detectedTechnologies: ["Next.js", "React", "Tailwind CSS", "Vercel"], hasGoogleAnalytics: true, hasGoogleTagManager: true, hasFacebookPixel: true, hasCookieBanner: true, hasMetaDescription: true, hasOpenGraph: true, hasStructuredData: true },
  { pagespeedMobile: 70, pagespeedDesktop: 87, pagespeedFcp: 1.9, pagespeedLcp: 3.3, pagespeedCls: 0.07, hasSsl: true, isMobileResponsive: true, hasViewportMeta: true, detectedCms: "WordPress 6.4", cmsVersion: "6.4", detectedTechnologies: ["jQuery", "WordPress", "PHP", "Contact Form 7"], hasGoogleAnalytics: true, hasGoogleTagManager: false, hasFacebookPixel: false, hasCookieBanner: true, hasMetaDescription: true, hasOpenGraph: true, hasStructuredData: true },
];

// ── Status assignments ─────────────────────────────────

type StatusAssignment = {
  status: 'new' | 'contacted' | 'replied' | 'meeting' | 'won';
  contactedAt?: Date;
  contactMethod?: string;
  repliedAt?: Date;
  meetingAt?: Date;
  closedAt?: Date;
  closedReason?: string;
};

function getStatusAssignment(index: number): StatusAssignment {
  if (index >= 22 && index <= 25) {
    return {
      status: 'contacted',
      contactedAt: new Date('2026-03-28'),
      contactMethod: index % 2 === 0 ? 'email' : 'telefoon',
    };
  }
  if (index === 26 || index === 27) {
    return {
      status: 'replied',
      contactedAt: new Date('2026-03-25'),
      contactMethod: 'email',
      repliedAt: new Date('2026-03-30'),
    };
  }
  if (index === 28) {
    return {
      status: 'meeting',
      contactedAt: new Date('2026-03-20'),
      contactMethod: 'telefoon',
      repliedAt: new Date('2026-03-22'),
      meetingAt: new Date('2026-04-07'),
    };
  }
  if (index === 29) {
    return {
      status: 'won',
      contactedAt: new Date('2026-03-10'),
      contactMethod: 'email',
      repliedAt: new Date('2026-03-12'),
      meetingAt: new Date('2026-03-18'),
      closedAt: new Date('2026-03-25'),
      closedReason: 'Website redesign project — €3.500',
    };
  }
  return { status: 'new' };
}

// ── Main ───────────────────────────────────────────────

async function main() {
  console.log('Deleting existing data...');

  await db.delete(schema.notes);
  await db.delete(schema.statusHistory);
  await db.delete(schema.leadScores);
  await db.delete(schema.leadStatuses);
  await db.delete(schema.auditResults);
  await db.delete(schema.businesses);

  console.log('Existing data deleted');

  // Insert businesses
  console.log('Inserting 30 businesses...');

  const insertedBusinesses = await db
    .insert(schema.businesses)
    .values(
      businessesData.map((b) => ({
        registryId: b.registryId,
        country: 'BE' as const,
        name: b.name,
        legalForm: b.legalForm,
        naceCode: b.naceCode,
        naceDescription: b.naceDescription,
        foundedDate: b.foundedDate,
        street: b.street,
        houseNumber: b.houseNumber,
        postalCode: b.postalCode,
        city: b.city,
        province: b.province,
        website: b.website,
        email: b.email,
        phone: b.phone,
        googleRating: b.googleRating,
        googleReviewCount: b.googleReviewCount,
        dataSource: 'kbo_bulk' as const,
      })),
    )
    .returning();

  console.log(`Inserted ${insertedBusinesses.length} businesses`);

  // Insert audit results (only for businesses WITH website, index 7-29)
  console.log('Inserting audit results...');

  const allAudits = [...poorAudits, ...mediocreAudits, ...decentAudits];
  const businessesWithWebsite = insertedBusinesses.filter((b) => b.website !== null);

  const auditValues = businessesWithWebsite.map((biz, i) => {
    const audit = allAudits[i];
    return {
      businessId: biz.id,
      hasWebsite: true,
      websiteUrl: biz.website,
      websiteHttpStatus: biz.website?.startsWith('http://') ? 301 : 200,
      pagespeedMobileScore: audit.pagespeedMobile,
      pagespeedDesktopScore: audit.pagespeedDesktop,
      pagespeedFcp: audit.pagespeedFcp,
      pagespeedLcp: audit.pagespeedLcp,
      pagespeedCls: audit.pagespeedCls,
      hasSsl: audit.hasSsl,
      isMobileResponsive: audit.isMobileResponsive,
      hasViewportMeta: audit.hasViewportMeta,
      detectedCms: audit.detectedCms,
      cmsVersion: audit.cmsVersion,
      detectedTechnologies: audit.detectedTechnologies,
      serverHeader: null,
      poweredBy: null,
      hasGoogleAnalytics: audit.hasGoogleAnalytics,
      hasGoogleTagManager: audit.hasGoogleTagManager,
      hasFacebookPixel: audit.hasFacebookPixel,
      hasCookieBanner: audit.hasCookieBanner,
      hasMetaDescription: audit.hasMetaDescription,
      hasOpenGraph: audit.hasOpenGraph,
      hasStructuredData: audit.hasStructuredData,
    };
  });

  await db.insert(schema.auditResults).values(auditValues);
  console.log(`Inserted ${auditValues.length} audit results`);

  // Insert lead scores
  console.log('Computing and inserting lead scores...');

  const scoreValues = insertedBusinesses.map((biz, i) => {
    const hasWebsite = biz.website !== null;
    const auditIndex = hasWebsite ? i - 7 : -1;
    const audit = hasWebsite && auditIndex >= 0 ? allAudits[auditIndex] : null;

    const scoreInput = {
      business: {
        website: biz.website,
        foundedDate: biz.foundedDate,
        naceCode: biz.naceCode,
        legalForm: biz.legalForm,
        email: biz.email,
        phone: biz.phone,
        googleRating: biz.googleRating,
        googleReviewCount: biz.googleReviewCount,
        googleBusinessStatus: null,
        googlePhotosCount: null,
        hasGoogleBusinessProfile: null,
        googlePlacesEnrichedAt: null,
        recentReviewCount: null,
        reviewVelocity: null,
        googlePhotosCountPrev: null,
        googleBusinessUpdatedAt: null,
        hasGoogleAds: null,
        hasSocialMediaLinks: null,
        optOut: false,
      },
      audit: audit
        ? {
            websiteHttpStatus: 200,
            pagespeedMobileScore: audit.pagespeedMobile,
            pagespeedDesktopScore: audit.pagespeedDesktop,
            hasSsl: audit.hasSsl,
            isMobileResponsive: audit.isMobileResponsive,
            hasViewportMeta: audit.hasViewportMeta,
            detectedCms: audit.detectedCms,
            detectedTechnologies: audit.detectedTechnologies,
            hasGoogleAnalytics: audit.hasGoogleAnalytics,
            hasGoogleTagManager: audit.hasGoogleTagManager,
            hasFacebookPixel: audit.hasFacebookPixel,
            hasCookieBanner: audit.hasCookieBanner,
            hasMetaDescription: audit.hasMetaDescription,
            hasOpenGraph: audit.hasOpenGraph,
            hasStructuredData: audit.hasStructuredData,
            auditedAt: null,
            hasGoogleAdsTag: null,
            hasSocialMediaLinks: null,
          }
        : null,
    };

    const result = computeScore(scoreInput);

    return {
      businessId: biz.id,
      totalScore: result.totalScore,
      scoreBreakdown: result.breakdown,
    };
  });

  await db.insert(schema.leadScores).values(scoreValues);
  console.log(`Inserted ${scoreValues.length} lead scores`);

  // Insert lead statuses
  console.log('Inserting lead statuses...');

  const statusValues = insertedBusinesses.map((biz, i) => {
    const assignment = getStatusAssignment(i);
    return {
      businessId: biz.id,
      status: assignment.status,
      contactedAt: assignment.contactedAt || null,
      contactMethod: assignment.contactMethod || null,
      repliedAt: assignment.repliedAt || null,
      meetingAt: assignment.meetingAt || null,
      closedAt: assignment.closedAt || null,
      closedReason: assignment.closedReason || null,
    };
  });

  await db.insert(schema.leadStatuses).values(statusValues);
  console.log(`Inserted ${statusValues.length} lead statuses`);

  // Insert notes for non-new leads
  console.log('Inserting notes...');

  const notesData: { businessIndex: number; content: string; createdAt: Date }[] = [
    { businessIndex: 22, content: "Telefonisch contact gehad, interesse in nieuwe website. Huidige site is traag en niet mobiel-friendly.", createdAt: new Date('2026-03-28') },
    { businessIndex: 23, content: "E-mail gestuurd met portfolio en prijzen. Afwachten reactie.", createdAt: new Date('2026-03-28') },
    { businessIndex: 24, content: "Voicemail ingesproken, terugbellen volgende week.", createdAt: new Date('2026-03-28') },
    { businessIndex: 25, content: "E-mail gestuurd, bounced. Nieuw e-mailadres gezocht via website.", createdAt: new Date('2026-03-28') },
    { businessIndex: 26, content: "Positieve reactie ontvangen. Wil graag een voorstel zien voor website redesign.", createdAt: new Date('2026-03-30') },
    { businessIndex: 26, content: "Offerte gestuurd voor €3.500 — volledig redesign + SEO basis.", createdAt: new Date('2026-03-31') },
    { businessIndex: 27, content: "Geinteresseerd maar wil eerst intern overleggen. Follow-up gepland over 2 weken.", createdAt: new Date('2026-03-30') },
    { businessIndex: 28, content: "Telefonisch uitgebreid gesproken. Zeer geinteresseerd. Meeting gepland op 7 april.", createdAt: new Date('2026-03-22') },
    { businessIndex: 28, content: "Voorbereidend audit rapport gemaakt als presentatie voor de meeting.", createdAt: new Date('2026-04-02') },
    { businessIndex: 29, content: "Deal gesloten! Website redesign project voor €3.500. Start volgende maand.", createdAt: new Date('2026-03-25') },
    { businessIndex: 29, content: "Contract getekend. Kick-off meeting gepland op 5 april.", createdAt: new Date('2026-03-27') },
  ];

  const noteValues = notesData.map((n) => ({
    businessId: insertedBusinesses[n.businessIndex].id,
    content: n.content,
    createdAt: n.createdAt,
  }));

  await db.insert(schema.notes).values(noteValues);
  console.log(`Inserted ${noteValues.length} notes`);

  // Insert status history for non-new leads
  console.log('Inserting status history...');

  const historyData: { businessIndex: number; fromStatus: string | null; toStatus: string; changedAt: Date }[] = [
    // Contacted leads
    { businessIndex: 22, fromStatus: 'new', toStatus: 'contacted', changedAt: new Date('2026-03-28') },
    { businessIndex: 23, fromStatus: 'new', toStatus: 'contacted', changedAt: new Date('2026-03-28') },
    { businessIndex: 24, fromStatus: 'new', toStatus: 'contacted', changedAt: new Date('2026-03-28') },
    { businessIndex: 25, fromStatus: 'new', toStatus: 'contacted', changedAt: new Date('2026-03-28') },
    // Replied leads
    { businessIndex: 26, fromStatus: 'new', toStatus: 'contacted', changedAt: new Date('2026-03-25') },
    { businessIndex: 26, fromStatus: 'contacted', toStatus: 'replied', changedAt: new Date('2026-03-30') },
    { businessIndex: 27, fromStatus: 'new', toStatus: 'contacted', changedAt: new Date('2026-03-25') },
    { businessIndex: 27, fromStatus: 'contacted', toStatus: 'replied', changedAt: new Date('2026-03-30') },
    // Meeting lead
    { businessIndex: 28, fromStatus: 'new', toStatus: 'contacted', changedAt: new Date('2026-03-20') },
    { businessIndex: 28, fromStatus: 'contacted', toStatus: 'replied', changedAt: new Date('2026-03-22') },
    { businessIndex: 28, fromStatus: 'replied', toStatus: 'meeting', changedAt: new Date('2026-03-22') },
    // Won lead
    { businessIndex: 29, fromStatus: 'new', toStatus: 'contacted', changedAt: new Date('2026-03-10') },
    { businessIndex: 29, fromStatus: 'contacted', toStatus: 'replied', changedAt: new Date('2026-03-12') },
    { businessIndex: 29, fromStatus: 'replied', toStatus: 'meeting', changedAt: new Date('2026-03-18') },
    { businessIndex: 29, fromStatus: 'meeting', toStatus: 'won', changedAt: new Date('2026-03-25') },
  ];

  const historyValues = historyData.map((h) => ({
    businessId: insertedBusinesses[h.businessIndex].id,
    fromStatus: h.fromStatus,
    toStatus: h.toStatus,
    changedAt: h.changedAt,
  }));

  await db.insert(schema.statusHistory).values(historyValues);
  console.log(`Inserted ${historyValues.length} status history entries`);

  // Summary
  console.log('\nSeed completed!');
  console.log(`  ${insertedBusinesses.length} businesses`);
  console.log(`  ${auditValues.length} audit results`);
  console.log(`  ${scoreValues.length} lead scores`);
  console.log(`  ${statusValues.length} lead statuses`);
  console.log(`  ${noteValues.length} notes`);
  console.log(`  ${historyValues.length} status history entries`);

  // Log score distribution
  const hotLeads = scoreValues.filter((s) => s.totalScore >= 70).length;
  const warmLeads = scoreValues.filter((s) => s.totalScore >= 40 && s.totalScore < 70).length;
  const coldLeads = scoreValues.filter((s) => s.totalScore < 40).length;
  console.log(`\n  Score distribution: ${hotLeads} hot | ${warmLeads} warm | ${coldLeads} cold`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
