import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';
import { FontSize, Radius, Spacing } from '@/constants/theme';

function resolveAddress(value: string): string | null {
  const input = value.trim();
  if (!input) return null;
  let candidate = input;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = candidate.includes('.') && !candidate.includes(' ')
      ? `https://${candidate}`
      : `https://github.com/search?q=${encodeURIComponent(candidate)}`;
  }
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export default function GitHubBrowserScreen() {
  const params = useLocalSearchParams<{ url?: string; landscape?: string }>();
  const forceLandscape = String(params.landscape || '') === '1';
  const initial = resolveAddress(String(params.url || 'https://github.com')) || 'https://github.com';
  const { colors } = useTheme();
  const webview = useRef<any>(null);
  const [address, setAddress] = useState(initial);
  const [url, setUrl] = useState(initial);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [title, setTitle] = useState('GitHub');
  const [error, setError] = useState('');

  useEffect(() => {
    setAddress(initial);
    setUrl(initial);
  }, [initial]);

  useEffect(() => {
    let disposed = false;
    let previousLock: ScreenOrientation.OrientationLock | null = null;
    const applyLandscape = async () => {
      if (!forceLandscape) return;
      try {
        previousLock = await ScreenOrientation.getOrientationLockAsync();
        if (!disposed) await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch {
        // Some devices/ROMs may restrict rotation; browser navigation still works.
      }
    };
    void applyLandscape();
    return () => {
      disposed = true;
      if (forceLandscape && previousLock !== null) {
        void ScreenOrientation.lockAsync(previousLock).catch(() => {});
      }
    };
  }, [forceLandscape]);



  const navigate = () => {
    const next = resolveAddress(address);
    if (!next) {
      setError('Enter a valid http or https address, or search phrase.');
      return;
    }
    setError('');
    setUrl(next);
    setAddress(next);
  };

  const openExternally = async () => {
    try { await WebBrowser.openBrowserAsync(url); } catch { await Linking.openURL(url); }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title, headerShown: true }} />
      {Platform.OS === 'web' ? (
        <ScrollView contentContainerStyle={styles.webFallback}>
          <View style={[styles.browserLogo, { backgroundColor: colors.text }]}><Icon name="github" size={34} color={colors.surface} /></View>
          <Text style={[styles.webTitle, { color: colors.text }]}>GitHub browser</Text>
          <Text style={[styles.webBody, { color: colors.textSecondary }]}>Embedded WebView is available in native builds. For web builds, open the page in your browser.</Text>
          <TextInput value={address} onChangeText={setAddress} onSubmitEditing={navigate} autoCapitalize="none" autoCorrect={false} style={[styles.address, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]} />
          {error ? <Text style={{ color: colors.error }}>{error}</Text> : null}
          <Button title="Open page" onPress={() => { navigate(); void WebBrowser.openBrowserAsync(resolveAddress(address) || 'https://github.com'); }} />
        </ScrollView>
      ) : (
        <>
          <View style={[styles.toolbar, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <View style={[styles.addressBar, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Icon name="globe" size={16} color={colors.textTertiary} />
              <TextInput value={address} onChangeText={setAddress} onSubmitEditing={navigate} returnKeyType="go" autoCapitalize="none" autoCorrect={false} keyboardType="url" style={[styles.addressInput, { color: colors.text }]} placeholder="github.com" placeholderTextColor={colors.textTertiary} accessibilityLabel="Browser address or search" />
              <TouchableOpacity onPress={navigate} accessibilityRole="button" accessibilityLabel="Go to address"><Icon name="arrow-left" size={17} color={colors.primary} /></TouchableOpacity>
            </View>
            <View style={styles.controls}>
              <Control label="Back" disabled={!canGoBack} onPress={() => webview.current?.goBack()} icon="arrow-left" />
              <Control label="Forward" disabled={!canGoForward} onPress={() => webview.current?.goForward()} icon="chevron-right" />
              <Control label="Reload" onPress={() => webview.current?.reload()} icon="refresh" />
              <Control label="Open externally" onPress={() => void openExternally()} icon="link" />
            </View>
          </View>
          {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
          <WebView
            ref={webview}
            source={{ uri: url }}
            originWhitelist={['http://*', 'https://*']}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            setSupportMultipleWindows={false}
            onNavigationStateChange={(state) => {
              setCanGoBack(state.canGoBack);
              setCanGoForward(state.canGoForward);
              if (state.title) setTitle(state.title.length > 30 ? `${state.title.slice(0, 30)}…` : state.title);
              setAddress(state.url);
            }}
            onShouldStartLoadWithRequest={(request) => {
              if (/^https?:\/\//i.test(request.url)) return true;
              if (/^(mailto|tel):/i.test(request.url)) {
                Linking.openURL(request.url).catch(() => {});
              }
              return false;
            }}
            onError={() => setError('This page could not be loaded. Check your connection or open it externally.')}
            onHttpError={(event) => {
              if (event.nativeEvent.statusCode >= 400) setError(`Page returned HTTP ${event.nativeEvent.statusCode}.`);
            }}
            style={{ flex: 1, backgroundColor: colors.background }}
          />
        </>
      )}
    </View>
  );
}

function Control({ label, disabled, onPress, icon }: { label: string; disabled?: boolean; onPress: () => void; icon: any }) {
  const { colors } = useTheme();
  return <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={[styles.control, { opacity: disabled ? 0.3 : 1 }]}><Icon name={icon} size={18} color={colors.textSecondary} /></TouchableOpacity>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  toolbar: { padding: Spacing.md, borderBottomWidth: 1, gap: Spacing.sm },
  addressBar: { minHeight: 44, borderWidth: 1, borderRadius: Radius.full, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.md, gap: Spacing.sm },
  addressInput: { flex: 1, minWidth: 0, height: 42, fontSize: FontSize.sm },
  controls: { flexDirection: 'row', justifyContent: 'space-around' },
  control: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.full },
  error: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: FontSize.sm },
  webFallback: { padding: Spacing.xl, gap: Spacing.md, alignItems: 'stretch', flexGrow: 1, justifyContent: 'center' },
  browserLogo: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  webTitle: { fontSize: FontSize.xxl, fontWeight: '600', textAlign: 'center' },
  webBody: { fontSize: FontSize.md, lineHeight: 22, textAlign: 'center', marginBottom: Spacing.md },
  address: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: FontSize.md },
});
