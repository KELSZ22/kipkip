import { z } from 'zod';

export const TONES = ['english', 'taglish', 'filipino'] as const;

export const toneSchema = z.enum(TONES);

export type Tone = z.infer<typeof toneSchema>;
