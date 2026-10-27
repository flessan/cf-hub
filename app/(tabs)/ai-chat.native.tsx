import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { WebView } from 'react-native-webview';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import { FontSize, Radius, Spacing } from '@/constants/theme';

const CHATGPT_URL = 'https://chatgpt.com/';

export default function AiChatNativeScreen() {
  const { colors } = useTheme();
  const webview = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const openExternally = async () => {
    try {
      await WebBrowser.openBrowserAsync(CHATGPT_URL);
    } catch {
      await Linking.openURL(CHATGPT_URL);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'ChatGPT' }} />
      <View style={[styles.toolbar, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
        <View style={[styles.domain, { backgroundColor: colors.surfaceSecondary }]}>
          <Icon name="shield-check" size={15} color={colors.success} />
          <Text style={[styles.domainText, { color: colors.textSecondary }]}>chatgpt.com</Text>
        </View>
        <View style={styles.controls}>
          <BrowserControl label="Back" disabled={!canGoBack} onPress={() => webview.current?.goBack()} icon="arrow-left" />
          <BrowserControl label="Forward" disabled={!canGoForward} onPress={() => webview.current?.goForward()} icon="chevron-right" />
          <BrowserControl label="Reload" onPress={() => { setLoadFailed(false); webview.current?.reload(); }} icon="refresh" />
          <BrowserControl label="Open externally" onPress={() => void openExternally()} icon="external-link" />
        </View>
      </View>
      <View style={styles.webContainer}>
        <WebView
          ref={webview}
          source={{ uri: CHATGPT_URL }}
          originWhitelist={['http://*', 'https://*']}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures
          onLoadStart={() => { setLoading(true); setLoadFailed(false); }}
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={(state) => {
            setCanGoBack(state.canGoBack);
            setCanGoForward(state.canGoForward);
          }}
          onError={() => { setLoading(false); setLoadFailed(true); }}
          onShouldStartLoadWithRequest={(request) => {
            if (/^https?:\/\//i.test(request.url)) return true;
            if (/^(mailto|tel):/i.test(request.url)) {
              Linking.openURL(request.url).catch(() => {});
            }
            return false;
          }}
          style={{ flex: 1, backgroundColor: colors.background }}
        />
        {loading ? (
          <View pointerEvents="none" style={[styles.loadingOverlay, { backgroundColor: colors.background }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Opening ChatGPT…</Text>
          </View>
        ) : null}
        {loadFailed ? (
          <View style={[styles.errorOverlay, { backgroundColor: colors.background }]}>
            <Icon name="error-circle" size={32} color={colors.textTertiary} />
            <Text style={[styles.errorTitle, { color: colors.text }]}>ChatGPT could not be loaded</Text>
            <Text style={[styles.errorBody, { color: colors.textSecondary }]}>Check your connection, retry, or open ChatGPT in your regular browser if sign-in is blocked in the embedded view.</Text>
            <TouchableOpacity onPress={() => { setLoadFailed(false); setLoading(true); webview.current?.reload(); }} style={[styles.actionButton, { backgroundColor: colors.primary }]}>
              <Icon name="refresh" size={17} color="#FFF" />
              <Text style={styles.actionText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void openExternally()} style={[styles.actionButton, { backgroundColor: colors.surfaceSecondary }]}>
              <Icon name="external-link" size={17} color={colors.text} />
              <Text style={[styles.actionText, { color: colors.text }]}>Open in browser</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function BrowserControl({ label, disabled, onPress, icon }: { label: string; disabled?: boolean; onPress: () => void; icon: 'arrow-left' | 'chevron-right' | 'refresh' | 'external-link' }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.control, { backgroundColor: colors.surfaceSecondary, opacity: disabled ? 0.35 : 1 }]}
    >
      <Icon name={icon} size={17} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  toolbar: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 1, gap: Spacing.md },
  domain: { minHeight: 36, paddingHorizontal: Spacing.md, borderRadius: Radius.full, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: Spacing.sm },
  domainText: { fontSize: FontSize.xs, fontWeight: '600' },
  controls: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  control: { width: 42, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
  webContainer: { flex: 1, minHeight: 0 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  loadingText: { fontSize: FontSize.sm },
  errorOverlay: { ...StyleSheet.absoluteFillObject, padding: Spacing.xl, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  errorTitle: { fontSize: FontSize.lg, fontWeight: '600', textAlign: 'center' },
  errorBody: { fontSize: FontSize.sm, lineHeight: 21, textAlign: 'center', maxWidth: 360 },
  actionButton: { minHeight: 44, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, minWidth: 170 },
  actionText: { color: '#FFF', fontSize: FontSize.sm, fontWeight: '600' },
});
