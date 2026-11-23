import { Directory, File, Paths } from 'expo-file-system';

import type { ExportFile } from '@/features/vault/export-files';
import { zipStored } from '@/features/vault/zip';

export type ShareResult = 'shared' | 'empty' | 'unavailable' | 'failed' | 'needsBuild';

function exportFile(name: string): File {
  const directory = new Directory(Paths.cache, 'kipkip-export');
  if (!directory.exists) directory.create();
  return new File(directory, name);
}

/** Writes one zip of the monthly Markdown files and the CSV, then opens the share sheet. */
export async function shareExportFiles(files: ExportFile[], dialogTitle: string, archiveName: string): Promise<ShareResult> {
  if (files.length === 0) return 'empty';

  let Sharing: typeof import('expo-sharing');
  try {
    Sharing = await import('expo-sharing');
  } catch (error) {
    console.error(error);
    return 'needsBuild';
  }

  try {
    if (!(await Sharing.isAvailableAsync())) return 'unavailable';
    const archive = zipStored(
      files.map((file) => ({ name: file.name, data: new TextEncoder().encode(file.text) })),
    );
    const destination = exportFile(archiveName);
    if (destination.exists) destination.delete();
    destination.create();
    destination.write(archive);
    await Sharing.shareAsync(destination.uri, {
      mimeType: 'application/zip',
      dialogTitle,
      UTI: 'public.zip-archive',
    });
    return 'shared';
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : '';
    if (message.includes('native module') || message.includes('ExpoSharing')) return 'needsBuild';
    return 'failed';
  }
}
