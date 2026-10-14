import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Icon } from '@/components/ui/icon';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useTheme } from '@/hooks/use-theme';
import i18n from '@/i18n';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import {
  getGitHubCredential, getGitHubViewer, listMyIssues, listMyPullRequests, listMyRepositories,
  GitHubIssue, GitHubPullRequest, GitHubRepository,
} from '@/services/github';

const words: Record<string, { title: string; subtitle: string }> = {
  repositories: { title: 'Repositories', subtitle: 'Projects your account can access' },
  issues: { title: 'Issues', subtitle: 'Open issues involving your account' },
  pulls: { title: 'Pull requests', subtitle: 'Open pull requests involving your account' },
};
const isId = () => i18n.language.toLowerCase().startsWith('id');

export default function GitHubSectionScreen() {
  const { section = 'repositories' } = useLocalSearchParams<{ section: string }>();
  const key = String(section);
  const copy = words[key] ?? words.repositories;
  const { colors } = useTheme();
  const [repos, setRepos] = useState<GitHubRepository[]>([]);
  const [issues, setIssues] = useState<GitHubIssue[]>([]);
  const [pulls, setPulls] = useState<GitHubPullRequest[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const credential = await getGitHubCredential();
      setConnected(!!credential);
      if (!credential) {
        setRepos([]);
        setIssues([]);
        setPulls([]);
        setError(
          key === 'repositories'
            ? (isId() ? 'Hubungkan GitHub untuk menampilkan repositorimu. Pencarian repositori publik tersedia di tab GitHub.' : 'Connect GitHub to list your repositories. Public repository search is available on the GitHub tab.')
            : (isId() ? 'Hubungkan akun GitHub untuk melihat issues dan pull requests milikmu.' : 'Connect GitHub to view issues and pull requests involving your account.'),
        );
        return;
      }
      if (key === 'repositories') {
        setRepos(await listMyRepositories(credential.accessToken));
      } else if (key === 'issues') {
        const viewer = await getGitHubViewer(credential?.accessToken ?? null);
        setIssues(await listMyIssues(viewer.login, credential.accessToken));
      } else if (key === 'pulls') {
        const viewer = await getGitHubViewer(credential?.accessToken ?? null);
        setPulls(await listMyPullRequests(viewer.login, credential.accessToken));
      } else {
        setError('Unknown GitHub section.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load GitHub data.');
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => { void load(); }, [load]);

  const openUrl = (url: string) => router.push({ pathname: '/github/browser', params: { url } } as any);
  const reposToShow = useMemo(() => repos, [repos]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: copy.title }} />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.primary} />} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <Text style={[styles.title, { color: colors.text }]}>{isId() ? (key === 'pulls' ? 'Pull requests' : key === 'issues' ? 'Issues' : 'Repositori') : copy.title}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{isId() ? 'Diperbarui langsung dari GitHub' : copy.subtitle}</Text>
        </View>
        {!connected && key === 'repositories' ? (
          <Card style={{ gap: Spacing.sm }}>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{isId() ? 'Hasil akun pribadi memerlukan koneksi. Repositori publik masih dapat dibuka.' : 'Account-specific results require a connection. Public repositories can still be opened.'}</Text>
            <Button title={isId() ? 'Kembali ke GitHub untuk menghubungkan akun' : 'Go to GitHub tab to connect'} variant="secondary" onPress={() => router.navigate('/(tabs)/github' as any)} />
          </Card>
        ) : null}
        {loading && !reposToShow.length && !issues.length && !pulls.length ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: Spacing.xxl }} /> : null}
        {error ? <Card><Text style={{ color: colors.error, fontSize: FontSize.sm }}>{error}</Text></Card> : null}
        {key === 'repositories' ? reposToShow.map((repo) => (
          <TouchableOpacity key={repo.id} onPress={() => router.push({ pathname: '/github/repository/[owner]/[repo]', params: { owner: repo.owner.login, repo: repo.name } } as any)} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.borderLight }]} activeOpacity={0.75}>
            <Image source={{ uri: repo.owner.avatar_url }} style={styles.avatar} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>{repo.full_name}</Text>
              <Text style={[styles.rowBody, { color: colors.textSecondary }]} numberOfLines={2}>{repo.description || '—'}</Text>
              <View style={styles.metadata}>
                {repo.private ? <Badge label="Private" /> : <Badge label="Public" />}
                {repo.language ? <Text style={[styles.metaText, { color: colors.textSecondary }]}>{repo.language}</Text> : null}
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>★ {repo.stargazers_count}</Text>
              </View>
            </View>
            <Icon name="chevron-right" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        )) : null}
        {key === 'issues' ? issues.map((issue) => <IssueRow key={issue.id} issue={issue} onPress={() => openUrl(issue.html_url)} />) : null}
        {key === 'pulls' ? pulls.map((pull) => <IssueRow key={pull.id} issue={pull} isPull onPress={() => openUrl(pull.html_url)} />) : null}
        {!loading && !error && key === 'repositories' && repos.length === 0 ? <EmptyState icon="code" title={isId() ? 'Repositori tidak ditemukan' : 'No repositories found'} message={isId() ? 'Coba tarik layar untuk memuat ulang.' : 'Pull to refresh to try again.'} /> : null}
        {!loading && !error && key === 'issues' && issues.length === 0 ? <EmptyState icon="rule" title={isId() ? 'Tidak ada issue terbuka' : 'No open issues'} /> : null}
        {!loading && !error && key === 'pulls' && pulls.length === 0 ? <EmptyState icon="git-pull-request" title={isId() ? 'Tidak ada pull request terbuka' : 'No open pull requests'} /> : null}
        <Button title={isId() ? 'Buka GitHub di browser' : 'Open GitHub in browser'} variant="secondary" onPress={() => openUrl('https://github.com')} icon={<Icon name="globe" size={18} color={colors.text} />} />
      </ScrollView>
    </View>
  );
}

function IssueRow({ issue, isPull, onPress }: { issue: GitHubIssue; isPull?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
      <View style={[styles.itemIcon, { backgroundColor: colors.surfaceSecondary }]}>
        <Icon name={isPull ? 'git-pull-request' as any : 'rule'} size={19} color={colors.textSecondary} />
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{issue.title}</Text>
        <Text style={[styles.rowBody, { color: colors.textSecondary }]}>{issue.repository_url?.replace('https://api.github.com/repos/', '') || issue.html_url.split('/').slice(3, 5).join('/')} #{issue.number} · @{issue.user?.login}</Text>
        {issue.labels?.length ? <View style={styles.metadata}>{issue.labels.slice(0, 3).map((label) => <Badge key={label.name} label={label.name} />)}</View> : null}
      </View>
      <Icon name="chevron-right" size={18} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl, gap: Spacing.md },
  intro: { marginBottom: Spacing.xs, gap: 4 },
  title: { fontSize: FontSize.xxl, fontWeight: '600', letterSpacing: -0.4 },
  subtitle: { fontSize: FontSize.sm, lineHeight: 19 },
  row: { padding: Spacing.md, borderWidth: 1, borderRadius: Radius.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  itemIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: FontSize.sm, fontWeight: '600', lineHeight: 19 },
  rowBody: { fontSize: FontSize.xs, lineHeight: 17 },
  metadata: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', alignItems: 'center' },
  metaText: { fontSize: FontSize.xs },
});
