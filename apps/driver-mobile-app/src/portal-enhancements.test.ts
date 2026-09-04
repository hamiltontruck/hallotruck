import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=fs.readFileSync(path.join(root,'src/portal-enhancements.ts'),'utf8');

if(!index.includes('/src/portal-enhancements.ts')) throw new Error('Driver Mobile V4 enhancement entry is not loaded.');
if(!source.includes(".eq('status', 'delivered')")) throw new Error('Trip History must remain scoped to delivered trips.');
if(!source.includes(".eq('driver_id', auth.user.id)")) throw new Error('Trip History must remain scoped to the authenticated driver.');
if(!source.includes('hallo-driver-mobile-v4-auth')) throw new Error('Enhancements must reuse the isolated Driver Mobile V4 auth session.');
if(!source.includes('HALLO Smart Logistics')) throw new Error('Driver Portal branding must remain present.');
console.log('Driver Mobile V4 portal enhancement contract: PASS');
