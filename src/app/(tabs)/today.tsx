import { TabScreen } from '@/components/tab-screen';
import { ThemedText } from '@/components/themed-text';
import { useT } from '@/lib/i18n';

export default function TodayScreen() {
  const t = useT();

  return (
    <TabScreen title={t('today.title')}>
      <ThemedText type="subtitle">{t('today.greeting')}</ThemedText>
      <ThemedText themeColor="textSecondary">{t('today.placeholder')}</ThemedText>
    </TabScreen>
  );
}
