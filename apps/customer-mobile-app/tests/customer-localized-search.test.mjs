import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const built=await build({entryPoints:[fileURLToPath(new URL('../src/customer-quote.service.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.env.VITE_MAPTILER_KEY':'"fixture"','import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_ANON_KEY':'""','import.meta.env.VITE_SUPABASE_FUNCTIONS_URL':'""'}});
const {searchCustomerPlaces}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const names={en:['Addis Ababa','Ethiopia'],om:['Finfinne','Itoophiyaa'],am:['አዲስ አበባ','ኢትዮጵያ']};
const original=globalThis.fetch;
function useProviderFixture(){globalThis.fetch=async input=>{const u=new URL(input),[city,country]=names[u.searchParams.get('language')];return {ok:true,json:async()=>({features:[{id:'region.606',text:city,place_name:`${city}, ${country}`,place_type:['region'],center:[38.75,9.03]},{id:'place.4567631',text:'Addis Ababa',place_name:`Addis Ababa, Kirkos, ${country}`,place_type:['place'],center:[38.76,9.01]}]})};};}
for(const language of ['om','am'])test(`${language}: Latin city query selects canonical Addis city rather than similarly named district`,async()=>{useProviderFixture();try{const result=await searchCustomerPlaces('Addis ab',language);assert.equal(result.length,1);assert.deepEqual(result[0].coordinates,[38.75,9.03]);assert.equal(result[0].label,`${names[language][0]}, ${names[language][1]}`);}finally{globalThis.fetch=original;}});
test('English city-search behavior is preserved',async()=>{useProviderFixture();try{const result=await searchCustomerPlaces('Addis Ababa','en');assert.deepEqual(result,[{label:'Addis Ababa, Ethiopia',coordinates:[38.75,9.03]},{label:'Addis Ababa, Kirkos, Ethiopia',coordinates:[38.76,9.01]}]);}finally{globalThis.fetch=original;}});
test('Amharic city-name input resolves the same provider city identity',async()=>{useProviderFixture();try{const result=await searchCustomerPlaces('አዲስ አበባ','am');assert.deepEqual(result[0]?.coordinates,[38.75,9.03]);}finally{globalThis.fetch=original;}});
