import type {Word} from './demo';
export type DisplayWord={wordIndex:number;text:string;before:string};
export type TranscriptDisplay={matched:boolean;tokens:DisplayWord[];tail:string;reason?:string};
function canonical(text:string){return [...text.normalize('NFKD').toLowerCase()].filter(c=>/[\p{L}\p{N}]/u.test(c)).join('')}
/** Preserve source characters exactly. Never add punctuation tokens or alter timing. */
export function mapTranscriptDisplay(text:string,words:Word[]):TranscriptDisplay{
 const source:{character:string;start:number;end:number}[]=[];let offset=0;
 for(const character of text){for(const normalized of canonical(character))source.push({character:normalized,start:offset,end:offset+character.length});offset+=character.length}
 const original=source.map(c=>c.character).join('');const labels=words.map(w=>canonical(w.text));
 if(original!==labels.join('')||(!original&&words.length))return {matched:false,tokens:[],tail:text,reason:'原文与逐词结果不一致，已保留原文。请检查文字并重新对齐。'};
 const ranges:{wordIndex:number;start:number;end:number}[]=[];let position=0;
 labels.forEach((label,wordIndex)=>{if(!label)return;const length=[...label].length;ranges.push({wordIndex,start:source[position].start,end:source[position+length-1].end});position+=length});
 const tokens:DisplayWord[]=[];let consumed=0;
 ranges.forEach((range,index)=>{const next=ranges[index+1]?.start??text.length;const following=text.slice(range.end,next);const punctuation=following.match(/^\S*/u)?.[0]||'';const end=range.end+punctuation.length;tokens.push({wordIndex:range.wordIndex,before:text.slice(consumed,range.start),text:text.slice(range.start,end)});consumed=end});
 return {matched:true,tokens,tail:text.slice(consumed)};
}

/** Pending edits have no invented timing: only exact unchanged source spans get word buttons. */
export function mapPendingTranscriptDisplay(text:string,words:Word[],jobs:{replaceFrom:number;replaceTo:number;changedCharacters:number}[]):TranscriptDisplay{
 const source:{start:number;end:number}[]=[];let offset=0;
 for(const char of text){for(const _ of canonical(char))source.push({start:offset,end:offset+char.length});offset+=char.length}
 const labels=words.map(w=>canonical(w.text));const ranges:{wordIndex:number;start:number;end:number}[]=[];let position=0,index=0;
 for(const job of [...jobs].sort((a,b)=>a.replaceFrom-b.replaceFrom)){
  while(index<job.replaceFrom){const label=labels[index];const start=source[position]?.start,end=source[position+label.length-1]?.end;if(!label||start===undefined||end===undefined||canonical(text.slice(start,end))!==label)return {matched:false,tokens:[],tail:text};ranges.push({wordIndex:index,start,end});position+=label.length;index++}
  position+=job.changedCharacters;index=job.replaceTo;
 }
 while(index<words.length){const label=labels[index];const start=source[position]?.start,end=source[position+label.length-1]?.end;if(!label||start===undefined||end===undefined||canonical(text.slice(start,end))!==label)return {matched:false,tokens:[],tail:text};ranges.push({wordIndex:index,start,end});position+=label.length;index++}
 if(position!==source.length)return {matched:false,tokens:[],tail:text};
 let consumed=0;const tokens=ranges.map((range,i)=>{const next=ranges[i+1]?.start??text.length;const punctuation=text.slice(range.end,next).match(/^[^\p{L}\p{N}\s]*/u)?.[0]||'';const end=range.end+punctuation.length;const token={wordIndex:range.wordIndex,before:text.slice(consumed,range.start),text:text.slice(range.start,end)};consumed=end;return token});
 return {matched:true,tokens,tail:text.slice(consumed)};
}
