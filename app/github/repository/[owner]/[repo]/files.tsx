import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useTheme } from '@/hooks/use-theme';
import i18n from '@/i18n';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import {
  getGitHubCredential, getRepository, getRepositoryTree, getRepositoryFile,
  saveRepositoryFile, searchRepositoryCode, GitHubRepository, GitHubTreeEntry,
  GitHubCodeSearchItem,
} from '@/services/github';

type FileNode = { name: string; path: string; kind: 'folder' | 'file'; sha?: string; size?: number; children: FileNode[] };
type OpenFile = { path: string; name: string; content: string; originalContent: string; sha?: string; saving?: boolean };
type VisibleNode = { node: FileNode; depth: number };

const isIndonesian = () => i18n.language.toLowerCase().startsWith('id');
const label = (en: string, id: string) => isIndonesian() ? id : en;

const TEXT_EXTENSIONS = new Set([
  'ts','tsx','js','jsx','mjs','cjs','json','md','mdx','html','htm','css','scss','sass','less',
  'xml','svg','yml','yaml','toml','ini','env','example','txt','sh','bash','zsh','ps1','py',
  'rb','go','rs','java','kt','kts','swift','c','h','cpp','hpp','cs','php','sql','graphql',
  'gql','proto','dockerfile','gitignore','gitattributes','editorconfig','properties','gradle',
  'lock','diff','patch','vue','svelte','astro','wasm-text',
]);

function isTextFile(path: string) {
  const name = path.split('/').pop()?.toLowerCase() ?? '';
  if (name.startsWith('.')) return true;
  const ext = name.includes('.') ? name.split('.').pop()! : name;
  return TEXT_EXTENSIONS.has(ext);
}

function buildFileTree(entries: GitHubTreeEntry[]): FileNode[] {
  const roots: FileNode[] = [];
  for (const entry of entries) {
    const parts = entry.path.split('/').filter(Boolean);
    let parentPath = '';
    let siblings = roots;
    parts.forEach((part, index) => {
      const path = parentPath ? `${parentPath}/${part}` : part;
      const last = index === parts.length - 1;
      const isFolder = !last || entry.type === 'tree';
      let node = siblings.find((item) => item.path === path);
      if (!node) {
        node = { name: part, path, kind: isFolder ? 'folder' : 'file', sha: last ? entry.sha : undefined, size: last ? entry.size : undefined, children: [] };
        siblings.push(node);
      } else if (last && !isFolder) {
        node.kind = 'file';
        node.sha = entry.sha;
        node.size = entry.size;
      }
      parentPath = path;
      siblings = node.children;
    });
  }
  const sort = (nodes: FileNode[]) => {
    nodes.sort((a, b) => a.kind !== b.kind ? (a.kind === 'folder' ? -1 : 1) : a.name.localeCompare(b.name));
    nodes.forEach((node) => sort(node.children));
  };
  sort(roots);
  return roots;
}

function flattenVisible(nodes: FileNode[], expanded: Set<string>, depth = 0, output: VisibleNode[] = []): VisibleNode[] {
  for (const node of nodes) {
    output.push({ node, depth });
    if (node.kind === 'folder' && expanded.has(node.path)) flattenVisible(node.children, expanded, depth + 1, output);
  }
  return output;
}

function sizeLabel(size?: number) {
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(1)} KB`;
}

export default function GitHubFilesScreen() {
  const params = useLocalSearchParams<{ owner?: string; repo?: string; branch?: string }>();
  const owner = String(params.owner || '');
  const repo = String(params.repo || '');
  const requestedBranch = String(params.branch || '');
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const [repository, setRepository] = useState<GitHubRepository | null>(null);
  const [branch, setBranch] = useState(requestedBranch);
  const [loadedBranch, setLoadedBranch] = useState('');
  const [tree, setTree] = useState<GitHubTreeEntry[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [fileQuery, setFileQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'files' | 'code'>('files');
  const [codeQuery, setCodeQuery] = useState('');
  const [codeResults, setCodeResults] = useState<GitHubCodeSearchItem[]>([]);
  const [searchingCode, setSearchingCode] = useState(false);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [newPath, setNewPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [treeLoading, setTreeLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const nodes = useMemo(() => buildFileTree(tree), [tree]);
  const visibleNodes = useMemo(() => {
    if (searchMode !== 'files') return [];
    const query = fileQuery.trim().toLowerCase();
    if (query) {
      return tree
        .filter((item) => item.type === 'blob' && item.path.toLowerCase().includes(query))
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((item) => ({ node: { name: item.path.split('/').pop() || item.path, path: item.path, kind: 'file' as const, sha: item.sha, size: item.size, children: [] }, depth: 0 }));
    }
    return flattenVisible(nodes, expanded);
  }, [tree, nodes, expanded, fileQuery, searchMode]);

  const activeFile = openFiles.find((file) => file.path === activePath) ?? null;
  const loadTree = useCallback(async (nextBranch: string, knownRepository?: GitHubRepository) => {
    if (!owner || !repo || !nextBranch.trim()) return;
    setTreeLoading(true);
    setError('');
    try {
      const credential = await getGitHubCredential();
      const [detail, result] = await Promise.all([
        knownRepository ? Promise.resolve(knownRepository) : getRepository(owner, repo, credential?.accessToken ?? null),
        getRepositoryTree(owner, repo, nextBranch.trim(), credential?.accessToken ?? null),
      ]);
      setRepository(detail);
      setTree(result.tree.filter((item) => item.type === 'tree' || item.type === 'blob'));
      setLoadedBranch(nextBranch.trim());
      setBranch(nextBranch.trim());
      if (result.truncated) setError(label('GitHub returned a truncated repository tree. Use file search to find items in the loaded paths.', 'GitHub mengembalikan sebagian struktur repositori. Gunakan pencarian berkas untuk mencari di jalur yang sudah dimuat.'));
      setExpanded((previous) => previous.size ? previous : new Set(result.tree.filter((item) => item.type === 'tree' && !item.path.includes('/')).map((item) => item.path)));
    } catch (e) {
      setError(e instanceof Error ? e.message : label('Could not load repository files. Check repository permissions.', 'Gagal memuat berkas repositori. Periksa izin aksesnya.'));
    } finally {
      setTreeLoading(false);
      setLoading(false);
    }
  }, [owner, repo]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const credential = await getGitHubCredential();
        const detail = await getRepository(owner, repo, credential?.accessToken ?? null);
        if (cancelled) return;
        const initialBranch = requestedBranch || detail.default_branch;
        setRepository(detail);
        setBranch(initialBranch);
        await loadTree(initialBranch, detail);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : label('Could not load repository.', 'Gagal memuat repositori.'));
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [owner, repo, requestedBranch, loadTree]);

  const toggleFolder = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const openFile = async (path: string, sha?: string) => {
    const alreadyOpen = openFiles.find((file) => file.path === path);
    if (alreadyOpen) {
      setActivePath(path);
      setCommitMessage(`Update ${path.split('/').pop()}`);
      return;
    }
    setError('');
    setSaving(false);
    try {
      const credential = await getGitHubCredential();
      const remote = await getRepositoryFile(owner, repo, path, loadedBranch || branch, credential?.accessToken ?? null);
      const next: OpenFile = { path, name: remote.name, content: remote.content, originalContent: remote.content, sha: remote.sha };
      setOpenFiles((current) => [...current, next]);
      setActivePath(path);
      setCommitMessage(`Update ${remote.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open this file. It may be binary or too large to edit.');
    }
  };

  const createDraft = () => {
    const path = newPath.trim().replace(/^\/+/, '');
    if (!path || path.split('/').some((part) => !part || part === '.' || part === '..')) {
      setError(label('Enter a valid relative file path, e.g. src/example.ts.', 'Masukkan jalur relatif yang valid, misalnya src/contoh.ts.'));
      return;
    }
    if (openFiles.some((file) => file.path === path) || tree.some((item) => item.path === path)) {
      setError(label('A file with that path already exists.', 'Berkas dengan jalur tersebut sudah ada.'));
      return;
    }
    const name = path.split('/').pop() || path;
    setOpenFiles((current) => [...current, { path, name, content: '', originalContent: '' }]);
    setActivePath(path);
    setCommitMessage(`Create ${name}`);
    setNewPath('');
    setError('');
  };

  const updateActiveContent = (content: string) => {
    setOpenFiles((current) => current.map((file) => file.path === activePath ? { ...file, content } : file));
  };

  const closeTab = (path: string) => {
    const file = openFiles.find((item) => item.path === path);
    if (file && file.content !== file.originalContent) {
      Alert.alert(label('Unsaved changes', 'Perubahan belum disimpan'), label(`Discard edits to ${file.name}?`, `Buang perubahan pada ${file.name}?`), [
        { text: label('Keep editing', 'Lanjut mengedit'), style: 'cancel' },
        { text: label('Discard', 'Buang'), style: 'destructive', onPress: () => removeTab(path) },
      ]);
    } else removeTab(path);
  };

  const removeTab = (path: string) => {
    setOpenFiles((current) => {
      const index = current.findIndex((file) => file.path === path);
      const next = current.filter((file) => file.path !== path);
      if (activePath === path) setActivePath(next[Math.max(0, index - 1)]?.path || '');
      return next;
    });
  };

  const saveActiveFile = async () => {
    if (!activeFile || saving) return;
    if (!loadedBranch) {
      setError(label('Select and load a branch before committing.', 'Pilih dan muat branch sebelum membuat commit.'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const credential = await getGitHubCredential();
      const result = await saveRepositoryFile(
        owner, repo, activeFile.path, loadedBranch, activeFile.content,
        commitMessage.trim() || `Update ${activeFile.name}`, activeFile.sha, credential?.accessToken ?? null,
      );
      setOpenFiles((current) => current.map((file) => file.path === activeFile.path
        ? { ...file, sha: result.content?.sha ?? file.sha, originalContent: file.content, saving: false }
        : file));
      if (!tree.some((item) => item.path === activeFile.path)) {
        setTree((current) => [...current, { path: activeFile.path, mode: '100644', type: 'blob', sha: result.content?.sha ?? '', size: activeFile.content.length }]);
      }
      setError('');
      Alert.alert(label('Committed to GitHub', 'Berhasil commit ke GitHub'), `${activeFile.path}\n\nCommit: ${result.commit.sha.slice(0, 7)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : label('Could not commit this file. Check the app’s Contents: write permission and branch protection rules.', 'Gagal membuat commit. Periksa izin Contents: write pada GitHub App dan aturan proteksi branch.'));
    } finally {
      setSaving(false);
    }
  };

  const runCodeSearch = async () => {
    const query = codeQuery.trim();
    if (!query) return;
    setSearchingCode(true);
    setError('');
    try {
      const credential = await getGitHubCredential();
      setCodeResults(await searchRepositoryCode(owner, repo, query, credential?.accessToken ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : label('Code search failed. Check GitHub authorization and search query.', 'Pencarian kode gagal. Periksa otorisasi GitHub dan kata pencarian.'));
    } finally {
      setSearchingCode(false);
    }
  };

  const openStackBlitz = () => {
    const url = `https://stackblitz.com/github/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    router.push({ pathname: '/github/browser', params: { url, landscape: '1' } } as any);
  };

  const renderTreeNode = ({ node, depth }: VisibleNode) => {
    const isActive = activePath === node.path;
    const isOpen = expanded.has(node.path);
    return (
      <TouchableOpacity
        key={node.path}
        onPress={() => node.kind === 'folder' ? toggleFolder(node.path) : void openFile(node.path, node.sha)}
        activeOpacity={0.7}
        style={[styles.treeRow, { paddingLeft: Spacing.sm + depth * 14, backgroundColor: isActive ? colors.primary + '18' : 'transparent' }]}
      >
        <Icon name={node.kind === 'folder' ? (isOpen ? 'folder-open' : 'folder') : 'file-text'} size={16} color={node.kind === 'folder' ? colors.primary : colors.textSecondary} />
        <Text numberOfLines={1} style={[styles.treeLabel, { color: isActive ? colors.primary : colors.text }]}>{node.name}</Text>
        {node.kind === 'file' && node.size ? <Text style={[styles.fileSize, { color: colors.textTertiary }]}>{sizeLabel(node.size)}</Text> : null}
      </TouchableOpacity>
    );
  };

  const treePane = (
    <View style={[styles.treePane, { borderColor: colors.borderLight, backgroundColor: colors.surface, width: wide ? 290 : undefined, height: wide ? undefined : 225 }]}>
      <View style={[styles.paneHeader, { borderBottomColor: colors.borderLight }]}>
        <Text style={[styles.paneTitle, { color: colors.text }]}>Explorer</Text>
        <Text style={[styles.fileCount, { color: colors.textTertiary }]}>{tree.filter((item) => item.type === 'blob').length} files</Text>
      </View>
      <View style={styles.createRow}>
        <TextInput
          value={newPath}
          onChangeText={setNewPath}
          onSubmitEditing={createDraft}
          placeholder="New file: src/example.ts"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.smallInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
          accessibilityLabel="New file path"
        />
        <TouchableOpacity onPress={createDraft} style={[styles.squareButton, { backgroundColor: colors.surfaceSecondary }]} accessibilityRole="button" accessibilityLabel="Create file tab">
          <Icon name="plus" size={17} color={colors.primary} />
        </TouchableOpacity>
      </View>
      {searchMode === 'files' ? (
        <>
          <TextInput
            value={fileQuery}
            onChangeText={setFileQuery}
            placeholder="Find a file or folder…"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.searchInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
            accessibilityLabel="Find repository file"
          />
          {treeLoading ? <ActivityIndicator style={{ margin: Spacing.md }} color={colors.primary} /> : (
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
              {visibleNodes.map(renderTreeNode)}
              {!visibleNodes.length ? <Text style={[styles.empty, { color: colors.textTertiary }]}>No files found.</Text> : null}
            </ScrollView>
          )}
        </>
      ) : (
        <>
          <TextInput
            value={codeQuery}
            onChangeText={setCodeQuery}
            onSubmitEditing={() => void runCodeSearch()}
            placeholder="Search text or symbol…"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.searchInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
            accessibilityLabel="Search code in repository"
          />
          <TouchableOpacity onPress={() => void runCodeSearch()} style={[styles.searchAction, { backgroundColor: colors.primary }]} disabled={searchingCode}>
            {searchingCode ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="search" size={15} color="#fff" />}
            <Text style={styles.searchActionText}>Search code</Text>
          </TouchableOpacity>
          <ScrollView style={{ flex: 1 }}>
            {codeResults.map((item) => (
              <TouchableOpacity key={item.sha + item.path} onPress={() => { setSearchMode('files'); setFileQuery(item.path); void openFile(item.path); }} style={[styles.resultRow, { borderBottomColor: colors.borderLight }]}>
                <Icon name="file-text" size={15} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resultTitle, { color: colors.text }]}>{item.path.split('/').pop()}</Text>
                  <Text numberOfLines={1} style={[styles.resultPath, { color: colors.textSecondary }]}>{item.path}</Text>
                  {item.text_matches?.[0]?.fragment ? <Text numberOfLines={2} style={[styles.resultPath, { color: colors.textTertiary }]}>{item.text_matches[0].fragment.trim()}</Text> : null}
                </View>
              </TouchableOpacity>
            ))}
            {!searchingCode && codeQuery && !codeResults.length ? <Text style={[styles.empty, { color: colors.textTertiary }]}>No matching code found.</Text> : null}
          </ScrollView>
        </>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: repository ? `${repository.name} · Code` : 'Repository files', headerShown: true }} />
      <View style={[styles.topbar, { borderBottomColor: colors.borderLight }]}>
        <View style={{ flex: 1, minWidth: 90 }}>
          <Text numberOfLines={1} style={[styles.repositoryName, { color: colors.text }]}>{owner}/{repo}</Text>
          <Text style={[styles.fileCount, { color: colors.textSecondary }]}>{loadedBranch || label('Loading branch…', 'Memuat branch…')}</Text>
        </View>
        <TouchableOpacity onPress={() => setSearchMode((mode) => mode === 'files' ? 'code' : 'files')} style={[styles.squareButton, { backgroundColor: searchMode === 'code' ? colors.primary + '25' : colors.surfaceSecondary }]} accessibilityLabel="Toggle code search">
          <Icon name="search" size={18} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={openStackBlitz} style={[styles.stackBlitz, { backgroundColor: colors.primary }]} accessibilityRole="button">
          <Icon name="external-link" size={16} color="#fff" />
          <Text style={styles.stackBlitzText}>StackBlitz</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.branchBar, { borderBottomColor: colors.borderLight }]}>
        <Icon name="git-branch" size={15} color={colors.textSecondary} />
        <TextInput value={branch} onChangeText={setBranch} onSubmitEditing={() => void loadTree(branch)} placeholder="Branch" placeholderTextColor={colors.textTertiary} autoCapitalize="none" autoCorrect={false} style={[styles.branchInput, { color: colors.text }]} accessibilityLabel="Branch name" />
        <TouchableOpacity onPress={() => void loadTree(branch)} style={styles.branchLoad} accessibilityLabel="Load branch">
          {treeLoading ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="refresh" size={16} color={colors.primary} />}
        </TouchableOpacity>
      </View>
      {error ? <TouchableOpacity onPress={() => setError('')} style={[styles.errorBanner, { backgroundColor: colors.error + '14' }]}><Text style={{ color: colors.error, fontSize: FontSize.xs }}>{error}  ·  Tap to dismiss</Text></TouchableOpacity> : null}
      {loading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.textSecondary, marginTop: Spacing.sm }}>Loading repository tree…</Text></View> : (
        <View style={[styles.workspace, wide ? styles.workspaceWide : styles.workspaceNarrow]}>
          {treePane}
          <View style={styles.editorPane}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabs, { borderBottomColor: colors.borderLight }]} contentContainerStyle={{ alignItems: 'stretch' }}>
              {openFiles.map((file) => (
                <View key={file.path} style={[styles.editorTab, { backgroundColor: activePath === file.path ? colors.surface : colors.surfaceSecondary, borderColor: activePath === file.path ? colors.primary : colors.borderLight }]}>
                  <TouchableOpacity onPress={() => { setActivePath(file.path); setCommitMessage(`Update ${file.name}`); }} style={styles.tabOpen}>
                    <Icon name="file-text" size={14} color={activePath === file.path ? colors.primary : colors.textSecondary} />
                    <Text numberOfLines={1} style={[styles.tabLabel, { color: colors.text }]}>{file.name}{file.content !== file.originalContent ? ' •' : ''}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => closeTab(file.path)} accessibilityLabel={`Close ${file.name}`} style={styles.tabClose}><Icon name="close" size={13} color={colors.textSecondary} /></TouchableOpacity>
                </View>
              ))}
              {!openFiles.length ? <Text style={[styles.emptyTab, { color: colors.textTertiary }]}>Open a file from the explorer to start editing</Text> : null}
            </ScrollView>
            {activeFile ? (
              <>
                <View style={[styles.editorHeader, { borderBottomColor: colors.borderLight }]}>
                  <Text numberOfLines={1} style={[styles.filePath, { color: colors.textSecondary }]}>{activeFile.path}</Text>
                  <Text style={[styles.dirtyState, { color: activeFile.content !== activeFile.originalContent ? colors.warning : colors.success }]}>{activeFile.content !== activeFile.originalContent ? label('Modified', 'Diubah') : label('Saved', 'Tersimpan')}</Text>
                </View>
                <TextInput
                  value={activeFile.content}
                  onChangeText={updateActiveContent}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  textAlignVertical="top"
                  selectTextOnFocus={false}
                  style={[styles.codeEditor, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.borderLight }]}
                  placeholder="File content…"
                  placeholderTextColor={colors.textTertiary}
                  accessibilityLabel={`Editor for ${activeFile.path}`}
                />
                <View style={[styles.commitPanel, { borderTopColor: colors.borderLight }]}>
                  <TextInput value={commitMessage} onChangeText={setCommitMessage} placeholder="Commit message" placeholderTextColor={colors.textTertiary} style={[styles.commitInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]} accessibilityLabel="Commit message" />
                  <Button
                    title={saving ? label('Committing…', 'Membuat commit…') : activeFile.sha ? label('Commit file', 'Commit berkas') : label('Create file', 'Buat berkas')}
                    onPress={() => void saveActiveFile()}
                    disabled={saving || activeFile.content === activeFile.originalContent || !commitMessage.trim()}
                    size="sm"
                    icon={saving ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="check-circle" size={16} color="#fff" />}
                  />
                </View>
              </>
            ) : (
              <View style={styles.noFile}>
                <Icon name="code" size={36} color={colors.textTertiary} />
                <Text style={[styles.noFileTitle, { color: colors.text }]}>Repository workspace</Text>
                <Text style={[styles.noFileText, { color: colors.textSecondary }]}>Browse folders, search for a file or symbol, then open files as tabs. Edit and commit each file without leaving CF-Hub.</Text>
                <Button title="Open on GitHub" variant="secondary" onPress={() => router.push({ pathname: '/github/browser', params: { url: `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(loadedBranch)}` } } as any)} />
              </View>
            )}
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  topbar: { minHeight: 54, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  repositoryName: { fontSize: FontSize.md, fontWeight: '700' },
  branchBar: { minHeight: 38, paddingHorizontal: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  branchInput: { flex: 1, minWidth: 60, height: 36, fontSize: FontSize.sm },
  branchLoad: { width: 34, height: 34, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  stackBlitz: { minHeight: 38, borderRadius: Radius.full, paddingHorizontal: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: 6 },
  stackBlitzText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '700' },
  squareButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
  errorBanner: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  workspace: { flex: 1, minHeight: 0 },
  workspaceWide: { flexDirection: 'row' },
  workspaceNarrow: { flexDirection: 'column' },
  treePane: { borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 0, overflow: 'hidden' },
  paneHeader: { paddingHorizontal: Spacing.md, height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  paneTitle: { fontSize: FontSize.sm, fontWeight: '700' },
  fileCount: { fontSize: 10 },
  createRow: { flexDirection: 'row', gap: 6, padding: 7 },
  smallInput: { flex: 1, minWidth: 0, height: 34, paddingHorizontal: 9, fontSize: 11, borderRadius: Radius.sm, borderWidth: 1 },
  searchInput: { marginHorizontal: 7, marginBottom: 6, height: 34, paddingHorizontal: 9, borderRadius: Radius.sm, borderWidth: 1, fontSize: 11 },
  searchAction: { marginHorizontal: 7, marginBottom: 6, minHeight: 31, borderRadius: Radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  searchActionText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  treeRow: { minHeight: 32, paddingVertical: 6, paddingRight: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 7 },
  treeLabel: { flex: 1, fontSize: 11 },
  fileSize: { fontSize: 9 },
  resultRow: { paddingHorizontal: 9, paddingVertical: 9, flexDirection: 'row', gap: 7, borderBottomWidth: StyleSheet.hairlineWidth },
  resultTitle: { fontSize: 11, fontWeight: '600' },
  resultPath: { fontSize: 10, marginTop: 2 },
  empty: { padding: Spacing.md, fontSize: FontSize.xs },
  editorPane: { flex: 1, minHeight: 0 },
  tabs: { maxHeight: 40, borderBottomWidth: StyleSheet.hairlineWidth },
  editorTab: { minWidth: 110, maxWidth: 170, marginHorizontal: 2, marginVertical: 3, borderWidth: 1, borderRadius: Radius.sm, flexDirection: 'row', alignItems: 'center' },
  tabOpen: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 8, paddingRight: 2, height: 31 },
  tabLabel: { flexShrink: 1, fontSize: 10, fontWeight: '600' },
  tabClose: { width: 24, height: 29, alignItems: 'center', justifyContent: 'center' },
  emptyTab: { paddingHorizontal: Spacing.md, alignSelf: 'center', fontSize: FontSize.xs },
  editorHeader: { height: 30, paddingHorizontal: Spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  filePath: { flex: 1, minWidth: 0, fontSize: 10 },
  dirtyState: { fontSize: 10, fontWeight: '600' },
  codeEditor: { flex: 1, minHeight: 120, padding: Spacing.md, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, lineHeight: 18, textAlignVertical: 'top', borderWidth: StyleSheet.hairlineWidth },
  commitPanel: { padding: Spacing.sm, gap: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  commitInput: { height: 38, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, fontSize: FontSize.sm },
  noFile: { flex: 1, padding: Spacing.xl, gap: Spacing.md, justifyContent: 'center', alignItems: 'center' },
  noFileTitle: { fontSize: FontSize.lg, fontWeight: '700' },
  noFileText: { fontSize: FontSize.sm, lineHeight: 21, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
