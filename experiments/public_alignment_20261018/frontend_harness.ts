/**
 * Production-code checks against captured REAL backend results. Never generates timings.
 * Build/run from repository root:
 * frontend/node_modules/.bin/esbuild experiments/public_alignment_20261018/frontend_harness.ts --bundle --platform=node --format=cjs --outfile=experiments/public_alignment_20261018/frontend_harness.cjs
 * node experiments/public_alignment_20261018/frontend_harness.cjs MANIFEST.json [REPORT.json]
 * With no backendResult on a case, its plan/jobs are emitted for a real backend call.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {planIncrementalEdit,applyIncrementalAlignment,canonical,type EditPlan} from '../../frontend/src/incremental-alignment';
import {mapTranscriptDisplay,mapPendingTranscriptDisplay} from '../../frontend/src/transcript-display';
import {HighlightSpring,transferDuration,type HighlightRect} from '../../frontend/src/highlight-motion';
import {createHistory,appendRevision,currentRevision,restoreRevision,revisionToken,assertCurrentRevision,writeHistory,readHistory} from '../../frontend/src/revision-history';
import type {Segment,Word} from '../../frontend/src/demo';
import type {SavedDocument} from '../../frontend/src/library-store';

export type BackendInput=string|Record<string,unknown>;
export type HarnessCase={name:string;kind:'omission_restoration'|'deletion'|'unspoken_insertion'|'multi_sentence'|'replacement';text:string;base?:BackendInput;baseline?:BackendInput;baseSegmentId?:string;backendResult?:BackendInput;expectedPlan?:EditPlan['kind'];expectedOutcome?:'accepted'|'rejected'|'blocked'};
export type HarnessManifest={duration:number;mediaIdentity:string;language?:string;audioPath?:string;baseline:BackendInput;baselineSegmentId?:string;cases:HarnessCase[]};
export type LoadedManifest={manifest:HarnessManifest;directory:string;baseline:Segment};

export function readInput(input:BackendInput,directory:string):any {
 return typeof input==='string'?JSON.parse(readFileSync(resolve(directory,input),'utf8')):input;
}
export function segmentFrom(input:BackendInput,directory:string,id?:string):Segment {
 const data=readInput(input,directory);
 const s=Array.isArray(data.segments)?(id?data.segments.find((s:Segment)=>s.id===id):data.segments[0]):data;
 assert(s&&Array.isArray(s.words),'Baseline must contain real words from the backend');
 const text=s.text??s.transcript;
 assert.equal(typeof text,'string','Baseline needs text or transcript');
 assert(s.words.length>0,'Empty baseline is not real alignment evidence');
 const words:Word[]=s.words;
 for(const w of words)assert(typeof w.text==='string'&&Number.isFinite(w.start)&&Number.isFinite(w.end),'Invalid backend word');
 return {...s,id:s.id??id??'sample',speaker:s.speaker??'Public sample speaker',text,start:s.start??data.audio_window?.[0]??words[0].start,end:s.end??data.audio_window?.[1]??words.at(-1)!.end,words,stale:false};
}
export function loadManifest(path:string):LoadedManifest {
 const manifest:HarnessManifest=JSON.parse(readFileSync(path,'utf8'));const directory=dirname(resolve(path));
 assert(Number.isFinite(manifest.duration)&&manifest.duration>0,'Manifest needs actual media duration');
 assert(typeof manifest.mediaIdentity==='string'&&manifest.mediaIdentity,'Manifest needs media identity');
 return {manifest,directory,baseline:segmentFrom(manifest.baseline,directory,manifest.baselineSegmentId)};
}
export function loadCaseBase(loaded:LoadedManifest,c:HarnessCase):Segment {const input=c.base??c.baseline;return input?segmentFrom(input,loaded.directory,c.baseSegmentId):loaded.baseline}
export function casePlan(loaded:LoadedManifest,c:HarnessCase):EditPlan {return planIncrementalEdit(loadCaseBase(loaded,c),c.text,{audioRevision:loaded.manifest.mediaIdentity,textRevision:c.name},loaded.manifest.duration)}
export function resultSegments(loaded:LoadedManifest,c:HarnessCase,plan:EditPlan):{id:string;words:Word[]}[] {
 assert(c.backendResult,'Case has no backendResult');const data=readInput(c.backendResult,loaded.directory);
 if(Array.isArray(data.segments))return data.segments;
 // Adapter adds request metadata only; every word object/timestamp stays unchanged.
 assert(Array.isArray(data.words)&&plan.jobs.length===1,'Raw words adapter requires one local job');
 return [{id:data.id??plan.jobs[0].id,words:data.words}];
}
export function savedDocument(loaded:LoadedManifest,segment:Segment):SavedDocument {return {segments:[segment],importVersions:[],language:loaded.manifest.language??'English',method:'Captured real backend result; listening review required',mediaIdentity:loaded.manifest.mediaIdentity,incremental:{}}}

function playbackEvidence(words:Word[]) {
 // Expected eligibility is checked in the DOM by frontend_harness.test.tsx.
 const times=[...new Set(words.flatMap(w=>[w.start,w.end,(w.start+w.end)/2]))].filter(Number.isFinite).sort((a,b)=>a-b);
 let previous=-1;const regressions:unknown[]=[];const trace:{time:number;index:number}[]=[];
 for(const time of times){const index=words.findIndex(w=>w.end-w.start>=.02&&time>=w.start&&time<w.end);if(index>=0&&index<previous)regressions.push({time,previous,index});if(index>=0)previous=index;trace.push({time,index})}
 return {observations:trace.length,regressions,eligibleWords:words.filter(w=>w.end-w.start>=.02).length,nearZeroWords:words.map((w,index)=>({w,index})).filter(({w})=>w.end-w.start<.02).map(({index})=>index),startsMonotone:words.every((w,i)=>!i||w.start>=words[i-1].start),trace};
}
function springEvidence(words:Word[]) {
 // Synthetic geometry tests motion mathematics only, not real browser layout or acoustic validity.
 const rect=(x:number,width:number):HighlightRect=>({x,y:0,width,height:28});const spring=new HighlightSpring(rect(0,40));let steps=0;
 words.filter(w=>w.end-w.start>=.02).forEach((w,index)=>{const from=spring.step(0),target=rect((index+1)*75,Math.max(20,w.text.length*7));spring.retarget(target,false,transferDuration(w.end-w.start));let previous=from;
  for(let i=0;i<100;i++){const current=spring.step(.001);for(const axis of ['x','width'] as const){const direction=Math.sign(target[axis]-from[axis]);assert(current[axis]>=Math.min(from[axis],target[axis])-1e-8&&current[axis]<=Math.max(from[axis],target[axis])+1e-8,'Highlight overshot');assert((current[axis]-previous[axis])*direction>=-1e-8,'Highlight reversed')};previous=current;steps++}
  assert(spring.settled);assert.deepEqual(spring.step(0),target);
 });return {steps,scope:'Production HighlightSpring; real word durations, synthetic geometry; no screenshot/layout claim'};
}
export function runHarness(loaded:LoadedManifest) {
 const checks:{name:string;passed:boolean;detail?:unknown;error?:string}[]=[];
 const check=(name:string,fn:()=>unknown)=>{try{const detail=fn();checks.push({name,passed:true,...(detail===undefined?{}:{detail})})}catch(e){checks.push({name,passed:false,error:e instanceof Error?e.message:String(e)})}};
 const cases:any[]=[];
 check('baseline canonical coverage',()=>assert.equal(canonical(loaded.baseline.text),canonical(loaded.baseline.words.map(w=>w.text).join(''))));
 check('baseline source display preserves exact text',()=>{const d=mapTranscriptDisplay(loaded.baseline.text,loaded.baseline.words);assert(d.matched);assert.equal(d.tokens.map(t=>t.before+t.text).join('')+d.tail,loaded.baseline.text)});
 check('baseline playback order',()=>{const p=playbackEvidence(loaded.baseline.words);assert.deepEqual(p.regressions,[]);return p});
 check('production highlight monotonic movement',()=>springEvidence(loaded.baseline.words));
 for(const c of loaded.manifest.cases){
  const base=loadCaseBase(loaded,c),baseBytes=JSON.stringify(base),plan=casePlan(loaded,c);const entry:any={name:c.name,kind:c.kind,plan:plan.kind,reason:plan.reason,jobs:plan.jobs,baselineWordCount:base.words.length};cases.push(entry);
  check(`${c.name}: declared planner behavior`,()=>{if(c.expectedPlan)assert.equal(plan.kind,c.expectedPlan);if(c.kind==='deletion'){assert.equal(plan.kind,'preserved');assert.equal(plan.jobs.length,0);assert(plan.words.length<base.words.length);let position=0;for(const word of plan.words){while(position<base.words.length&&base.words[position]!==word)position++;assert(position<base.words.length,'Surviving word object identity changed');position++}entry.identityPreserved=true;entry.modelJobs=0}if(c.kind==='multi_sentence'){assert.equal(plan.kind,'blocked');assert.equal(plan.jobs.length,0);assert.match(plan.reason??'',/跨越多个句子/)}return {jobs:plan.jobs.length}});
  check(`${c.name}: stale result rejection`,()=>{for(const rev of [{...plan.revision,audioRevision:'different-audio'},{...plan.revision,textRevision:'newer-edit'}])assert.throws(()=>applyIncrementalAlignment(plan,[],rev,plan.text),/过期/);assert.throws(()=>applyIncrementalAlignment(plan,[],plan.revision,plan.text+' '),/过期/)});
  if(plan.kind==='align')check(`${c.name}: pending mapping preserves unchanged words and raw text`,()=>{const d=mapPendingTranscriptDisplay(c.text,base.words,plan.jobs);assert(d.matched);assert.equal(d.tokens.map(t=>t.before+t.text).join('')+d.tail,c.text);for(const job of plan.jobs){assert(job.scoped);assert(job.end-job.start<=120);assert(job.start>=0&&job.end<=loaded.manifest.duration);assert(d.tokens.every(t=>t.wordIndex<job.replaceFrom||t.wordIndex>=job.replaceTo))}return {mappedWords:d.tokens.length,fullWordCount:base.words.length}});
  let applied:Word[]|undefined;
  if(plan.kind==='blocked'){entry.outcome='blocked';if(c.expectedOutcome)check(`${c.name}: declared outcome`,()=>assert.equal(c.expectedOutcome,'blocked'))}
  else if(plan.kind==='preserved'){applied=applyIncrementalAlignment(plan,[],plan.revision,plan.text);entry.outcome='accepted-without-model'}
  else if(!c.backendResult){entry.outcome='awaiting-real-backend';entry.acousticValidation='Not run'}
  else {
   const results=resultSegments(loaded,c,plan);
   try{applied=applyIncrementalAlignment(plan,results,plan.revision,plan.text);entry.outcome='accepted'}catch(e){entry.outcome='rejected';entry.rejection=e instanceof Error?e.message:String(e)}
   if(c.expectedOutcome)check(`${c.name}: declared outcome`,()=>assert.equal(entry.outcome,c.expectedOutcome));
   if(c.kind==='unspoken_insertion')entry.interpretation=entry.outcome==='accepted'?'Negative control accepted: forced alignment cannot certify that these words were spoken':'This negative control was rejected by timing/text guards; not evidence that all unspoken additions can be detected';
   if(applied)check(`${c.name}: splice preserves all untouched object identities`,()=>{assert.equal(plan.jobs.length,1,'Identity verifier currently accepts one production job');const job=plan.jobs[0],changedCount=applied!.length-base.words.length+(job.replaceTo-job.replaceFrom);for(let i=0;i<job.replaceFrom;i++)assert.strictEqual(applied![i],base.words[i]);for(let i=job.replaceTo;i<base.words.length;i++)assert.strictEqual(applied![job.replaceFrom+changedCount+i-job.replaceTo],base.words[i]);const changed=applied!.slice(job.replaceFrom,job.replaceFrom+changedCount),allModelWords=results.flatMap(r=>r.words);for(const w of changed)assert(allModelWords.includes(w),'Changed timing was synthesized or modified');entry.identityPreserved=true;entry.changedWords=changed;entry.untouchedWords=base.words.length-(job.replaceTo-job.replaceFrom);return {untouchedWords:entry.untouchedWords,changedWords:changed.length}});
  }
  check(`${c.name}: original baseline not mutated`,()=>assert.equal(JSON.stringify(base),baseBytes));
  if(applied){entry.appliedWords=applied;check(`${c.name}: completed display coverage`,()=>{assert.equal(canonical(applied!.map(w=>w.text).join('')),canonical(c.text));const d=mapTranscriptDisplay(c.text,applied!);assert(d.matched);assert.equal(d.tokens.map(t=>t.before+t.text).join('')+d.tail,c.text)});check(`${c.name}: playback order`,()=>{const p=playbackEvidence(applied!);assert.deepEqual(p.regressions,[]);return p});
   check(`${c.name}: immutable history rollback round trip and late-result rejection`,()=>{const original=savedDocument(loaded,base),edited=savedDocument(loaded,{...base,text:c.text,words:applied!});const history=createHistory('captured-public-audio',original,loaded.manifest.mediaIdentity);const next=appendRevision(history,edited,loaded.manifest.mediaIdentity,'Real-audio edit');const token=revisionToken(next);const rollback=restoreRevision(next,history.headId,loaded.manifest.mediaIdentity);assert.deepEqual(currentRevision(rollback).document,original);assert.throws(()=>assertCurrentRevision(rollback,token),/过期/);const redo=restoreRevision(rollback,next.headId,loaded.manifest.mediaIdentity);assert.deepEqual(currentRevision(redo).document,edited);assert(Object.isFrozen(currentRevision(redo).document.segments[0].words));const store=new Map<string,string>();writeHistory(redo,{setItem:(k,v)=>store.set(k,v)});assert.deepEqual(readHistory(redo.documentId,{getItem:k=>store.get(k)??null}),redo);assert.throws(()=>restoreRevision(redo,history.headId,'other-audio'),/不同音频/);return {scope:'Production revision-history round trip; toolbar undo/redo tested separately in App',revisionCount:redo.revisions.length}})
  }
 }
 return {generatedAt:new Date().toISOString(),scope:'Captured real backend timings run through unmodified production planner, splicer, display mapping, highlight motion and revision-history code',noModelOutputFabricated:true,passed:checks.every(c=>c.passed),checks,cases,limitations:['Forced alignment does not prove text was spoken. Negative-control acceptance/rejection is reported without generalizing.','HighlightSpring uses explicitly synthetic geometry; actual App timing selection and undo/redo require companion jsdom tests.','No human listening review or pixel-layout validation is claimed by this harness.','Cross-sentence edits are intentionally blocked by the current production planner.']};
}

if(process.argv[1]&&/frontend_harness\.(?:c?js|ts)$/.test(process.argv[1])){
 const path=process.argv[2];if(!path)throw Error('Usage: frontend_harness.cjs MANIFEST.json [REPORT.json]');
 const report=runHarness(loadManifest(path));const serialized=JSON.stringify(report,null,2)+'\n';if(process.argv[3])writeFileSync(process.argv[3],serialized);process.stdout.write(serialized);if(!report.passed)process.exitCode=1;
}
