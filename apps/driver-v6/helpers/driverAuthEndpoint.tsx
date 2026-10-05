export const SUPABASE_NOT_CONFIGURED='HALLO Supabase connection is not configured yet.';
export function getMissingSupabaseConfigResponse(){return Response.json({error:SUPABASE_NOT_CONFIGURED},{status:503});}
export function getSignedOutSessionResponse(){return Response.json({access:'signed-out'},{status:200});}
export function hasSupabasePublicConfig(env:Record<string,string|undefined>=process.env as Record<string,string|undefined>){const url=env.HALLO_AUTH_API_URL?.trim()||env.SUPABASE_URL?.trim();const key=env.HALLO_AUTH_PUBLIC_KEY?.trim()||env.SUPABASE_PUBLISHABLE_KEY?.trim();return Boolean(url&&key);}
