// Requires an actual running Traccar instance and real configured credentials.
// Prints metadata only; never prints GPS coordinates, credentials or IMEI.
import { createTraccarClient } from "./client.mjs";
const baseUrl=process.env.TRACCAR_URL, token=process.env.TRACCAR_TOKEN;
const email=process.env.TRACCAR_EMAIL,password=process.env.TRACCAR_PASSWORD;
if(!baseUrl || !(token || (email&&password))) { console.error("Set TRACCAR_URL plus TRACCAR_TOKEN or TRACCAR_EMAIL/TRACCAR_PASSWORD"); process.exitCode=2; }
else {
 try {
  const client=createTraccarClient({baseUrl,token,email,password});
  const devices=await client.devices(),positions=await client.positions();
  console.log(JSON.stringify({api:"connected",deviceCount:devices.length,positionCount:positions.length,hasValidFix:positions.some(p=>p.valid!==false&&Number.isFinite(Date.parse(p.fixTime)))}));
  if(!devices.length||!positions.some(p=>p.valid!==false&&Number.isFinite(Date.parse(p.fixTime)))) { console.error("Real hardware telemetry not yet verified"); process.exitCode=3; }
 } catch(e){console.error("Traccar connection failed:",e.message);process.exitCode=1;}
}
