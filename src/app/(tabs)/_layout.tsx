import { NativeTabs } from 'expo-router/native-tabs';

import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';

export default function TabsLayout() {
  const theme = useTheme();
  const t = useT();

  return (
    <NativeTabs
      backgroundColor={theme.background}
      indicatorColor={theme.backgroundSelected}
      labelStyle={{ selected: { color: theme.text } }}>
      <NativeTabs.Trigger name="today">
        <NativeTabs.Trigger.Label>{t('tabs.today')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="sun.max" md="today" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="capture">
        <NativeTabs.Trigger.Label>{t('tabs.capture')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="square.and.pencil" md="edit" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="records">
        <NativeTabs.Trigger.Label>{t('tabs.records')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="list.bullet" md="list" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="chika">
        <NativeTabs.Trigger.Label>{t('tabs.chika')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bubble.left" md="chat_bubble" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
