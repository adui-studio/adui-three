export const repository: string;
export const recipeIds: readonly string[];
export const sdkArchive: string;
export const projectTSConfig: string;
export function projectManifest(id: string, language: string): string;
export function projectHTML(language: string): string;
export function projectReadme(id: string, language: string): string;
export function recipeTextFiles(id: string, language: string): Promise<Record<string, string>>;
export function createRecipeArchive(
  id: string,
  language: string,
  sdk: Uint8Array,
): Promise<Uint8Array>;
