import { Platform } from 'react-native';

export const GITHUB_API = 'https://api.github.com';
export const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
export const GITHUB_ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
export const GITHUB_CLIENT_ID = (process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID ?? '').trim();

const CREDENTIAL_KEY = 'cfhub_github_credential_v1';

export interface GitHubCredential {
  accessToken: string;
  expiresAt: number | null;
  username?: string;
}

export interface GitHubViewer {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  public_repos: number;
  total_private_repos?: number;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  fork: boolean;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
  updated_at: string;
  pushed_at: string;
  owner: { login: string; avatar_url: string; html_url: string };
}

export interface GitHubLabel {
  name: string;
  color: string;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  comments: number;
  user: { login: string; avatar_url: string };
  labels: GitHubLabel[];
  pull_request?: { url: string };
  repository_url?: string;
}

export interface GitHubPullRequest extends GitHubIssue {
  draft?: boolean;
  merged_at?: string | null;
  head?: { ref: string };
  base?: { ref: string };
}

export interface GitHubCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author?: { name: string; date: string } | null;
  };
  author?: { login: string; avatar_url: string } | null;
}

export interface DeviceAuthorization {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

export type DevicePollResult =
  | { status: 'connected'; credential: GitHubCredential }
  | { status: 'pending' | 'slow_down' }
  | { status: 'expired' | 'denied' | 'error'; message: string };

async function storageGet(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    const SecureStore = require('expo-secure-store');
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function storageSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') throw new Error('Browser storage is unavailable.');
    localStorage.setItem(key, value);
    return;
  }
  const SecureStore = require('expo-secure-store');
  await SecureStore.setItemAsync(key, value);
}

async function storageDelete(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    return;
  }
  const SecureStore = require('expo-secure-store');
  await SecureStore.deleteItemAsync(key);
}

export async function getGitHubCredential(): Promise<GitHubCredential | null> {
  const raw = await storageGet(CREDENTIAL_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as GitHubCredential;
    if (!value.accessToken || typeof value.accessToken !== 'string') return null;
    if (value.expiresAt && value.expiresAt <= Date.now()) {
      await clearGitHubCredential();
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export async function getGitHubToken(): Promise<string | null> {
  return (await getGitHubCredential())?.accessToken ?? null;
}

export async function saveGitHubCredential(credential: GitHubCredential): Promise<void> {
  await storageSet(CREDENTIAL_KEY, JSON.stringify(credential));
}

export async function clearGitHubCredential(): Promise<void> {
  await storageDelete(CREDENTIAL_KEY);
}

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const value = payload as { message?: unknown; error_description?: unknown; error?: unknown };
    if (typeof value.message === 'string') return value.message;
    if (typeof value.error_description === 'string') return value.error_description;
    if (typeof value.error === 'string') return value.error.replaceAll('_', ' ');
  }
  return fallback;
}

export async function githubRequest<T>(
  path: string,
  tokenOverride?: string | null,
): Promise<T> {
  const token = tokenOverride === undefined ? await getGitHubToken() : tokenOverride;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(path.startsWith('http') ? path : `${GITHUB_API}${path}`, { headers });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const fallback = response.status === 401
      ? 'GitHub authorization expired or was rejected. Connect again.'
      : response.status === 403
        ? 'GitHub denied this request. Check app permissions or API rate limits.'
        : `GitHub request failed (${response.status}).`;
    throw new Error(errorMessage(payload, fallback));
  }
  return payload as T;
}

export function getGitHubViewer(token?: string | null): Promise<GitHubViewer> {
  return githubRequest<GitHubViewer>('/user', token);
}

export function listMyRepositories(token?: string | null): Promise<GitHubRepository[]> {
  return githubRequest<GitHubRepository[]>(
    '/user/repos?per_page=50&sort=updated&direction=desc&affiliation=owner,collaborator,organization_member',
    token,
  );
}

export async function searchPublicRepositories(
  query: string,
  token?: string | null,
): Promise<GitHubRepository[]> {
  const result = await githubRequest<{ items: GitHubRepository[] }>(
    `/search/repositories?q=${encodeURIComponent(query)}&sort=updated&per_page=20`,
    token,
  );
  return result.items ?? [];
}

export async function listMyIssues(login: string, token?: string | null): Promise<GitHubIssue[]> {
  const result = await githubRequest<{ items: GitHubIssue[] }>(
    `/search/issues?q=${encodeURIComponent(`is:issue is:open involves:${login}`)}&sort=updated&order=desc&per_page=30`,
    token,
  );
  return result.items ?? [];
}

export async function listMyPullRequests(login: string, token?: string | null): Promise<GitHubPullRequest[]> {
  const result = await githubRequest<{ items: GitHubPullRequest[] }>(
    `/search/issues?q=${encodeURIComponent(`is:pr is:open involves:${login}`)}&sort=updated&order=desc&per_page=30`,
    token,
  );
  return result.items ?? [];
}

export function getRepository(owner: string, repo: string, token?: string | null): Promise<GitHubRepository> {
  return githubRequest<GitHubRepository>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, token);
}

export async function listRepositoryIssues(owner: string, repo: string, token?: string | null): Promise<GitHubIssue[]> {
  const result = await githubRequest<GitHubIssue[]>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=open&sort=updated&direction=desc&per_page=30`,
    token,
  );
  return result.filter((item) => !item.pull_request);
}

export function listRepositoryPullRequests(owner: string, repo: string, token?: string | null): Promise<GitHubPullRequest[]> {
  return githubRequest<GitHubPullRequest[]>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=open&sort=updated&direction=desc&per_page=30`,
    token,
  );
}

export function listRepositoryCommits(owner: string, repo: string, token?: string | null): Promise<GitHubCommit[]> {
  return githubRequest<GitHubCommit[]>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=30`,
    token,
  );
}

export async function startGitHubDeviceAuthorization(clientId = GITHUB_CLIENT_ID): Promise<DeviceAuthorization> {
  if (!clientId) {
    throw new Error('Set EXPO_PUBLIC_GITHUB_CLIENT_ID after creating the GitHub App and enabling Device Flow.');
  }
  const response = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId }).toString(),
  });
  const payload = await response.json() as DeviceAuthorization & { error?: string; error_description?: string };
  if (!response.ok || !payload.device_code || !payload.user_code) {
    throw new Error(errorMessage(payload, 'Could not start GitHub authorization.'));
  }
  return payload;
}

export async function pollGitHubDeviceAuthorization(
  deviceCode: string,
  clientId = GITHUB_CLIENT_ID,
): Promise<DevicePollResult> {
  if (!clientId) return { status: 'error', message: 'GitHub App Client ID is not configured.' };
  const response = await fetch(GITHUB_ACCESS_TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }).toString(),
  });
  const payload = await response.json() as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (payload.access_token) {
    return {
      status: 'connected',
      credential: {
        accessToken: payload.access_token,
        expiresAt: payload.expires_in ? Date.now() + payload.expires_in * 1000 : null,
      },
    };
  }
  switch (payload.error) {
    case 'authorization_pending': return { status: 'pending' };
    case 'slow_down': return { status: 'slow_down' };
    case 'expired_token': return { status: 'expired', message: 'The device code expired. Start the connection again.' };
    case 'access_denied': return { status: 'denied', message: 'Authorization was denied on GitHub.' };
    default:
      return { status: 'error', message: errorMessage(payload, `GitHub authorization failed (${response.status}).`) };
  }
}
