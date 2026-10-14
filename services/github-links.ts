import { Platform } from 'react-native';

const KEY = 'cfhub_github_pages_links_v1';
type LinkMap = Record<string, string>;

async function readMap(): Promise<LinkMap> {
  try {
    let raw: string | null;
    if (Platform.OS === 'web') {
      raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    } else {
      const SecureStore = require('expo-secure-store');
      raw = await SecureStore.getItemAsync(KEY);
    }
    const parsed = raw ? JSON.parse(raw) as unknown : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as LinkMap : {};
  } catch {
    return {};
  }
}

async function writeMap(value: LinkMap): Promise<void> {
  const raw = JSON.stringify(value);
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') throw new Error('Browser storage is unavailable.');
    localStorage.setItem(KEY, raw);
    return;
  }
  const SecureStore = require('expo-secure-store');
  await SecureStore.setItemAsync(KEY, raw);
}

/** Local shortcut only: this never changes a repository or Pages deployment configuration. */
export async function getGitHubPagesLink(repositoryFullName: string): Promise<string | null> {
  const links = await readMap();
  return links[repositoryFullName] ?? null;
}

export async function setGitHubPagesLink(repositoryFullName: string, projectName: string | null): Promise<void> {
  const links = await readMap();
  if (projectName?.trim()) links[repositoryFullName] = projectName.trim();
  else delete links[repositoryFullName];
  await writeMap(links);
}
