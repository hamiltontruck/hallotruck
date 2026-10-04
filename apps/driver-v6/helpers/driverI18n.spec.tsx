import { dictionaries } from './driverI18n';
describe('Driver V6 i18n',()=>{it('keeps EN/OR/AM key parity',()=>{const en=Object.keys(dictionaries.en).sort();expect(Object.keys(dictionaries.or).sort()).toEqual(en);expect(Object.keys(dictionaries.am).sort()).toEqual(en)})});
