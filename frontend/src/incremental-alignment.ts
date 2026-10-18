import type {Segment, Word} from './demo';
export type EditRevision = {audioRevision:string; textRevision:string};
export type LocalAlignmentJob = {id:string; text:string; start:number; end:number; scoped:true; replaceFrom:number; replaceTo:number; prefixCharacters:number; changedCharacters:number; lower:number; upper:number};
export type EditPlan = {kind:'preserved'|'align'|'blocked'; text:string; words:Word[]; revision:EditRevision; jobs:LocalAlignmentJob[]; reason?:string};
export const canonical = (s:string) => s.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
function sourceMap(text:string){const chars:{start:number;end:number}[]=[];let offset=0;for(const c of text){for(let i=0;i<canonical(c).length;i++)chars.push({start:offset,end:offset+c.length});offset+=c.length}return chars}
/** Conservative sentence boundaries: decimal points, initials and common abbreviations stay inside a sentence. */
export function sentenceRanges(text:string):{start:number;end:number}[]{
 const ranges:{start:number;end:number}[]=[];let start=0;
 for(let i=0;i<text.length;i++){
  if(!/[.!?。！？\n]/u.test(text[i]))continue;
  if(text[i]==='.'){
   if(/\d/.test(text[i-1]||'')&&/\d/.test(text[i+1]||''))continue;
   const token=text.slice(0,i+1).match(/([A-Za-z.]+)\.$/)?.[1]||'';
   if(/^(mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e)$/i.test(token)||/^(?:[A-Za-z]\.)*[A-Za-z]$/.test(token))continue;
  }
  while(i+1<text.length&&/[.!?。！？”’"'）)]/u.test(text[i+1]))i++;
  ranges.push({start,end:i+1});start=i+1;
 }
 if(start<text.length)ranges.push({start,end:text.length});return ranges;
}
// Count (capped at two) complete-word subsequence mappings. Multiple mappings mean ambiguous repeated speech.
function deletionMapping(labels:string[], target:string):{count:number;path:number[]}|undefined{
 let states=new Map<number,{count:number;path:number[]}>([[0,{count:1,path:[]}]]);
 for(let i=0;i<labels.length;i++){
  const next=new Map<number,{count:number;path:number[]}>();
  const add=(p:number,count:number,path:number[])=>{const old=next.get(p);next.set(p,{count:Math.min(2,(old?.count||0)+count),path:old?.path||path})};
  for(const [p,s] of states){add(p,s.count,s.path);if(labels[i]&&target.startsWith(labels[i],p))add(p+labels[i].length,s.count,[...s.path,i])}states=next;
 }
 return states.get(target.length);
}
export function planIncrementalEdit(segment:Segment, text:string, revision:EditRevision, duration:number):EditPlan{
 const base:EditPlan={kind:'blocked',text,words:segment.words,revision,jobs:[]};
 const blocked=(reason:string)=>({...base,reason});const old=canonical(segment.text),next=canonical(text),labels=segment.words.map(w=>canonical(w.text));
 if(segment.stale||!segment.words.length||labels.some(x=>!x)||labels.join('')!==old)return blocked('缺少可复用的逐词时间轴，请先定位并对齐原文');
 if(!Number.isFinite(duration)||duration<=0)return blocked('媒体时长尚未就绪，请先检查媒体');
 if(old===next)return {...base,kind:'preserved'};
 const deletion=next.length<old.length?deletionMapping(labels,next):undefined;
 if(deletion&&deletion.count>1)return blocked('重复词或短语的删除位置不明确，无法确定保留哪一次录音时间；请逐处修改并检查对应录音');
 if(deletion)return {...base,kind:'preserved',words:deletion.path.map(i=>segment.words[i])};
 let prefix=0;while(prefix<old.length&&prefix<next.length&&old[prefix]===next[prefix])prefix++;
 let suffix=0;while(suffix<old.length-prefix&&suffix<next.length-prefix&&old[old.length-1-suffix]===next[next.length-1-suffix])suffix++;
 const offsets=[0];labels.forEach(x=>offsets.push(offsets[offsets.length-1]+x.length));
 let from=0;while(from<labels.length&&offsets[from+1]<=prefix)from++;
 let to=labels.length;while(to>from&&offsets[to-1]>=old.length-suffix)to--;
 const map=sourceMap(segment.text),newMap=sourceMap(text);
 let oldStart=map[offsets[from]]?.start??segment.text.length;
 // At a sentence boundary, insertion before the terminator belongs to the preceding sentence.
 if(from===to&&from>0){const insertStart=newMap[offsets[from]]?.start??text.length,previousEnd=newMap[offsets[from]-1]?.end??insertStart;if(!/[.!?。！？\n]/u.test(text.slice(previousEnd,insertStart)))oldStart=(map[offsets[from]-1]?.end??oldStart)-1}
 const oldEnd=from===to?oldStart:(map[Math.max(offsets[to]-1,offsets[from])]?.end??oldStart);
 const sentence=sentenceRanges(segment.text).find(s=>oldStart>=s.start&&oldStart<s.end || oldStart===segment.text.length&&s.end===oldStart);
 if(!sentence||oldEnd>sentence.end)return blocked('修改跨越多个句子，请逐句保存；不会扩大为整段重算');
 let sentenceFrom=from,sentenceTo=to;
 while(sentenceFrom>0&&(map[offsets[sentenceFrom-1]]?.start??0)>=sentence.start)sentenceFrom--;
 while(sentenceTo<labels.length&&(map[offsets[sentenceTo]]?.start??Infinity)<sentence.end)sentenceTo++;
 const contextFrom=Math.max(sentenceFrom,from-1),contextTo=Math.min(sentenceTo,to+1);
 // Historical anomalies outside this edit are retained, not silently repaired or used as anchors.
 const anchorFrom=Math.max(0,Math.min(contextFrom,from-1)),anchorTo=Math.min(labels.length,Math.max(contextTo,to+1));
 const localWords=segment.words.slice(anchorFrom,anchorTo);
 if(localWords.some((w,i)=>!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<0||w.end<w.start||w.end>duration||(i>0&&w.start<localWords[i-1].end)))return blocked('修改附近时间轴超出媒体范围或重叠，请先检查局部时间范围');
 const newStart=offsets[from],newEnd=next.length-(old.length-offsets[to]);
 const contextStart=offsets[contextFrom],contextEnd=next.length-(old.length-offsets[contextTo]);
 const changedSourceStart=newMap[newStart]?.start??text.length,changedSourceEnd=newMap[newEnd-1]?.end??changedSourceStart;
 const newSentence=sentenceRanges(text).find(s=>changedSourceStart>=s.start&&changedSourceStart<s.end);
 if(newEnd>newStart&&(!newSentence||changedSourceEnd>newSentence.end))return blocked('修改跨越多个句子，请逐句保存；不会扩大为整段重算');
 if(newEnd<newStart||contextEnd<=contextStart)return blocked('无法确定修改附近的词边界，请逐句检查');
 const start=Math.max(0,segment.words[contextFrom].start-.15),end=Math.min(duration,segment.words[contextTo-1].end+.15);
 const lower=from>0?segment.words[from-1].end:start,upper=to<labels.length?segment.words[to].start:end;
 if(end<=start||end-start>120||upper<=lower)return blocked('修改位置没有有效音频空间，请检查相邻词时间');
 const rawStart=newMap[contextStart]?.start,rawEnd=newMap[contextEnd-1]?.end;
 if(rawStart===undefined||rawEnd===undefined)return blocked('无法确定修改文字范围');
 return {...base,kind:'align',jobs:[{id:`${segment.id}:local`,text:text.slice(rawStart,rawEnd),start,end,scoped:true,replaceFrom:from,replaceTo:to,prefixCharacters:newStart-contextStart,changedCharacters:newEnd-newStart,lower,upper}]};
}
/** Model returns real absolute times. Never shift, interpolate, or clamp model output. */
export function applyIncrementalAlignment(plan:EditPlan, results:{id:string;words:Word[]}[], current:EditRevision, currentText:string):Word[]{
 if(current.audioRevision!==plan.revision.audioRevision||current.textRevision!==plan.revision.textRevision||currentText!==plan.text)throw Error('文字或媒体已变化，已丢弃过期对齐结果');
 if(plan.kind==='blocked')throw Error(plan.reason);
 if(plan.kind==='preserved')return plan.words;
 let words=[...plan.words];
 for(const job of [...plan.jobs].reverse()){
  const result=results.find(r=>r.id===job.id);if(!result||canonical(result.words.map(w=>w.text).join(''))!==canonical(job.text))throw Error('模型文字与局部原文不匹配');
  let offset=0;const changed:Word[]=[];const left=job.prefixCharacters,right=left+job.changedCharacters;
  for(const w of result.words){const end=offset+canonical(w.text).length;if(offset<right&&end>left){if(offset<left||end>right)throw Error('模型词边界跨越保留锚点');changed.push(w)}offset=end}
  if(job.changedCharacters&&!changed.length)throw Error('模型未返回修改位置的时间戳');
  changed.forEach((w,i)=>{if(!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<Math.max(job.lower,job.start)||w.end>Math.min(job.upper,job.end)||w.end<=w.start||(i>0&&w.start<changed[i-1].end))throw Error('局部时间戳超出相邻锚点，需听审')});
  words.splice(job.replaceFrom,job.replaceTo-job.replaceFrom,...changed);
 }
 return words;
}
