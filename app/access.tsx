import { ScrollView, StyleSheet } from 'react-native';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/hooks/use-theme';
import { SectionHeader } from '@/components/ui/section-header';
import { Group, ListRow } from '@/components/ui/kit';
import { Spacing } from '@/constants/theme';

/** Access management hub. Detailed resources live on their focused screens. */
export default function AccessScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: t('settings.access_apps'), headerShown: true }} />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <SectionHeader title={t('settings.access_apps')} />
        <Group>
          <ListRow
            icon="shield"
            title={t('settings.access_apps')}
            subtitle={t('settings.access_apps_sub')}
            onPress={() => router.push('/access-apps' as any)}
            chevron
          />
          <ListRow
            icon="users"
            title={t('settings.access_idps')}
            subtitle={t('settings.access_idps_sub')}
            onPress={() => router.push('/access-idps' as any)}
            chevron
          />
          <ListRow
            icon="key"
            title={t('settings.access_tokens')}
            subtitle={t('settings.access_tokens_sub')}
            onPress={() => router.push('/access-service-tokens' as any)}
            chevron
          />
          <ListRow
            icon="fingerprint"
            title={t('settings.access_mtls')}
            subtitle={t('settings.access_mtls_sub')}
            onPress={() => router.push('/access-mtls' as any)}
            chevron
          />
        </Group>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxxl, gap: Spacing.md },
});
