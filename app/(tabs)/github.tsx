import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { router } from 'expo-router';
import i18n from '@/i18n';
import * as WebBrowser from 'expo-web-browser';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/ui/section-header';
import { useTheme } from '@/hooks/use-theme';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import {
  clearGitHubCredential, getGitHubCredential, getGitHubViewer, listMyRepositories,
  pollGitHubDeviceAuthorization, saveGitHubCredential, searchPublicRepositories,
  startGitHubDeviceAuthorization, GITHUB_CLIENT_ID, GitHubCredential, GitHubRepository,
  GitHubViewer, DeviceAuthorization,
} from '@/services/github';

const isIndonesian = () => i18n.language.toLowerCase().startsWith('id');

function label(en: string, id: string) { return isIndonesian() ? id : en; }
function routeToSection(section: string) {
  router.push({ pathname: '/github/[section]', params: { section } } as any);
}
function routeToRepository(repo: GitHubRepository) {
  router.push({ pathname: '/github/repository/[owner]/[repo]', params: { owner: repo.owner.login, repo: repo.name } } as any);
}

export default function GitHubScreen() {
  const { colors } = useTheme();
  const [credential, setCredential] = useState<GitHubCredential | null>(null);
  const [viewer, setViewer] = useState<GitHubViewer | null>(null);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [query, setQuery] = useState('');
  const [publicResults, setPublicResults] = useState<GitHubRepository[]>([]);
  const [manualToken, setManualToken] = useState('');
  const [deviceAuthorization, setDeviceAuthorization] = useState<DeviceAuthorization | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const stored = await getGitHubCredential();
      setCredential(stored);
      if (!stored) {
        setViewer(null);
        setRepositories([]);
        return;
      }
      const user = await getGitHubViewer(stored.accessToken);
      setViewer(user);
      const repos = await listMyRepositories(stored.accessToken);
      setRepositories(repos);
      if (stored.username !== user.login) {
        const updated = { ...stored, username: user.login };
        await saveGitHubCredential(updated);
        setCredential(updated);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : label('Could not load GitHub data.', 'Gagal memuat data GitHub.'));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const connectToken = async () => {
    const token = manualToken.trim();
    if (!token) {
      setError(label('Paste a GitHub access token first.', 'Tempel token akses GitHub terlebih dahulu.'));
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const user = await getGitHubViewer(token);
      const next = { accessToken: token, expiresAt: null, username: user.login };
      await saveGitHubCredential(next);
      setCredential(next);
      setViewer(user);
      setManualToken('');
      setMessage(label('GitHub connected successfully.', 'GitHub berhasil dihubungkan.'));
      const repos = await listMyRepositories(token);
      setRepositories(repos);
    } catch (e) {
      setError(e instanceof Error ? e.message : label('Token validation failed.', 'Validasi token gagal.'));
    } finally {
      setBusy(false);
    }
  };

  const startDeviceFlow = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const flow = await startGitHubDeviceAuthorization();
      setDeviceAuthorization(flow);
      await WebBrowser.openBrowserAsync(flow.verification_uri_complete || flow.verification_uri);
      setMessage(label('Approve the request on GitHub, then check authorization below.', 'Setujui permintaan di GitHub, lalu periksa otorisasi di bawah.'));
    } catch (e) {
      setError(e instanceof Error ? e.message : label('Could not start GitHub sign-in.', 'Gagal memulai login GitHub.'));
    } finally {
      setBusy(false);
    }
  };

  const checkDeviceFlow = async () => {
    if (!deviceAuthorization) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await pollGitHubDeviceAuthorization(deviceAuthorization.device_code);
      if (result.status === 'connected') {
        const user = await getGitHubViewer(result.credential.accessToken);
        const next = { ...result.credential, username: user.login };
        await saveGitHubCredential(next);
        setCredential(next);
        setViewer(user);
        setDeviceAuthorization(null);
        setMessage(label('GitHub connected successfully.', 'GitHub berhasil dihubungkan.'));
        const repos = await listMyRepositories(next.accessToken);
        setRepositories(repos);
      } else if (result.status === 'pending' || result.status === 'slow_down') {
        setMessage(label('GitHub approval is still pending. Finish approval in the browser and check again.', 'Persetujuan GitHub masih menunggu. Selesaikan di browser lalu periksa lagi.'));
      } else if ('message' in result) {
        setError(result.message);
        if (result.status === 'expired' || result.status === 'denied') setDeviceAuthorization(null);
      } else {
        setMessage(label('GitHub approval is still pending. Finish approval in the browser and check again.', 'Persetujuan GitHub masih menunggu. Selesaikan di browser lalu periksa lagi.'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : label('Authorization check failed.', 'Pemeriksaan otorisasi gagal.'));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    await clearGitHubCredential();
    setCredential(null);
    setViewer(null);
    setRepositories([]);
    setDeviceAuthorization(null);
    setMessage(label('GitHub disconnected from this device.', 'GitHub diputus dari perangkat ini.'));
    setError('');
  };

  const searchPublic = async () => {
    const value = query.trim();
    if (!value) {
      setPublicResults([]);
      return;
    }
    setSearchBusy(true);
    setError('');
    try {
      setPublicResults(await searchPublicRepositories(value, credential?.accessToken ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : label('Repository search failed.', 'Pencarian repositori gagal.'));
    } finally {
      setSearchBusy(false);
    }
  };

  const openBrowser = (url = 'https://github.com') => {
    router.push({ pathname: '/github/browser', params: { url } } as any);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void refresh()} tintColor={colors.primary} />}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Card style={styles.hero}>
        <View style={[styles.brandMark, { backgroundColor: colors.text }]}>
          <Icon name="github" size={30} color={colors.surface} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.heading, { color: colors.text }]}>GitHub</Text>
          <Text style={[styles.subheading, { color: colors.textSecondary }]}>
            {label('Your repositories and development activity, alongside Cloudflare.', 'Repositori dan aktivitas pengembanganmu, berdampingan dengan Cloudflare.')}
          </Text>
        </View>
        <TouchableOpacity onPress={() => openBrowser()} accessibilityRole="button" accessibilityLabel="Open GitHub browser" style={styles.browserIcon}>
          <Icon name="globe" size={21} color={colors.textSecondary} />
        </TouchableOpacity>
      </Card>

      {error ? <View style={[styles.notice, { backgroundColor: colors.error + '12', borderColor: colors.error + '55' }]}><Icon name="warning" size={18} color={colors.error} /><Text style={[styles.noticeText, { color: colors.text }]}>{error}</Text></View> : null}
      {message ? <View style={[styles.notice, { backgroundColor: colors.success + '12', borderColor: colors.success + '50' }]}><Icon name="check-circle" size={18} color={colors.success} /><Text style={[styles.noticeText, { color: colors.text }]}>{message}</Text></View> : null}

      {viewer ? (
        <Card style={styles.accountCard}>
          <Image source={{ uri: viewer.avatar_url }} style={styles.avatar} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.accountTitle, { color: colors.text }]}>{viewer.name || viewer.login}</Text>
            <Text style={[styles.accountSub, { color: colors.textSecondary }]}>@{viewer.login} · {viewer.public_repos} {label('public repositories', 'repositori publik')}</Text>
          </View>
          <Badge label={label('Connected', 'Terhubung')} variant="success" />
        </Card>
      ) : (
        <Card style={styles.connectCard}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{label('Connect your GitHub account', 'Hubungkan akun GitHub')}</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {label('Use your GitHub App device flow, or paste a scoped token for local testing. Tokens stay on this device.', 'Gunakan Device Flow GitHub App atau tempel token terbatas untuk pengujian. Token disimpan di perangkat ini.')}
          </Text>
          <Button title={label('Connect with GitHub App', 'Hubungkan dengan GitHub App')} onPress={() => void startDeviceFlow()} loading={busy} icon={<Icon name="github" size={18} color="#FFF" />} />
          {!GITHUB_CLIENT_ID ? (
            <Text style={[styles.hint, { color: colors.textTertiary }]}>
              {label('Set EXPO_PUBLIC_GITHUB_CLIENT_ID after creating the GitHub App. Until then, token sign-in still works.', 'Atur EXPO_PUBLIC_GITHUB_CLIENT_ID setelah membuat GitHub App. Sementara itu, login token tetap bisa digunakan.')}
            </Text>
          ) : null}
          {deviceAuthorization ? (
            <View style={[styles.deviceBox, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <Text style={[styles.deviceLabel, { color: colors.textSecondary }]}>{label('Enter this code on GitHub', 'Masukkan kode ini di GitHub')}</Text>
              <Text selectable style={[styles.deviceCode, { color: colors.text }]}>{deviceAuthorization.user_code}</Text>
              <Button title={label('Open verification page again', 'Buka ulang halaman verifikasi')} variant="secondary" size="sm" onPress={() => WebBrowser.openBrowserAsync(deviceAuthorization.verification_uri_complete || deviceAuthorization.verification_uri)} />
              <Button title={label('Check authorization', 'Periksa otorisasi')} size="sm" onPress={() => void checkDeviceFlow()} loading={busy} />
            </View>
          ) : null}
          <View style={styles.divider} />
          <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{label('Or paste an access token', 'Atau tempel token akses')}</Text>
          <TextInput
            value={manualToken}
            onChangeText={setManualToken}
            placeholder="github_pat_…"
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.tokenInput, { color: colors.text, backgroundColor: colors.inputBg, borderColor: colors.border }]}
            accessibilityLabel={label('GitHub access token', 'Token akses GitHub')}
          />
          <Button title={label('Validate and connect', 'Validasi dan hubungkan')} onPress={() => void connectToken()} variant="secondary" loading={busy} />
          <Text style={[styles.hint, { color: colors.textTertiary }]}>{label('Choose read-only permissions for metadata, contents, issues and pull requests. Never paste an app secret or private key here.', 'Pilih izin baca-saja untuk metadata, contents, issues, dan pull requests. Jangan tempel app secret atau private key di sini.')}</Text>
        </Card>
      )}

      <SectionHeader title={label('GitHub workspace', 'Ruang kerja GitHub')} />
      <View style={styles.shortcuts}>
        {[
          { section: 'repositories', title: label('Repositories', 'Repositori'), subtitle: label('Browse code and projects', 'Jelajahi kode dan proyek'), icon: 'code' as const },
          { section: 'issues', title: 'Issues', subtitle: label('Track open work', 'Pantau pekerjaan terbuka'), icon: 'rule' as const },
          { section: 'pulls', title: 'Pull requests', subtitle: label('Review changes', 'Tinjau perubahan'), icon: 'git-pull-request' as const },
        ].map((item) => (
          <TouchableOpacity key={item.section} onPress={() => routeToSection(item.section)} activeOpacity={0.75} style={[styles.shortcut, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <View style={[styles.shortcutIcon, { backgroundColor: colors.surfaceSecondary }]}><Icon name={item.icon as any} size={20} color={colors.textSecondary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.shortcutTitle, { color: colors.text }]}>{item.title}</Text>
              <Text style={[styles.shortcutSub, { color: colors.textSecondary }]}>{item.subtitle}</Text>
            </View>
            <Icon name="chevron-right" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        ))}
      </View>

      {viewer ? (
        <>
          <SectionHeader title={label('Recently updated repositories', 'Repositori yang baru diperbarui')} action={<TouchableOpacity onPress={() => routeToSection('repositories')}><Text style={{ color: colors.primary, fontSize: FontSize.sm }}>{label('See all', 'Lihat semua')}</Text></TouchableOpacity>} />
          {repositories.length ? repositories.slice(0, 5).map((repo) => <RepositoryRow key={repo.id} repo={repo} onPress={() => routeToRepository(repo)} />) : (
            <Card><Text style={{ color: colors.textSecondary }}>{label('No repositories are visible to this account yet.', 'Belum ada repositori yang terlihat untuk akun ini.')}</Text></Card>
          )}
        </>
      ) : null}

      <SectionHeader title={label('Explore public repositories', 'Jelajahi repositori publik')} />
      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Icon name="search" size={18} color={colors.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void searchPublic()}
          returnKeyType="search"
          placeholder={label('Search GitHub repositories', 'Cari repositori GitHub')}
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.searchInput, { color: colors.text }]}
        />
        <TouchableOpacity onPress={() => void searchPublic()} accessibilityRole="button" accessibilityLabel="Search repositories" style={{ padding: 5 }}>
          {searchBusy ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="search" size={18} color={colors.primary} />}
        </TouchableOpacity>
      </View>
      {publicResults.map((repo) => <RepositoryRow key={repo.id} repo={repo} onPress={() => routeToRepository(repo)} />)}

      <Button title={label('Open GitHub browser', 'Buka browser GitHub')} variant="secondary" onPress={() => openBrowser()} icon={<Icon name="globe" size={18} color={colors.text} />} />
      {viewer ? <Button title={label('Disconnect GitHub', 'Putuskan GitHub')} variant="ghost" onPress={() => void disconnect()} /> : null}
      <Text style={[styles.footer, { color: colors.textTertiary }]}>{label('Independent GitHub integration. Your token is not sent to Cloudflare.', 'Integrasi GitHub independen. Tokenmu tidak dikirim ke Cloudflare.')}</Text>
    </ScrollView>
  );
}

function RepositoryRow({ repo, onPress }: { repo: GitHubRepository; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={[styles.repoRow, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
      <Image source={{ uri: repo.owner.avatar_url }} style={styles.repoAvatar} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.repoTitleRow}>
          <Text numberOfLines={1} style={[styles.repoTitle, { color: colors.text }]}>{repo.full_name}</Text>
          {repo.private ? <Icon name="lock" size={13} color={colors.textTertiary} /> : null}
        </View>
        <Text numberOfLines={2} style={[styles.repoDescription, { color: colors.textSecondary }]}>{repo.description || '—'}</Text>
        <View style={styles.repoMeta}>
          {repo.language ? <Text style={[styles.metaText, { color: colors.textSecondary }]}>{repo.language}</Text> : null}
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>★ {repo.stargazers_count}</Text>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>{repo.open_issues_count} {label('open issues', 'issue terbuka')}</Text>
        </View>
      </View>
      <Icon name="chevron-right" size={17} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl, gap: Spacing.md },
  hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  brandMark: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: FontSize.xxl, fontWeight: '600', letterSpacing: -0.5 },
  subheading: { fontSize: FontSize.sm, lineHeight: 19, marginTop: 4 },
  browserIcon: { width: 38, height: 38, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  accountCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  accountTitle: { fontSize: FontSize.md, fontWeight: '600' },
  accountSub: { fontSize: FontSize.xs, marginTop: 4 },
  connectCard: { gap: Spacing.md },
  cardTitle: { fontSize: FontSize.lg, fontWeight: '600' },
  body: { fontSize: FontSize.sm, lineHeight: 20 },
  hint: { fontSize: FontSize.xs, lineHeight: 17 },
  deviceBox: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm, alignItems: 'stretch' },
  deviceLabel: { fontSize: FontSize.sm, textAlign: 'center' },
  deviceCode: { fontSize: 28, fontWeight: '700', letterSpacing: 3, textAlign: 'center' },
  divider: { height: 1, backgroundColor: '#80808030', marginVertical: 2 },
  inputLabel: { fontSize: FontSize.sm, fontWeight: '500' },
  tokenInput: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: FontSize.md },
  notice: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  noticeText: { flex: 1, fontSize: FontSize.sm, lineHeight: 19 },
  shortcuts: { gap: Spacing.sm },
  shortcut: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.md },
  shortcutIcon: { width: 42, height: 42, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  shortcutTitle: { fontSize: FontSize.md, fontWeight: '600' },
  shortcutSub: { fontSize: FontSize.xs, marginTop: 3 },
  searchBar: { height: 48, borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  searchInput: { flex: 1, fontSize: FontSize.md, height: '100%' },
  repoRow: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  repoAvatar: { width: 36, height: 36, borderRadius: 18 },
  repoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  repoTitle: { flex: 1, fontSize: FontSize.sm, fontWeight: '600' },
  repoDescription: { fontSize: FontSize.xs, lineHeight: 17 },
  repoMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  metaText: { fontSize: FontSize.xs },
  footer: { fontSize: FontSize.xs, lineHeight: 17, textAlign: 'center', marginTop: Spacing.sm },
});
