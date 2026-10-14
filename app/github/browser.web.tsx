import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';
import { FontSize, Radius, Spacing } from '@/constants/theme';

function resolveAddress(value: string): string | null {
  const input = value.trim();
  if (!input) return null;
  let candidate = input;
  if (!candidate.startsWith('http://') && !candidate.startsWith('https://')) {
    candidate = candidate.includes('.') && !candidate.includes(' ')
      ? `https://${candidate}`
      : `https://github.com/search?q=${encodeURIComponent(candidate)}`;
  }
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch { return null; }
}

export default function GitHubBrowserWebScreen() {
  const params = useLocalSearchParams<{ url?: string }>();
  const initial = resolveAddress(String(params.url || 'https://github.com')) || 'https://github.com';
  const { colors } = useTheme();
  const [address, setAddress] = useState(initial);
  const [error, setError] = useState('');
  useEffect(() => { setAddress(initial); }, [initial]);
  const open = async () => {
    const url = resolveAddress(address);
    if (!url) { setError('Enter a valid http or https address, or search phrase.'); return; }
    setError('');
    try { await WebBrowser.openBrowserAsync(url); }
    catch { await Linking.openURL(url); }
  };
  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    <Stack.Screen options={{ title: 'GitHub browser', headerShown: true }} />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={[styles.logo, { backgroundColor: colors.text }]}><Icon name="github" size={34} color={colors.surface} /></View>
      <Text style={[styles.title, { color: colors.text }]}>GitHub browser</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>On web, CF-Hub opens the destination in your browser. Native builds include an embedded browser with navigation controls.</Text>
      <TextInput value={address} onChangeText={setAddress} onSubmitEditing={() => void open()} autoCapitalize="none" autoCorrect={false} style={[styles.address, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]} placeholder="github.com or search" placeholderTextColor={colors.textTertiary} />
      {error ? <Text style={{ color: colors.error }}>{error}</Text> : null}
      <Button title="Open page" onPress={() => void open()} />
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: Spacing.xl, gap: Spacing.md, flexGrow: 1, justifyContent: 'center' },
  logo: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { fontSize: FontSize.xxl, fontWeight: '600', textAlign: 'center' },
  body: { fontSize: FontSize.md, lineHeight: 22, textAlign: 'center', marginBottom: Spacing.md },
  address: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: FontSize.md },
});
