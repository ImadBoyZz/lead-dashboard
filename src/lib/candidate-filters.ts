import { and, eq, inArray, sql, gte, isNull, isNotNull } from 'drizzle-orm';
import { kboCandidates } from './db/schema';
import type { ImportProfileFilters } from './types/import-profile';
import { NACE_BLACKLIST_PREFIXES } from './nace-config';

export function buildCandidateFilters(filters: ImportProfileFilters) {
  const conditions = [
    eq(kboCandidates.status, 'pending'),
    eq(kboCandidates.enterpriseStatus, 'AC'),
  ];

  if (filters.provinces?.length) {
    conditions.push(inArray(kboCandidates.province, filters.provinces));
  }

  if (filters.hasWebsite === true) {
    conditions.push(isNotNull(kboCandidates.website));
  } else if (filters.hasWebsite === false) {
    conditions.push(isNull(kboCandidates.website));
  }

  if (filters.minPreScore) {
    conditions.push(gte(kboCandidates.preScore, filters.minPreScore));
  }

  // NACE whitelist — alleen deze sectoren toelaten (NACE code verplicht)
  if (filters.naceWhitelist?.length) {
    const orClauses = filters.naceWhitelist
      .map(prefix => sql`${kboCandidates.naceCode} LIKE ${prefix + '%'}`)
    conditions.push(
      sql`(${kboCandidates.naceCode} IS NOT NULL AND (${sql.join(orClauses, sql` OR `)}))`
    );
  }

  // NACE blacklist — deze sectoren uitsluiten
  if (filters.naceBlacklist?.length) {
    for (const prefix of filters.naceBlacklist) {
      conditions.push(
        sql`(${kboCandidates.naceCode} IS NULL OR ${kboCandidates.naceCode} NOT LIKE ${prefix + '%'})`
      );
    }
  }

  if (filters.legalFormExclude?.length) {
    for (const form of filters.legalFormExclude) {
      conditions.push(
        sql`(${kboCandidates.legalForm} IS NULL OR ${kboCandidates.legalForm} != ${form})`
      );
    }
  }

  if (filters.postalCodes?.length) {
    conditions.push(inArray(kboCandidates.postalCode, filters.postalCodes));
  }

  if (filters.foundedBefore) {
    conditions.push(
      sql`(${kboCandidates.foundedDate} IS NOT NULL AND ${kboCandidates.foundedDate} < ${filters.foundedBefore})`
    );
  }

  if (filters.excludeBlacklisted) {
    for (const prefix of NACE_BLACKLIST_PREFIXES) {
      conditions.push(
        sql`(${kboCandidates.naceCode} IS NULL OR ${kboCandidates.naceCode} NOT LIKE ${prefix + '%'})`
      );
    }
  }

  if (filters.excludeUnreachable) {
    conditions.push(
      sql`NOT (${kboCandidates.email} IS NULL AND ${kboCandidates.phone} IS NULL AND ${kboCandidates.website} IS NULL)`
    );
  }

  return and(...conditions);
}
