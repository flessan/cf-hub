import {
  clearGitHubCredential,
  getGitHubCredential,
  saveGitHubCredential,
} from '@/services/github';

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

describe('GitHub credential storage', () => {
  const values: Record<string, string> = {};
  beforeEach(() => {
    Object.keys(values).forEach((key) => delete values[key]);
    (global as any).localStorage = {
      getItem: (key: string) => values[key] ?? null,
      setItem: (key: string, value: string) => { values[key] = value; },
      removeItem: (key: string) => { delete values[key]; },
    };
  });

  afterEach(() => {
    delete (global as any).localStorage;
  });

  it('stores and reads an access token credential', async () => {
    await saveGitHubCredential({ accessToken: 'gho-test-token', expiresAt: null, username: 'octocat' });
    await expect(getGitHubCredential()).resolves.toEqual({
      accessToken: 'gho-test-token',
      expiresAt: null,
      username: 'octocat',
    });
  });

  it('removes expired credentials instead of returning them', async () => {
    values['cfhub_github_credential_v1'] = JSON.stringify({
      accessToken: 'expired-token',
      expiresAt: Date.now() - 1000,
    });
    await expect(getGitHubCredential()).resolves.toBeNull();
    expect(values['cfhub_github_credential_v1']).toBeUndefined();
  });

  it('clears stored credentials on disconnect', async () => {
    await saveGitHubCredential({ accessToken: 'gho-test-token', expiresAt: null });
    await clearGitHubCredential();
    await expect(getGitHubCredential()).resolves.toBeNull();
  });
});
