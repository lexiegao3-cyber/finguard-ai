import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
export async function context(){const user=await getChatGPTUser();if(!user)throw new Error('AUTH');if(!env.DB)throw new Error('Database unavailable');return {db:env.DB,user:user.userId};}
export function respond(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
export function failure(e:unknown){return respond({error:e instanceof Error&&e.message==='AUTH'?'Please sign in to continue.':'Unable to process request. Please try again.'},e instanceof Error&&e.message==='AUTH'?401:500);}
export async function input(req:Request){if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)throw new Error('Origin');if(Number(req.headers.get('content-length')||0)>65536)throw new Error('Too large');const raw=await req.text();if(raw.length>65536)throw new Error('Too large');return JSON.parse(raw);}
