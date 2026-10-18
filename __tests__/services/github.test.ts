import {
  clearGitHubCredential,
  getGitHubCredential,
  saveGitHubCredential,
  getRepositoryTree,
  getRepositoryFile,
  saveRepositoryFile,
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


describe('GitHub repository workspace APIs', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('loads a recursive branch tree', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sha: 'tree-sha', truncated: false, tree: [{ path: 'src', type: 'tree', sha: 'dir-sha' }, { path: 'src/index.ts', type: 'blob', sha: 'file-sha' }] }),
    });
    global.fetch = fetchMock as any;

    const tree = await getRepositoryTree('owner', 'repo', 'main', 'gho-test');

    expect(tree.tree).toHaveLength(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/git/trees/main?recursive=1');
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe('Bearer gho-test');
  });

  it('decodes a text file and retains its Git blob SHA', async () => {
    const content = 'export const greeting = "hello";';
    const encoded = btoa(content);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'index.ts', path: 'src/index.ts', sha: 'file-sha', size: content.length, type: 'file', encoding: 'base64', content: encoded }),
    }) as any;

    await expect(getRepositoryFile('owner', 'repo', 'src/index.ts', 'main', 'gho-test')).resolves.toMatchObject({
      path: 'src/index.ts',
      sha: 'file-sha',
      content,
    });
  });

  it('commits an edited file through the Contents API', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: { sha: 'new-file-sha', path: 'src/index.ts' }, commit: { sha: 'commit-sha', html_url: 'https://github.com/owner/repo/commit/commit-sha' } }),
    });
    global.fetch = fetchMock as any;

    const saved = await saveRepositoryFile('owner', 'repo', 'src/index.ts', 'main', 'export const answer = 42;', 'Update answer', 'old-file-sha', 'gho-test');
    const request = fetchMock.mock.calls[0];
    const payload = JSON.parse(request[1].body);

    expect(request[1].method).toBe('PUT');
    expect(String(request[0])).toContain('/contents/src/index.ts');
    expect(payload).toMatchObject({ message: 'Update answer', branch: 'main', sha: 'old-file-sha' });
    expect(atob(payload.content)).toBe('export const answer = 42;');
    expect(saved.commit.sha).toBe('commit-sha');
  });
});
