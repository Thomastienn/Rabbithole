import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
const run=promisify(execFile), session=`compact-${process.pid}`;
const b=async(...args)=>(await run('agent-browser',['--session',session,...args])).stdout;
const ev=async x=>JSON.parse(await b('eval',x,'--json')).data.result;
const store=new Store(join(mkdtempSync(join(tmpdir(),'compact-')),'data.sqlite'));
const root=store.create('Fixture tree'); const msg=store.message(root.id,'assistant','A passage','completed'); store.branch(root,{messageId:msg,start:0,end:1,text:'A',question:'Branch'},'fixture');
const app=createApp({store,auth:{status:()=>({connected:false})},provider:{}}); await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
try {
 await b('open',`http://127.0.0.1:${app.server.address().port}`); await b('wait','--fn','document.querySelectorAll(".react-flow__node").length === 2');
 assert.equal(await ev('getComputedStyle(document.querySelector(".trees")).display'), 'none');
 await b('wait','--fn',`document.querySelector('[aria-label="Current zoom"]') !== null`);
 let before=await ev(`document.querySelector('[aria-label="Current zoom"]').textContent`);
 await b('find','role','button','click','--name','Zoom in','--exact');
 await b('wait','--fn',`document.querySelector('[aria-label="Current zoom"]').textContent !== ${JSON.stringify(before)}`);
 await b('find','role','button','click','--name','Fit tree','--exact');
 await b('wait','--fn',`(()=>{const c=document.querySelector('.tree-canvas').getBoundingClientRect();return [...document.querySelectorAll('.react-flow__node')].every(n=>{const r=n.getBoundingClientRect();return r.left>=c.left-1&&r.right<=c.right+1&&r.top>=c.top-1&&r.bottom<=c.bottom+1})})()`);
 assert.equal(await ev(`(()=>{const c=document.querySelector('.tree-canvas').getBoundingClientRect();return [...document.querySelectorAll('.react-flow__node')].every(n=>{const r=n.getBoundingClientRect();return r.left>=c.left-1&&r.right<=c.right+1&&r.top>=c.top-1&&r.bottom<=c.bottom+1})})()`),true);
 await b('find','role','button','click','--name','Map menu','--exact'); await b('wait','--fn','document.querySelector("[role=menu]") !== null');
 assert.equal(await ev(`[...document.querySelector('[role=menu]').querySelectorAll('[role=menuitem]')].filter(e=>['Expand all','Collapse all','Keep current branch'].includes(e.textContent.trim())).length === 3 && [...document.querySelector('[role=menu]').querySelectorAll('[role=menuitem]')].filter(e=>['Expand all','Collapse all','Keep current branch'].includes(e.textContent.trim())).every(e=>e.getAttribute('aria-disabled') !== 'true')`), true);
 await b('press','Escape'); await b('wait','--fn','document.activeElement?.getAttribute("aria-label") === "Map menu"');
 await b('press','Enter'); await b('wait','--fn','document.querySelector("[role=menu]") !== null'); await b('press','Escape'); await b('wait','--fn','document.activeElement?.getAttribute("aria-label") === "Map menu"');
 await b('find','role','button','click','--name','Map menu','--exact'); await b('find','role','menuitem','click','--name','Learning trees','--exact'); await b('wait','--fn','getComputedStyle(document.querySelector(".trees")).display !== "none"');
 const emptyStore = new Store(join(mkdtempSync(join(tmpdir(), 'compact-empty-')), 'data.sqlite'));
 const emptyApp = createApp({store: emptyStore, auth: {status: () => ({connected: false})}, provider: {}});
 await new Promise(r => emptyApp.server.listen(0, '127.0.0.1', r));
 try {
  await b('open', `http://127.0.0.1:${emptyApp.server.address().port}`);
  await b('find','role','button','click','--name','Map menu','--exact');
  await b('wait','--fn','document.querySelector("[role=menu]") !== null');
  assert.equal(await ev(`[...document.querySelector('[role=menu]').querySelectorAll('[role=menuitem]')].filter(e=>['Expand all','Collapse all','Keep current branch'].includes(e.textContent.trim())).length === 3 && [...document.querySelector('[role=menu]').querySelectorAll('[role=menuitem]')].filter(e=>['Expand all','Collapse all','Keep current branch'].includes(e.textContent.trim())).every(e=>e.getAttribute('aria-disabled') === 'true')`), true);
 } finally { emptyApp.stop(); emptyStore.close(); }
 console.log('PASS: zoom percentage, fit nodes, collapsed navigation, pointer and keyboard menu, Escape focus restoration, tree navigation.');
} finally {await b('close').catch(()=>{});app.stop();store.close()}
