import { TabScreen } from '@/components/tab-screen';
import { ThemedText } from '@/components/themed-text';
import { useT } from '@/lib/i18n';

export default function ChikaScreen() {
  const t = useT();

  return (
    <TabScreen title={t('chika.title')}>
      <ThemedText themeColor="textSecondary">{t('chika.placeholder')}</ThemedText>
    </TabScreen>
  );
}
