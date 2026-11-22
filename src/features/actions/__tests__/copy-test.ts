import { reminderText } from '@/features/actions/copy';

describe('reminder copy', () => {
  it('uses the companion name and the person in the chosen tone', () => {
    expect(reminderText('taglish', 'Lyn', 'Tawagan mo na', 'Angel')).toEqual({
      title: 'Lyn',
      body: 'Bes, may pramis ka kay Angel. Tawagan mo na',
    });
    expect(reminderText('english', 'Lyn', 'Call Angel', null).body).toBe('You promised: Call Angel');
    expect(reminderText('filipino', 'Lyn', 'Tawagan', 'Angel').body).toBe('May pangako ka kay Angel. Tawagan');
  });
});
