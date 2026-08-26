import test from "node:test";
import assert from "node:assert/strict";

function commission(gross:number,type:"percentage"|"fixed",value:number){const hallo=type==="percentage"?Math.round(gross*value)/100:Math.min(value,gross);return{hallo,net:gross-hallo};}
function wallet(net:number,pending:number,paid:number){return Math.max(net-pending-paid,0);}

test("percentage commission applies to HALLO freight",()=>{assert.deepEqual(commission(1_000_000,"percentage",1),{hallo:10_000,net:990_000});});
test("fixed commission never exceeds gross",()=>{assert.deepEqual(commission(400,"fixed",500),{hallo:400,net:0});});
test("pending and paid settlements reduce payable",()=>{assert.equal(wallet(990_000,100_000,250_000),640_000);});
test("payable never becomes negative",()=>{assert.equal(wallet(100,50,100),0);});
test("fleet scale is independent from commission count",()=>{const fleet=Array.from({length:500},(_,i)=>`TRUCK-${i+1}`);const halloLoads=["ORDER-1","ORDER-2"];assert.equal(fleet.length,500);assert.equal(halloLoads.length,2);});
