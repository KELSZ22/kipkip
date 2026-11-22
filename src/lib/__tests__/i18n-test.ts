import { MESSAGES, translate, type MessageKey } from '@/lib/i18n';
import { TONES } from '@/lib/tone';

const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();

describe('i18n', () => {
  const keys = Object.keys(MESSAGES.english) as MessageKey[];

  it.each(TONES)('%s has non-empty text for every key', (tone) => {
    expect(Object.keys(MESSAGES[tone]).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      expect(MESSAGES[tone][key].trim()).not.toBe('');
    }
  });

  it.each(TONES)('%s uses the same placeholders as English', (tone) => {
    for (const key of keys) {
      expect(placeholders(MESSAGES[tone][key])).toEqual(placeholders(MESSAGES.english[key]));
    }
  });

  it('fills in placeholders per tone', () => {
    expect(translate('english', 'today.greeting.morning', { name: 'Lyn' })).toBe('Good morning. I’m Lyn.');
    expect(translate('taglish', 'today.greeting.morning', { name: 'Lyn' })).toBe('Magandang umaga. Ako si Lyn!');
    expect(translate('filipino', 'today.greeting.evening', { name: 'Lyn' })).toBe('Magandang gabi. Ako si Lyn.');
  });

  it('treats a name with special replacement characters literally', () => {
    expect(translate('english', 'today.greeting.morning', { name: '$& Lyn' })).toBe('Good morning. I’m $& Lyn.');
  });
});
