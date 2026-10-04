import { dictionaries } from './driverI18n';
describe('Driver V6 i18n', () => {
  it('keeps EN/OR/AM key parity', () => {
    const en = Object.keys(dictionaries.en).sort();
    expect(Object.keys(dictionaries.or).sort()).toEqual(en);
    expect(Object.keys(dictionaries.am).sort()).toEqual(en);
  });

  it('contains the full Driver V6 login copy in every language', () => {
    for (const locale of ['en', 'or', 'am'] as const) {
      expect(dictionaries[locale].welcomeDrivers).toBeTruthy();
      expect(dictionaries[locale].email).toBeTruthy();
      expect(dictionaries[locale].password).toBeTruthy();
      expect(dictionaries[locale].signInAction).toBeTruthy();
      expect(dictionaries[locale].secureLogin).toBeTruthy();
      expect(dictionaries[locale].fastPayouts).toBeTruthy();
      expect(dictionaries[locale].liveTracking).toBeTruthy();
      expect(dictionaries[locale].support247).toBeTruthy();
    }
  });
});
