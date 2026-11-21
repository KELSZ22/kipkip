import { completeExtraction, isInstalled } from '@/ai/model';
import { modelById } from '@/ai/models';
import { extractionUser } from '@/ai/prompts';
import { extractByRules, mergeExtraction, parseModelOutput, plainNote, type DraftRecord } from '@/ai/extract';
import type { KnownPerson } from '@/ai/rules';

/**
 * Rules run when no model is installed, or when the model throws.
 * Invalid JSON is retried once, then the entry is kept as a single plain note.
 */
export async function organizeEntry(input: {
  text: string;
  people: KnownPerson[];
  now: Date;
  modelId: string | null;
}): Promise<DraftRecord[]> {
  const model = modelById(input.modelId);
  if (!model || !isInstalled(model)) return extractByRules(input);

  const people = input.people.map((person) => person.displayName);
  const user = extractionUser(input.text, input.now, people);
  let invalid = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await completeExtraction(model.id, user);
      const records = parseModelOutput(raw);
      if (records) return mergeExtraction({ ...input, modelRecords: records });
      invalid += 1;
    } catch (error) {
      console.error(error);
    }
  }

  if (invalid === 2) return plainNote(input.text);
  return extractByRules(input);
}
