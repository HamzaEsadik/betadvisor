import { repos } from '@/src/db/repos';
import { freshDb } from '@/src/db/testUtils';
import { DEFAULT_PREFS, readPref, readPrefs, writePref } from './prefs';

describe('prefs', () => {
  it('defaults when unset and round-trips values', () => {
    const db = freshDb();
    expect(readPrefs(db)).toEqual(DEFAULT_PREFS);
    writePref(db, 'currency', '€');
    writePref(db, 'theme', 'light');
    writePref(db, 'notificationTime', '06:30');
    writePref(db, 'chooseIndividually', true);
    expect(readPrefs(db)).toEqual({
      ...DEFAULT_PREFS,
      currency: '€',
      theme: 'light',
      notificationTime: '06:30',
      chooseIndividually: true,
    });
  });

  it('refuses bad values and fails loudly on a malformed stored one', () => {
    const db = freshDb();
    expect(() => writePref(db, 'notificationTime', '7:30')).toThrow('bad value');
    expect(() => writePref(db, 'currency', 'BTC' as never)).toThrow('bad value');
    repos(db).settings.set('theme', 'sepia');
    expect(() => readPref(db, 'theme')).toThrow('setting theme: bad value "sepia"');
  });
});
