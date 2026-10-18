/** Every string is written once as [English, Russian, Chinese]. */
export type L = readonly [string, string, string];
export type Tree = { readonly [key: string]: L | readonly L[] | Tree };

export const langs = ["en", "ru", "zh"] as const;
export type Lang = (typeof langs)[number];

function isLeaf(value: unknown): value is L {
  return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "string");
}

export function pick(tree: Tree, index: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tree)) {
    if (isLeaf(value)) out[key] = value[index];
    else if (Array.isArray(value)) out[key] = (value as readonly L[]).map((item) => item[index]);
    else out[key] = pick(value as Tree, index);
  }
  return out;
}

/**
 * Plural forms for i18next (`key_one`, `key_few`, `key_many`, `key_other`).
 * English uses one/other, Russian one/few/many, Chinese other.
 */
export function pl(key: string, en: [string, string], ru: [string, string, string], zh: string): Record<string, L> {
  return {
    [`${key}_one`]: [en[0], ru[0], zh],
    [`${key}_few`]: [en[1], ru[1], zh],
    [`${key}_many`]: [en[1], ru[2], zh],
    [`${key}_other`]: [en[1], ru[1], zh],
  };
}
