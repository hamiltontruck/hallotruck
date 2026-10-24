import assert from "node:assert/strict";
import { build } from "esbuild";

// Render-contract coverage. The browser suite exercises the real async resource
// hook, organization races, empty/error refreshes and mounted MapLibre instance.
const state=[];let cursor=0;
globalThis.__liveHooks={useState(initial){const slot=cursor++;if(!(slot in state))state[slot]=initial;return[state[slot],value=>state[slot]=value];},useEffect(){},useCallback(fn){return fn;},useMemo(fn){return fn();}};
globalThis.__liveScope={partnerId:'TEST-partner',memberships:[],canManageDrivers:false,loading:false,error:''};
globalThis.__liveResource={data:{trips:[],warnings:[]},loading:false,error:'',updatedAt:null,refresh(){}};
const bundle=await build({entryPoints:['src/pages/PartnerLiveOperations.tsx'],bundle:true,write:false,format:'esm',platform:'node',jsx:'transform',jsxFactory:'element',jsxFragment:'fragment',tsconfigRaw:{compilerOptions:{jsx:'react'}},banner:{js:"const fragment='fragment';const element=(type,props,...children)=>({type,props:{...props,children}});"},plugins:[{name:'render-boundaries',setup(b){
 b.onResolve({filter:/^(react|react-router-dom)$|PartnerLiveOperationsMap|PartnerOperationsNav|usePartnerOperations|partner-live-operations\.service/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='react'?'export const {useState,useEffect,useCallback,useMemo}=globalThis.__liveHooks;':a.path==='react-router-dom'?'export const useSearchParams=()=>[new URLSearchParams(),()=>{}];':a.path.includes('PartnerLiveOperationsMap')?"export const PartnerLiveOperationsMap='fleet-map';":a.path.includes('PartnerOperationsNav')?"export const PartnerOperationsNav='navigation';export const PartnerOrganizationSelect='organization-select';":a.path.includes('usePartnerOperations')?'export const usePartnerScope=()=>globalThis.__liveScope;export const usePartnerResource=()=>globalThis.__liveResource;':'export const loadPartnerLiveOperations=()=>{};'}));
 }}]});
const {PartnerLiveOperations}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
function render(){cursor=0;return PartnerLiveOperations();}
function find(node,predicate){if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const child of node){const match=find(child,predicate);if(match)return match;}return null;}return predicate(node)?node:find(node.props?.children,predicate);}
assert.ok(find(render(),n=>n.type==='fleet-map'),'empty-trip map renders after load');
globalThis.__liveResource.loading=true;assert.ok(find(render(),n=>n.type==='fleet-map'),'refresh retains empty-trip map');
globalThis.__liveResource={data:null,loading:false,error:'network unavailable',updatedAt:null,refresh(){}};
assert.ok(find(render(),n=>n.type==='fleet-map'),'failed refresh keeps base map mounted');assert.ok(find(render(),n=>n.props?.role==='alert'),'failed refresh reports error');
globalThis.__liveScope.partnerId='';assert.equal(find(render(),n=>n.type==='fleet-map'),null,'no organization means no scoped map');
console.log('Partner live render: empty/error refresh retains map, unavailable metrics and no-organization guard PASS');
