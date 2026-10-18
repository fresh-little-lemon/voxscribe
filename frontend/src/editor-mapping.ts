import type {Segment,Word} from './demo';
import {planIncrementalEdit,sentenceRanges} from './incremental-alignment';
import {mapPendingTranscriptDisplay,mapTranscriptDisplay} from './transcript-display';
export type EditorWord={from:number;to:number;word:Word};
export function editorWordMap(baseline:Segment|undefined,text:string,duration:number):EditorWord[]{
 if(!baseline||baseline.stale||!baseline.words.length)return [];
 const plan=planIncrementalEdit(baseline,text,{audioRevision:'editor',textRevision:'editor'},duration);
 if(plan.kind==='blocked')return [];
 const words=plan.words;const display=plan.kind==='preserved'?mapTranscriptDisplay(text,words):mapPendingTranscriptDisplay(text,words,plan.jobs);
 if(!display.matched)return [];
 let consumed=0;return display.tokens.map(token=>{const from=consumed+token.before.length,to=from+token.text.length;consumed=to;return {from,to,word:words[token.wordIndex]}});
}
export function wordAtSelection(words:EditorWord[],from:number,to:number):EditorWord|undefined{
 const low=Math.min(from,to),high=Math.max(from,to);
 return words.find(w=>low===high?low>=w.from&&low<w.to:low>=w.from&&high<=w.to)||(low===high?words.find(w=>w.to===low):undefined);
}
export function sentenceAtCaret(text:string,offset:number){return sentenceRanges(text).find(s=>offset>=s.start&&offset<s.end)||sentenceRanges(text).at(-1)}
