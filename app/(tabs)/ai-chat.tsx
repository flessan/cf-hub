import { Linking, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';
import { FontSize, Radius, Spacing } from '@/constants/theme';

const CHATGPT_URL = 'https://chatgpt.com/';

export default function AiChatFallbackScreen() {
  const { colors } = useTheme();
  const { i18n } = useTranslation();
  const isIndonesian = i18n.language.toLowerCase().startsWith('id');

  const openChatGPT = async () => {
    try {
      await WebBrowser.openBrowserAsync(CHATGPT_URL);
    } catch {
      await Linking.openURL(CHATGPT_URL);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'ChatGPT' }} />
      <View style={[styles.logo, { backgroundColor: colors.text }]}>
        <Icon name="sparkles" size={34} color={colors.surface} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>ChatGPT</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        {isIndonesian
          ? 'Buka ChatGPT dari CF-Hub untuk melanjutkan percakapan. Login dan fitur akun dikelola langsung oleh OpenAI.'
          : 'Open ChatGPT from CF-Hub to continue your conversations. Sign-in and account features are handled by OpenAI.'}
      </Text>
      <Button
        title={isIndonesian ? 'Buka ChatGPT' : 'Open ChatGPT'}
        onPress={() => void openChatGPT()}
        icon={<Icon name="external-link" size={18} color="#FFF" />}
      />
      <Text style={[styles.note, { color: colors.textTertiary }]}>
        {isIndonesian
          ? 'Jika halaman tidak bisa dibuka di dalam aplikasi, lanjutkan lewat browser eksternal.'
          : 'If the page cannot open in-app, continue in your external browser.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: Spacing.xl, justifyContent: 'center', gap: Spacing.md },
  logo: { width: 68, height: 68, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: Spacing.sm },
  title: { fontSize: FontSize.xxl, fontWeight: '600', textAlign: 'center' },
  body: { fontSize: FontSize.md, lineHeight: 23, textAlign: 'center', maxWidth: 420, alignSelf: 'center', marginBottom: Spacing.md },
  note: { fontSize: FontSize.xs, lineHeight: 18, textAlign: 'center', maxWidth: 420, alignSelf: 'center', marginTop: Spacing.sm },
});
