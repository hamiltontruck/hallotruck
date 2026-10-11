import assert from "node:assert/strict";
import { build } from "esbuild";

// Exercise the page's actual render branches and async load transitions without WebGL.
const state = [];
let cursor = 0;
const effects = [];
globalThis.__liveHooks = {
  useState(initial) {
    const slot = cursor++;
    if (!(slot in state)) state[slot] = initial;
    return [state[slot], value => { state[slot] = value; }];
  },
  useEffect(effect) { effects.push(effect); },
  useCallback(fn) { return fn; },
  useMemo(fn) { return fn(); },
};
let release;
globalThis.__liveMemberships = async () => [{ partner_id: "TEST-partner" }];
globalThis.__liveTrips = async () => ({ trips: [], warnings: [] });
const bundle = await build({
  entryPoints: ["src/pages/PartnerLiveOperations.tsx"], bundle: true, write: false,
  format: "esm", platform: "node", jsx: "transform", jsxFactory: "element", jsxFragment: "fragment",
  tsconfigRaw: { compilerOptions: { jsx: "react" } },
  banner: { js: "const fragment = 'fragment'; const element = (type, props, ...children) => ({type, props: {...props, children}});" },
  plugins: [{ name: "render-boundaries", setup(builder) {
    builder.onResolve({ filter: /^(react|react-router-dom)$|PartnerLiveOperationsMap|partner\.service|partner-live-operations\.service/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", contents:
      args.path === "react" ? "export const {useState,useEffect,useCallback,useMemo}=globalThis.__liveHooks;" :
      args.path === "react-router-dom" ? "export const Link='link'; export const useSearchParams=()=>[new URLSearchParams()];" :
      args.path.includes("PartnerLiveOperationsMap") ? "export const PartnerLiveOperationsMap='fleet-map';" :
      args.path.includes("partner-live-operations") ? "export const loadPartnerLiveOperations=(...args)=>globalThis.__liveTrips(...args);" :
      "export const getCurrentPartnerMemberships=()=>globalThis.__liveMemberships();"
    }));
  } }],
});
const { PartnerLiveOperations } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
function render() { cursor = 0; effects.length = 0; return PartnerLiveOperations(); }
function find(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) { for (const child of node) { const result = find(child, predicate); if (result) return result; } return null; }
  return predicate(node) ? node : find(node.props?.children, predicate);
}
const settled = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
render();
effects[0]();
await settled();
let tree = render();
assert.ok(find(tree, node => node.type === "fleet-map"), "empty-trip map renders after initial load");
const refresh = find(tree, node => node.type === "button").props.onClick;
globalThis.__liveMemberships = () => new Promise(resolve => { release = resolve; });
refresh();
tree = render();
assert.ok(find(tree, node => node.type === "fleet-map"), "refresh must retain the empty-trip map instead of unmounting it");
release([{ partner_id: "TEST-partner" }]);
await settled();
assert.ok(find(render(), node => node.type === "fleet-map"), "map remains after empty refresh");
globalThis.__liveMemberships = async () => { throw new Error("network unavailable"); };
find(render(), node => node.type === "button").props.onClick();
await settled();
tree = render();
assert.ok(find(tree, node => node.type === "fleet-map"), "failed refresh retains map");
assert.ok(find(tree, node => node.props?.role === "alert"), "failed refresh shows error");
console.log("Partner live refresh: empty-trip map persists during refresh and errors PASS");
