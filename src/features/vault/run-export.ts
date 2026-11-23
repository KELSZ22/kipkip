import { buildExportFiles } from '@/features/vault/export-files';
import { shareExportFiles, type ShareResult } from '@/features/vault/share-export';
import { listExportRows } from '@/db/repo/records';
import type { SqlDb } from '@/db/types';

export function exportArchiveName(isPrivate: boolean): string {
  return isPrivate ? 'kipkip-private.zip' : 'kipkip.zip';
}

export async function exportRecords(input: {
  db: SqlDb;
  isPrivate: boolean;
  dialogTitle: string;
}): Promise<ShareResult> {
  const rows = await listExportRows(input.db, input.isPrivate);
  return shareExportFiles(buildExportFiles(rows), input.dialogTitle, exportArchiveName(input.isPrivate));
}
