import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const outputDirectory = path.join(root, ".test-dist");
const esbuildBinary = path.join(root,"node_modules",".bin",process.platform === "win32" ? "esbuild.cmd" : "esbuild");
function run(command,args){const result=spawnSync(command,args,{cwd:root,stdio:"inherit",shell:false});if(result.error)throw result.error;if(result.status!==0)process.exitCode=result.status??1;return result.status===0;}
await rm(outputDirectory,{recursive:true,force:true});await mkdir(outputDirectory,{recursive:true});
try{
 const suites=[
  ["tests/regression/business-rules.test.ts",path.join(outputDirectory,"business-rules.test.mjs")],
  ["tests/regression/partner-foundation.test.ts",path.join(outputDirectory,"partner-foundation.test.mjs")],
  ["tests/regression/partner-onboarding.test.ts",path.join(outputDirectory,"partner-onboarding.test.mjs")],
  ["tests/regression/finance-dashboard-v3.test.ts",path.join(outputDirectory,"finance-dashboard-v3.test.mjs")],
  ["tests/regression/financial-corrections.test.ts",path.join(outputDirectory,"financial-corrections.test.mjs")],
  ["tests/regression/corrected-escrow-reconciliation.test.ts",path.join(outputDirectory,"corrected-escrow-reconciliation.test.mjs")],
  ["tests/regression/partner-wallet-commission.test.ts",path.join(outputDirectory,"partner-wallet-commission.test.mjs")],
  ["tests/regression/partner-settlement-enterprise.test.ts",path.join(outputDirectory,"partner-settlement-enterprise.test.mjs")],
  ["tests/regression/role-navigation.test.ts",path.join(outputDirectory,"role-navigation.test.mjs")],
  ["tests/regression/trip-completion-workflow.test.ts",path.join(outputDirectory,"trip-completion-workflow.test.mjs")],
 ];
 for(const [source,output] of suites){const bundled=run(esbuildBinary,[source,"--bundle","--platform=node","--format=esm","--target=node22",`--outfile=${output}`]);if(!bundled)process.exit(process.exitCode||1);}
 const passed=run(process.execPath,["--test",...suites.map(([,output])=>output)]);if(!passed)process.exit(process.exitCode||1);
}finally{await rm(outputDirectory,{recursive:true,force:true});}
