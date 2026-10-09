import { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet, View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert, Modal, FlatList,
} from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/auth';
import { Icon, IconName } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { UpdateBanner } from '@/components/ui/update-banner';
import { DiceBearAvatar } from '@/components/ui/dicebear-avatar';
import { DiscoverCards } from '@/components/ui/discover-cards';
import { Spacing, FontSize, Radius } from '@/constants/theme';
import * as api from '@/services/cloudflare';
import { Zone } from '@/services/types';

const maskAccount = (name: string) => {
  if (!name.includes('@')) return name;
  const [local, domain] = name.split('@');
  return local.slice(0, 2) + '••••@' + domain;
};

interface QuickAction {
  icon: IconName;
  label: string;
  onPress: () => void;
}

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user, permissions } = useAuth();

  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [zonePicker, setZonePicker] = useState<{ visible: boolean; target: string | null }>({ visible: false, target: null });

  const fetchData = useCallback(async () => {
    try {
      const res = await api.getZones(1);
      setZones(res.result ?? []);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const activeZones = zones.filter((z) => z.status === 'active').length;
  const pendingZones = zones.filter((z) => z.status === 'pending').length;

  const openWithZonePicker = (target: string) => {
    if (zones.length === 0) {
      Alert.alert(t('common.info'), t('dashboard.no_zones'));
    } else if (zones.length === 1) {
      router.push(`/zone/${zones[0].id}/${target}`);
    } else {
      setZonePicker({ visible: true, target });
    }
  };

  const selectZone = (zoneId: string) => {
    setZonePicker({ visible: false, target: null });
    router.push(`/zone/${zoneId}/${zonePicker.target}`);
  };

  const allActions: (QuickAction & { gate: boolean })[] = [
    { icon: 'dns', label: t('dashboard.manage_dns'), onPress: () => router.push('/(tabs)/zones'), gate: permissions?.zones ?? true },
    { icon: 'cached', label: t('dashboard.purge_cache'), onPress: () => openWithZonePicker('cache'), gate: permissions?.cache ?? true },
    { icon: 'code', label: t('dashboard.workers'), onPress: () => router.push('/(tabs)/services'), gate: (permissions?.workers || permissions?.kv || permissions?.r2 || permissions?.pages) ?? true },
    { icon: 'chart-line', label: t('dashboard.analytics'), onPress: () => openWithZonePicker('analytics'), gate: permissions?.analytics ?? true },
    { icon: 'shield', label: t('dashboard.firewall'), onPress: () => openWithZonePicker('firewall'), gate: permissions?.firewall ?? true },
    { icon: 'lock', label: 'SSL/TLS', onPress: () => openWithZonePicker('ssl'), gate: permissions?.ssl ?? true },
  ];
  const actions: QuickAction[] = allActions.filter((a) => a.gate);

  if (loading) return <Loading message={t('common.loading')} />;

  const statusColor = (status: string) =>
    status === 'active' ? colors.success : status === 'pending' ? colors.warning : colors.error;

  const stats: { label: string; value: number; dot?: string }[] = [
    { label: t('dashboard.total_zones'), value: zones.length },
    { label: t('dashboard.active'), value: activeZones, dot: colors.success },
    { label: t('dashboard.pending'), value: pendingZones, dot: colors.warning },
  ];

  const recent = zones.slice(0, 5);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      <UpdateBanner />

      {/* Who is signed in */}
      <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
        <DiceBearAvatar seed={user?.email || user?.username || 'cfmobile'} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.greeting, { color: colors.textTertiary }]}>{t('dashboard.welcome')}</Text>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {user?.first_name || user?.email?.split('@')[0] || 'Admin'}
          </Text>
        </View>
      </View>

      {/* Zone counts */}
      <View style={styles.statsRow}>
        {stats.map((s) => (
          <View key={s.label} style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <Text style={[styles.statLabel, { color: colors.textTertiary }]} numberOfLines={1}>{s.label}</Text>
            <View style={styles.statValueRow}>
              <Text style={[styles.statValue, { color: colors.text }]}>{s.value}</Text>
              {s.dot && <View style={[styles.statDot, { backgroundColor: s.dot }]} />}
            </View>
          </View>
        ))}
      </View>

      <DiscoverCards firstZoneId={zones[0]?.id} />

      {/* Quick actions */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('dashboard.quick_actions')}</Text>
      <View style={styles.actionsGrid}>
        {actions.map((action) => (
          <TouchableOpacity
            key={action.label}
            style={[styles.actionTile, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
            onPress={action.onPress}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.surfaceSecondary }]}>
              <Icon name={action.icon} size={18} color={colors.text} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.text }]} numberOfLines={1}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Recent zones */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0, marginTop: 0, marginHorizontal: 0 }]}>
          {t('dashboard.recent_zones')}
        </Text>
        {zones.length > 5 && (
          <TouchableOpacity onPress={() => router.push('/(tabs)/zones')} hitSlop={8}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>{t('dashboard.see_all')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {recent.length > 0 ? (
        <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          {recent.map((zone, idx) => (
            <TouchableOpacity
              key={zone.id}
              style={[styles.zoneRow, idx > 0 && { borderTopWidth: 1, borderTopColor: colors.borderLight }]}
              onPress={() => router.push(`/zone/${zone.id}`)}
              activeOpacity={0.7}
            >
              <View style={[styles.zoneDot, { backgroundColor: statusColor(zone.status) }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.zoneName, { color: colors.text }]} numberOfLines={1}>{zone.name}</Text>
                <Text style={[styles.zoneMeta, { color: colors.textTertiary }]} numberOfLines={1}>
                  {zone.plan.name}{zone.account.name ? ` · ${maskAccount(zone.account.name)}` : ''}
                </Text>
              </View>
              <Icon name="chevron-right" size={16} color={colors.textTertiary} />
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={[styles.listCard, styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <Icon name="cloud-off" size={28} color={colors.textTertiary} />
          <Text style={{ color: colors.textSecondary, fontSize: FontSize.sm }}>{t('dashboard.no_zones')}</Text>
        </View>
      )}

      {/* Zone Picker Modal */}
      <Modal
        visible={zonePicker.visible}
        transparent
        animationType="slide"
        onRequestClose={() => setZonePicker({ visible: false, target: null })}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('dashboard.select_zone')}</Text>
              <TouchableOpacity onPress={() => setZonePicker({ visible: false, target: null })} hitSlop={8}>
                <Icon name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={zones}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.zonePickerItem, { borderTopColor: colors.borderLight }]}
                  onPress={() => selectZone(item.id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.zoneName, { color: colors.text }]}>{item.name}</Text>
                    <Text style={[styles.zoneMeta, { color: colors.textTertiary }]}>{item.plan.name}</Text>
                  </View>
                  <Badge
                    label={item.status}
                    variant={item.status === 'active' ? 'success' : item.status === 'pending' ? 'warning' : 'default'}
                  />
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: Spacing.sm, paddingBottom: Spacing.xxl },

  // Profile
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginHorizontal: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  greeting: { fontSize: FontSize.xs },
  name: { fontSize: FontSize.lg, fontWeight: '500', marginTop: 1 },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  statCard: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: 6,
  },
  statLabel: { fontSize: FontSize.xs },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statValue: { fontSize: 26, fontWeight: '400', letterSpacing: -0.5 },
  statDot: { width: 7, height: 7, borderRadius: 4 },

  // Sections
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '500',
    marginHorizontal: Spacing.lg + Spacing.xs,
    marginBottom: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: Spacing.lg + Spacing.xs,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  seeAll: { fontSize: FontSize.sm, fontWeight: '500' },

  // Quick actions
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
  },
  actionTile: {
    flexBasis: '31%',
    flexGrow: 1,
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: FontSize.xs, fontWeight: '500' },

  // Zones
  listCard: {
    marginHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  emptyCard: { alignItems: 'center', gap: Spacing.sm, padding: Spacing.xxl },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
  },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },
  zoneName: { fontSize: FontSize.md, fontWeight: '500' },
  zoneMeta: { fontSize: FontSize.xs, marginTop: 2 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '60%',
    paddingBottom: Spacing.xxxl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '500' },
  zonePickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },
});
