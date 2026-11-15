// Optional live smoke check. Creates a synthetic QA account, never uses client data.
// Run: node --use-env-proxy server/cloud-check.js
import assert from 'node:assert/strict';
import { createAuthClient } from '@neon/auth';
import { BetterAuthVanillaAdapter } from '@neon/auth/vanilla/adapters';
import { emptyWorkspace } from './workspace.js';
const base = 'https://ep-damp-hat-az0isqf9.neonauth.c-3.ap-southeast-1.aws.neon.tech/clientdesk/auth';
const api = process.env.CLIENTDESK_API_URL || 'https://clientdesk-eta.vercel.app';
const origin = 'https://clientdesk-eta.vercel.app';
const cookies = new Map();
setTimeout(()=>{console.error('Smoke check timed out');process.exit(1)},120000).unref();
// Node has no browser cookie jar. Keep synthetic test cookies in memory only.
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith(base)) return nativeFetch(url,options);
  const headers = new Headers(options?.headers);headers.set('origin',origin);
  if(cookies.size)headers.set('cookie',[...cookies].map(([k,v])=>`${k}=${v}`).join('; '));
  const response = await nativeFetch(url,{...options,headers,signal:AbortSignal.timeout(30000)});
  for(const cookie of response.headers.getSetCookie()) {const first=cookie.split(';')[0];const i=first.indexOf('=');cookies.set(first.slice(0,i),first.slice(i+1));}
  return response;
};
const auth = createAuthClient(base, {adapter: BetterAuthVanillaAdapter({fetchOptions: {headers:{origin}}})});
const email=`clientdesk-qa-${crypto.randomUUID()}@example.com`;
const password=crypto.randomUUID()+'Aa1!';
try {
 const signup=await auth.signUp.email({email,password,name:'ClientDesk QA',callbackURL:origin});
 assert.equal(signup.error,null,signup.error?.message);console.log('Synthetic signup passed');
 const owner=signup.data.user.id;
 assert.equal((await auth.getSession()).data.user.id,owner);
 const tokenResult=await auth.token();
 const token=tokenResult.data?.token || tokenResult.data?.session?.token;assert.ok(token,tokenResult.error?.message);console.log('JWT acquired');
 const call=async(method,body,expected=owner,path='/api/workspace')=>{
  const r=await fetch(api+path,{method,headers:{origin,'Content-Type':'application/json',Authorization:'Bearer '+token,'X-Workspace-Owner':expected},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
  console.log('API',method,path,r.status);return {status:r.status,data:await r.json()};
 };
 const initial=await call('GET');assert.equal(initial.status,200,JSON.stringify(initial.data));assert.equal(initial.data.version,0);
 const data=emptyWorkspace();
 assert.equal((await call('PUT',{version:0,data})).status,200);
 assert.equal((await call('PUT',{version:0,data})).status,409);
 assert.equal((await call('PUT',{version:1,data},'different-account')).status,409);
 assert.equal((await call('PUT',{version:1,data:{...data,demo:true}})).status,200);
 assert.deepEqual((await call('GET',undefined,owner,'/api/workspace/previous')).data.data,data);
 assert.equal((await call('GET')).data.version,2);
 console.log('Signing out');await auth.signOut();
 const signin=await auth.signIn.email({email,password,callbackURL:origin});assert.equal(signin.error,null,signin.error?.message);
 assert.equal((await auth.getSession()).data.user.id,owner);
 console.log('Signing out');await auth.signOut();
 console.log('Live smoke check passed: signup, JWT, database save/read, conflict, account guard, previous version, signout and signin.');
 process.exit(0);
} catch(error) {console.error('Live smoke check failed:',error.message);process.exitCode=1;}

