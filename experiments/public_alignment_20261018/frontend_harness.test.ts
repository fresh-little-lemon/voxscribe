/** DOM orchestration against captured real timings. Network is replayed, never model-fabricated. */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import React from 'react';
import {beforeEach,afterEach,expect,test,vi} from 'vitest';
import {render,cleanup,screen,fireEvent,waitFor} from '@testing-library/react';
import App from '../../frontend/src/App';
import {applyIncrementalAlignment} from '../../frontend/src/incremental-alignment';
import {loadManifest,loadCaseBase,casePlan,resultSegments,savedDocument,type HarnessCase} from './frontend_harness';
import type {SavedDocument} from '../../frontend/src/library-store';

const manifestPath=process.env.VOXSCRIBE_HARNESS_MANIFEST;
if(!manifestPath)throw Error('VOXSCRIBE_HARNESS_MANIFEST must point to captured real backend timings');
const loaded=loadManifest(manifestPath);
const deletion=loaded.manifest.cases.find(c=>c.kind==='deletion'&&casePlan(loaded,c).kind==='preserved');
const localCases=loaded.manifest.cases.filter(c=>casePlan(loaded,c).kind==='align'&&c.backendResult);
const successful=localCases.find(c=>{try{const p=casePlan(loaded,c);applyIncrementalAlignment(p,resultSegments(loaded,c,p),p.revision,p.text);return true}catch{return false}});
const anyLocal=localCases[0];
const baselineCopy=(v:unknown)=>JSON.parse(JSON.stringify(v));
beforeEach(()=>{localStorage.clear();URL.createObjectURL=vi.fn(()=> 'blob:captured-public-speech');URL.revokeObjectURL=vi.fn()});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()});
function mount(c:HarnessCase){
 const base=loadCaseBase(loaded,c);let snapshot:SavedDocument=savedDocument(loaded,base);
 // Real file bytes are optional for DOM orchestration; no decoded playback occurs in jsdom.
 const bytes=loaded.manifest.audioPath?readFileSync(resolve(loaded.directory,loaded.manifest.audioPath)):new Uint8Array();
 const file=new File([bytes],'captured-public-speech.wav',{type:'audio/wav',lastModified:1});
 const view=render(React.createElement(App,{documentId:'real-public-'+c.name,initialDocument:snapshot,initialFile:file,disablePrivateDemo:true,onSnapshot:(d:SavedDocument)=>{snapshot=baselineCopy(d)}}));
 const video=view.container.querySelector('video')!;Object.defineProperty(video,'duration',{configurable:true,value:loaded.manifest.duration});fireEvent.loadedMetadata(video);
 return {...view,base,video,get snapshot(){return snapshot}};
}
function edit(c:HarnessCase,id:string){fireEvent.click(screen.getByLabelText('编辑段落 '+id));fireEvent.input(screen.getByLabelText('编辑逐字稿'),{target:{textContent:c.text}});fireEvent.click(screen.getByText('完成'))}
function replay(c:HarnessCase,delayed=false){
 let resolveResponse!:(v:unknown)=>void;let requestedRevision='';
 const fetch=vi.fn((_url,options)=>{const request=JSON.parse(options.body.get('transcript'));requestedRevision=request.revision;const plan=casePlan(loaded,c);expect(request.segments.map(({speaker,...j}:any)=>j)).toEqual(plan.jobs);const data={revision:requestedRevision,method:'Captured real backend response replay',segments:resultSegments(loaded,c,plan)};return delayed?new Promise(resolve=>{resolveResponse=()=>resolve({ok:true,json:async()=>data})}):Promise.resolve({ok:true,json:async()=>data})});
 vi.stubGlobal('fetch',fetch);return {fetch,complete:()=>resolveResponse(undefined)};
}

test.runIf(!!deletion)('real-timing whole-word deletion sends zero requests; App undo/redo restores exact arrays',()=>{
 const c=deletion!,view=mount(c),original=baselineCopy(view.snapshot),p=casePlan(loaded,c);const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 edit(c,view.base.id);expect(view.snapshot.segments[0].words).toEqual(p.words);expect(view.snapshot.segments[0].stale).toBe(false);
 const edited=baselineCopy(view.snapshot);fireEvent.click(screen.getByText('重新对齐'));expect(fetch).not.toHaveBeenCalled();
 fireEvent.click(screen.getByLabelText('撤销已保存修改'));expect(view.snapshot).toEqual(original);
 fireEvent.click(screen.getByLabelText('重做已保存修改'));expect(view.snapshot).toEqual(edited);
});

test.runIf(!!successful)('captured real local result applies only edited words; undo/redo retains text, timings and pending plan',async()=>{
 const c=successful!,view=mount(c),original=baselineCopy(view.snapshot),p=casePlan(loaded,c);const network=replay(c);
 edit(c,view.base.id);const pending=baselineCopy(view.snapshot);expect(pending.segments[0].stale).toBe(true);expect(pending.segments[0].words).toEqual(view.base.words);
 fireEvent.click(screen.getByText('重新对齐'));await waitFor(()=>expect(view.snapshot.segments[0].stale).toBe(false));expect(network.fetch).toHaveBeenCalledTimes(1);
 const final=baselineCopy(view.snapshot);expect(final.segments[0].words).toEqual(applyIncrementalAlignment(p,resultSegments(loaded,c,p),p.revision,p.text));
 fireEvent.click(screen.getByLabelText('撤销已保存修改'));expect(view.snapshot).toEqual(pending);
 fireEvent.click(screen.getByLabelText('撤销已保存修改'));expect(view.snapshot).toEqual(original);
 fireEvent.click(screen.getByLabelText('重做已保存修改'));expect(view.snapshot).toEqual(pending);
 fireEvent.click(screen.getByLabelText('重做已保存修改'));expect(view.snapshot).toEqual(final);
});

test.runIf(!!anyLocal)('pending local edit hides changed word timing but preserves unchanged buttons and exact gaps',()=>{
 const c=anyLocal!,view=mount(c),p=casePlan(loaded,c);edit(c,view.base.id);
 const expected=view.base.words.map((_,index)=>index).filter(index=>!p.jobs.some(j=>index>=j.replaceFrom&&index<j.replaceTo));
 expect([...view.container.querySelectorAll('button[data-word-index]')].map(b=>Number((b as HTMLElement).dataset.wordIndex))).toEqual(expected);
 for(const time of [...new Set(view.base.words.flatMap(w=>[w.start,w.end,(w.start+w.end)/2]))].sort((a,b)=>a-b)){
  Object.defineProperty(view.video,'currentTime',{configurable:true,value:time});fireEvent.timeUpdate(view.video);
  const expectedIndex=view.base.words.findIndex((w,index)=>expected.includes(index)&&w.end-w.start>=.02&&time>=w.start&&time<w.end);
  const active=[...view.container.querySelectorAll('button.word[aria-current="true"]')].map(b=>Number((b as HTMLElement).dataset.wordIndex));expect(active).toEqual(expectedIndex<0?[]:[expectedIndex]);
 }
});

test('real baseline playback active-word indices are monotone and clear at each real word end/gap',()=>{
 const c:HarnessCase={name:'playback',kind:'replacement',text:loaded.baseline.text};const view=mount(c);let previous=-1;
 for(const time of [...new Set(view.base.words.flatMap(w=>[w.start,w.end,(w.start+w.end)/2]))].sort((a,b)=>a-b)){
  Object.defineProperty(view.video,'currentTime',{configurable:true,value:time});fireEvent.timeUpdate(view.video);
  const expected=view.base.words.findIndex(w=>w.end-w.start>=.02&&time>=w.start&&time<w.end);
  const active=[...view.container.querySelectorAll('button.word[aria-current="true"]')].map(b=>Number((b as HTMLElement).dataset.wordIndex));expect(active).toEqual(expected<0?[]:[expected]);if(expected>=0){expect(expected).toBeGreaterThanOrEqual(previous);previous=expected}
 }
});

test.runIf(!!anyLocal).each(['text','anchors','undo','media'])('late captured real result is discarded after %s changes',async(change)=>{
 const c=anyLocal!,view=mount(c);edit(c,view.base.id);const network=replay(c,true);fireEvent.click(screen.getByText('重新对齐'));
 if(change==='undo')fireEvent.click(screen.getByLabelText('撤销已保存修改'));
 else if(change==='media'){fireEvent.change(view.container.querySelector('input[accept="audio/*,video/*"]')!,{target:{files:[new File(['different media identity'],'other.wav',{type:'audio/wav'})]}})}
 else {fireEvent.click(screen.getByLabelText('编辑段落 '+view.base.id));if(change==='text')fireEvent.input(screen.getByLabelText('编辑逐字稿'),{target:{textContent:c.text+' pending change'}});else {fireEvent.click(screen.getByText('时间范围'));fireEvent.change(screen.getByLabelText('开始（秒）'),{target:{value:'0.1'}})}}
 const before=baselineCopy(view.snapshot);network.complete();await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('对齐结果未应用'));expect(view.snapshot).toEqual(before);
});
