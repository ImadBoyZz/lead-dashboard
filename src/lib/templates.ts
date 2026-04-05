interface TemplateContext {
  bedrijfsnaam: string;
  stad: string;
  nace_sector: string;
  website: string;
  postcode: string;
  score: number;
}

export function renderTemplate(template: string, context: TemplateContext): string {
  let result = template;
  for (const [key, value] of Object.entries(context)) {
    result = result.replaceAll(`{{${key}}}`, String(value ?? ''));
  }
  return result;
}

export function extractVariables(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.slice(2, -2)))];
}
