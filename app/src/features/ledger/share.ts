/** Writes the CSV to the cache directory and opens the Android share sheet. */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function shareCsv(fileName: string, csv: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available');
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.writeSync(csv);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export ledger' });
}
