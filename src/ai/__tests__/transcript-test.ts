import { cleanTranscript, mergeTranscript } from '@/ai/transcript';

describe('cleanTranscript', () => {
  it('drops whisper noise tags and extra space', () => {
    expect(cleanTranscript('  [BLANK_AUDIO]  Nag-lunch kami ni Mark.  ')).toBe('Nag-lunch kami ni Mark.');
    expect(cleanTranscript('(music) ♪')).toBe('');
    expect(cleanTranscript('[00:00:00.000 --> 00:00:01.200]  Bukas ko tatawagan si Angel.')).toBe(
      'Bukas ko tatawagan si Angel.',
    );
  });
});

describe('mergeTranscript', () => {
  it('keeps typed text and appends what was said', () => {
    expect(mergeTranscript('Lunch with Mark.', ' Promised Angel I’ll call her tonight. ')).toBe(
      'Lunch with Mark. Promised Angel I’ll call her tonight.',
    );
  });

  it('leaves the box unchanged when nothing was heard', () => {
    expect(mergeTranscript('Keep this.', '[BLANK_AUDIO]')).toBe('Keep this.');
    expect(mergeTranscript('', '   ')).toBe('');
  });
});
