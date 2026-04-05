export interface ImportProfileFilters {
  naceTier1?: string[];
  naceWhitelist?: string[];
  naceBlacklist?: string[];
  legalFormInclude?: string[];
  legalFormExclude?: string[];
  provinces?: string[];
  hasWebsite?: boolean | null;
  hasEmail?: boolean | null;
  hasPhone?: boolean | null;
  minPreScore?: number;
  postalCodes?: string[];
  foundedBefore?: string;
  excludeBlacklisted?: boolean;
  excludeUnreachable?: boolean;
}
