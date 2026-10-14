import { useCallback, useEffect, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { Icon } from '@/components/ui/icon';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useTheme } from '@/hooks/use-theme';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import {
  getGitHubCredential, getRepository, listRepositoryCommits, listRepositoryIssues,
  listRepositoryPullRequests, GitHubCommit, GitHubIssue, GitHubPullRequest, GitHubRepository,
} from '@/services/github';
import { getGitHubPagesLink, setGitHubPagesLink } from '@/services/github-links';

type DetailTab = 'overview' | 'issues' | 'pulls' | 'commits';
const tabs: { key: DetailTab; label: string; icon: 'code' | 'rule' | 'git-pull-request' | 'activity' }[] = [
  { key: 'overview', label: 'Overview', icon: 'code' },
  { key: 'issues', label: 'Issues', icon: 'rule' },
  { key: 'pulls', label: 'Pull requests', icon: 'git-pull-request' },
  { key: 'commits', label: 'Commits', icon: 'activity' },
];

export default function GitHubRepositoryScreen() {
  const { owner, repo } = useLocalSearchParams<{ owner: string; repo: string }>();
  const ownerName = String(owner || '');
  const repoName = String(repo || '');
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [repository, setRepository] = useState<GitHubRepository | null>(null);
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [pulls, setPulls] = useState<GitHubPullRequest[]>([]);
  const [commits, setCommits] = useState<GitHubCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [linkedProject, setLinkedProject] = useState('');
  const [projectDraft, setProjectDraft] = useState('');
  const [linkMessage, setLinkMessage] = useState('');

  const load = useCallback(async () => {
    if (!ownerName || !repoName) return;
    setLoading(true);
    setError('');
    try {
      const credential = await getGitHubCredential();
      const token = credential?.accessToken ?? null;
      const [detail, issueData, pullData, commitData] = await Promise.all([
        getRepository(ownerName, repoName, token),
        listRepositoryIssues(ownerName, repoName, token),
        listRepositoryPullRequests(ownerName, repoName, token),
        listRepositoryCommits(ownerName, repoName, token),
      ]);
      setRepository(detail);
      setIssues(issueData);
      setPulls(pullData);
      setCommits(commitData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this repository.');
    } finally {
      setLoading(false);
    }
  }, [ownerName, repoName]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    getGitHubPagesLink(`${ownerName}/${repoName}`).then((value) => {
      setLinkedProject(value ?? '');
      setProjectDraft(value ?? '');
    }).catch(() => {});
  }, [ownerName, repoName]);
  const savePagesLink = async () => {
    const value = projectDraft.trim();
    if (!value) return;
    await setGitHubPagesLink(`${ownerName}/${repoName}`, value);
    setLinkedProject(value);
    setLinkMessage('Cloudflare Pages shortcut saved on this device.');
  };
  const removePagesLink = async () => {
    await setGitHubPagesLink(`${ownerName}/${repoName}`, null);
    setLinkedProject('');
    setProjectDraft('');
    setLinkMessage('Cloudflare Pages shortcut removed.');
  };
  const openBrowser = (url: string) => router.push({ pathname: '/github/browser', params: { url } } as any);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: repoName }} />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.primary} />} showsVerticalScrollIndicator={false}>
        {repository ? (
          <Card style={styles.repoHeader}>
            <View style={styles.ownerRow}>
              <Image source={{ uri: repository.owner.avatar_url }} style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.repoTitle, { color: colors.text }]}>{repository.full_name}</Text>
                <Text style={[styles.repoDescription, { color: colors.textSecondary }]}>{repository.description || 'No description provided.'}</Text>
              </View>
              <Badge label={repository.private ? 'Private' : 'Public'} />
            </View>
            <View style={styles.metadata}>
              {repository.language ? <Badge label={repository.language} /> : null}
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>★ {repository.stargazers_count}</Text>
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>{repository.forks_count} forks</Text>
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>{repository.open_issues_count} open issues</Text>
            </View>
            <Text style={[styles.branch, { color: colors.textSecondary }]}>Default branch: <Text style={{ color: colors.text, fontWeight: '600' }}>{repository.default_branch}</Text></Text>
            <Button title="Open on GitHub" variant="secondary" onPress={() => openBrowser(repository.html_url)} icon={<Icon name="github" size={18} color={colors.text} />} />
          </Card>
        ) : null}

        <View style={[styles.tabs, { backgroundColor: colors.surfaceSecondary }]}>
          {tabs.map((tab) => (
            <TouchableOpacity key={tab.key} onPress={() => setActiveTab(tab.key)} style={[styles.tab, activeTab === tab.key && { backgroundColor: colors.surface, borderColor: colors.border }]} activeOpacity={0.8}>
              <Icon name={tab.icon as any} size={16} color={activeTab === tab.key ? colors.primary : colors.textSecondary} />
              <Text numberOfLines={1} style={[styles.tabText, { color: activeTab === tab.key ? colors.text : colors.textSecondary }]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {error ? <Card><Text style={{ color: colors.error, fontSize: FontSize.sm }}>{error}</Text></Card> : null}
        {loading && !repository ? <Text style={{ color: colors.textSecondary, padding: Spacing.lg }}>Loading repository…</Text> : null}
        {activeTab === 'overview' && repository ? (
          <>
            <Card style={{ gap: Spacing.md }}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>About this repository</Text>
              <InfoLine label="Created by" value={repository.owner.login} />
              <InfoLine label="Updated" value={new Date(repository.updated_at).toLocaleDateString()} />
              <InfoLine label="Last push" value={new Date(repository.pushed_at).toLocaleDateString()} />
              <InfoLine label="Visibility" value={repository.private ? 'Private' : 'Public'} />
            </Card>
            <Card style={{ gap: Spacing.md }}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Cloudflare Pages link</Text>
              <Text style={[styles.repoDescription, { color: colors.textSecondary }]}>Save a local shortcut to the Pages project that deploys this repository. This does not change GitHub or Cloudflare build settings.</Text>
              <TextInput value={projectDraft} onChangeText={setProjectDraft} placeholder="Cloudflare Pages project name" placeholderTextColor={colors.textTertiary} autoCapitalize="none" autoCorrect={false} style={[styles.projectInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]} accessibilityLabel="Cloudflare Pages project name" />
              <Button title={linkedProject ? 'Update Pages link' : 'Save Pages link'} size="sm" onPress={() => void savePagesLink()} disabled={!projectDraft.trim()} />
              {linkMessage ? <Text style={[styles.metaText, { color: colors.textSecondary }]}>{linkMessage}</Text> : null}
              {linkedProject ? <>
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>Linked project: <Text style={{ color: colors.text, fontWeight: '600' }}>{linkedProject}</Text></Text>
                <Button title="Open in Cloudflare Pages" variant="secondary" size="sm" onPress={() => router.push({ pathname: '/pages/[project]', params: { project: linkedProject } } as any)} icon={<Icon name="cloud" size={16} color={colors.text} />} />
                <Button title="Remove link" variant="ghost" size="sm" onPress={() => void removePagesLink()} />
              </> : null}
            </Card>
            <View style={styles.quickLinks}>
              <Button title={`Issues (${issues.length})`} size="sm" variant="secondary" onPress={() => setActiveTab('issues')} />
              <Button title={`Pulls (${pulls.length})`} size="sm" variant="secondary" onPress={() => setActiveTab('pulls')} />
              <Button title={`Commits (${commits.length})`} size="sm" variant="secondary" onPress={() => setActiveTab('commits')} />
            </View>
          </>
        ) : null}
        {activeTab === 'issues' ? issues.map((issue) => <ItemRow key={issue.id} title={issue.title} subtitle={`#${issue.number} · @${issue.user?.login}`} onPress={() => openBrowser(issue.html_url)} icon="rule" />) : null}
        {activeTab === 'pulls' ? pulls.map((pull) => <ItemRow key={pull.id} title={pull.title} subtitle={`#${pull.number} · ${pull.head?.ref || ''} → ${pull.base?.ref || ''}`} onPress={() => openBrowser(pull.html_url)} icon="git-pull-request" badge={pull.draft ? 'Draft' : undefined} />) : null}
        {activeTab === 'commits' ? commits.map((commit) => <ItemRow key={commit.sha} title={commit.commit.message.split('\n')[0]} subtitle={`${commit.sha.slice(0, 7)} · ${commit.commit.author?.name || commit.author?.login || 'Unknown author'}`} onPress={() => openBrowser(commit.html_url)} icon="activity" />) : null}
        {!loading && activeTab === 'issues' && !issues.length ? <EmptyState icon="rule" title="No open issues" /> : null}
        {!loading && activeTab === 'pulls' && !pulls.length ? <EmptyState icon="git-pull-request" title="No open pull requests" /> : null}
        {!loading && activeTab === 'commits' && !commits.length ? <EmptyState icon="activity" title="No commits found" /> : null}
      </ScrollView>
    </View>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return <View style={styles.infoLine}><Text style={[styles.metaText, { color: colors.textSecondary }]}>{label}</Text><Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text></View>;
}

function ItemRow({ title, subtitle, onPress, icon, badge }: { title: string; subtitle: string; onPress: () => void; icon: 'rule' | 'git-pull-request' | 'activity'; badge?: string }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={[styles.itemRow, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
      <Icon name={icon as any} size={19} color={colors.textSecondary} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text numberOfLines={2} style={[styles.itemTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.metaText, { color: colors.textSecondary }]}>{subtitle}</Text>
      </View>
      {badge ? <Badge label={badge} /> : null}
      <Icon name="chevron-right" size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl, gap: Spacing.md },
  repoHeader: { gap: Spacing.md },
  ownerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 14 },
  repoTitle: { fontSize: FontSize.lg, fontWeight: '600' },
  repoDescription: { fontSize: FontSize.sm, lineHeight: 19, marginTop: 4 },
  metadata: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.md },
  metaText: { fontSize: FontSize.xs },
  branch: { fontSize: FontSize.sm },
  tabs: { borderRadius: Radius.lg, padding: 4, flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  tab: { flexGrow: 1, minWidth: '22%', borderRadius: Radius.md, borderWidth: 1, borderColor: 'transparent', minHeight: 40, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  tabText: { fontSize: 11, fontWeight: '500' },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '600' },
  quickLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  projectInput: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 11, fontSize: FontSize.md },
  infoLine: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.lg },
  infoValue: { fontSize: FontSize.sm, fontWeight: '500', textAlign: 'right', flexShrink: 1 },
  itemRow: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  itemTitle: { fontSize: FontSize.sm, fontWeight: '600', lineHeight: 18 },
});
