import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./app.js";
import { handleWorkspace, emptyWorkspace, workspaceStore } from "./workspace.js";

test("API rejects missing auth, invalid input, and another origin", async () => {
  let writes = 0;
  const deps = { verify: async token => { if(token !== "Bearer test")throw Error();return "owner-a"; },
    store: { read: async owner => ({ data: emptyWorkspace(), version: 0, owner }), save: async () => {writes++;return null;} } };
  const server = createApp(deps, new Set(["https://clientdesk.test"])).listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const url = "http://127.0.0.1:" + server.address().port + "/api/workspace";
  try {
    assert.equal((await fetch(url)).status,401);
    assert.equal((await fetch(url,{headers:{origin:"https://evil.test",authorization:"Bearer test","x-workspace-owner":"owner-a"}})).status,403);
    const preflight = await fetch(url,{method:"OPTIONS",headers:{origin:"https://clientdesk.test"}});
    assert.equal(preflight.status,204);
    const malformed=await fetch(url,{method:"PUT",headers:{"Content-Type":"application/json",authorization:"Bearer test","x-workspace-owner":"owner-a"},body:"{"});
    assert.equal(malformed.status,400);
    const invalid=await fetch(url,{method:"PUT",headers:{"Content-Type":"application/json",authorization:"Bearer test","x-workspace-owner":"owner-a"},body:JSON.stringify({version:0,data:{}})});
    assert.equal(invalid.status,400);assert.equal(writes,0);
    const conflict=await fetch(url,{method:"PUT",headers:{"Content-Type":"application/json",authorization:"Bearer test","x-workspace-owner":"owner-a"},body:JSON.stringify({version:0,data:emptyWorkspace(),owner_id:"someone-else"})});
    assert.equal(conflict.status,409);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test("server derives ownership from verified token for reads, writes and recovery",async()=>{
  const owners=[];
  const store={read:async owner=>{owners.push(owner);return{version:0,data:emptyWorkspace()}},
    save:async owner=>{owners.push(owner);return{version:1,data:emptyWorkspace()}},
    previous:async owner=>{owners.push(owner);return emptyWorkspace()}};
  const deps={verify:async()=>"verified-user",store};
  for(const [method,path,body] of [["GET","/api/workspace"],["PUT","/api/workspace",{version:0,data:emptyWorkspace(),owner_id:"victim"}],["GET","/api/workspace/previous"]]){
    assert.equal((await handleWorkspace({method,path,body,expectedOwner:"verified-user"},deps)).status,200);
  }
  assert.deepEqual(owners,["verified-user","verified-user","verified-user"]);
});
test("SQL writes are parameterized and compare owner plus version",async()=>{
  const calls=[];
  const pool={query:async(...args)=>{calls.push(args);return {rows:[]}}};
  const store=workspaceStore(pool);
  await store.save("owner'; DROP TABLE x;--",emptyWorkspace(),4);
  assert.match(calls[0][0],/WHERE owner_id = \$1 AND version = \$3/);
  assert.equal(calls[0][1][2],4);assert.equal(calls[0][1][0],"owner'; DROP TABLE x;--");
  assert.match(calls[0][0],/previous_data = data/);
});

test("an account switch cannot write an old workspace into the new account", async () => {
  let touched = false;
  const result = await handleWorkspace({method:"PUT",path:"/api/workspace",expectedOwner:"old-user",body:{version:0,data:emptyWorkspace()}}, {verify:async()=>"new-user",store:{save:async()=>{touched=true}}});
  assert.equal(result.status,409);
  assert.equal(touched,false);
});

