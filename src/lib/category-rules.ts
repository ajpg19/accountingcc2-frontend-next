// Deterministic keyword -> category matching for auto-classifying movements.
//
// Each category owns its keywords (the `keywords` text[] column, see migration
// 0011), so rules belong to the category by its real id and are edited from the
// categories nomenclator form. This module only does the matching against
// categories already loaded from the database.
//
// When a movement's concept/merchant text contains one of a category's
// keywords, that category is assigned directly, without asking the AI — the
// ground truth for known recurring payees (utilities, insurers, mortgage, ...).

// Lowercase + strip accents so matching is tolerant to how the bank writes it.
export function normalizeKeyword(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Resolves the category id for the given text from the categories' keywords,
// or "". Longer keywords win, so a more specific rule takes precedence over a
// shorter one that also matches.
export function matchCategoryId(
  text: string,
  categories: { id: string; keywords?: string[] | null }[]
): string {
  const haystack = normalizeKeyword(text);
  if (!haystack) return "";

  let bestId = "";
  let bestLen = 0;
  for (const cat of categories) {
    for (const kw of cat.keywords ?? []) {
      const needle = normalizeKeyword(kw);
      if (needle && needle.length > bestLen && haystack.includes(needle)) {
        bestId = cat.id;
        bestLen = needle.length;
      }
    }
  }
  return bestId;
}
