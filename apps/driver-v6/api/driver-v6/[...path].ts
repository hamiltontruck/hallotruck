import type { VercelRequest,VercelResponse } from '@vercel/node';
import {handle as login} from '../../endpoints/driver-v6/auth/login_POST';
import {handle as session} from '../../endpoints/driver-v6/auth/session_GET';
import {handle as logout} from '../../endpoints/driver-v6/auth/logout_POST';
const handlers:Record<string,{method:string;run:(request:Request)=>Promise<Response>}>={
'/api/driver-v6/auth/login':{method:'POST',run:login},
'/api/driver-v6/auth/session':{method:'GET',run:session},
'/api/driver-v6/auth/logout':{method:'POST',run:async()=>logout()}
};
export default async function handler(req:VercelRequest,res:VercelResponse){const raw=(req.url||'').split('?')[0];const path=raw.endsWith('/')?raw.slice(0,-1):raw;const route=handlers[path];if(!route)return res.status(404).json({error:'HALLO V6 endpoint not found.'});if((req.method||'GET').toUpperCase()!==route.method){res.setHeader('Allow',route.method);return res.status(405).json({error:'Method not allowed.'});}const headers=new Headers();for(const [name,value] of Object.entries(req.headers)){if(Array.isArray(value))headers.set(name,value.join(', '));else if(value)headers.set(name,value);}const body=route.method==='GET'||req.body===undefined?undefined:typeof req.body==='string'?req.body:JSON.stringify(req.body);const request=new Request('https://'+(req.headers.host||'localhost')+path,{method:route.method,headers,body});const result=await route.run(request);const cookies=(result.headers as Headers&{getSetCookie?:()=>string[]}).getSetCookie?.();if(cookies?.length)res.setHeader('Set-Cookie',cookies);result.headers.forEach((value,name)=>{if(name.toLowerCase()!=='set-cookie')res.setHeader(name,value);});return res.status(result.status).send(await result.text());}
