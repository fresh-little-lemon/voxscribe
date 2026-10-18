import type { Segment } from './demo';
export type ImportMode = 'all'|'english'|'chinese';
export type MarkdownBlock = {id:string;kind:'paragraph'|'heading';lines:string[];start:number|null;speaker:string;raw:string};
export type ParsedMarkdown = {blocks:MarkdownBlock[];warnings:string[];bilingual:boolean};
const timestamp=/^\s*\[(\d{1,2}:\d{2}(?::\d{2})?)(?:\s*[｜|]\s*([^\]]+))?\]\s*/;
export function timestampSeconds(value:string){const parts=value.split(':').map(Number);if(parts.slice(1).some(p=>p>=60))return null;return parts.reduce((a,b)=>a*60+b,0)}
export function lineLanguage(line:string):'english'|'chinese'|'neutral'{const han=(line.match(/[\u3400-\u9fff]/g)||[]).length;const latin=(line.match(/[a-z]/gi)||[]).length;return han>0&&han/(han+latin)>.12?'chinese':latin>0?'english':'neutral'}
function clean(line:string){return line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|>\s?)/,'').replace(/^#{1,6}\s+/,'').replace(/^\s*(?:英文(?:原文)?|English|中文(?:译文)?|Chinese|Translation)\s*[:：]\s*/i,'').replace(/(?:\*\*|__|~~|`)/g,'').replace(/[【\[](?:校订|修订|更正|补充|纠正)\s*[:：]\s*([^】\]]+)[】\]]/g,'$1').replace(/[【\[](?:校订|修订|已校订|已修订|补充)[】\]]/g,'').trim()}
export function parseMarkdown(raw:string):ParsedMarkdown{
 const blocks:MarkdownBlock[]=[];const warnings:string[]=[];let pendingStart:number|null=null;let pendingSpeaker='说话人 1';let lines:string[]=[];let rawLines:string[]=[];let kind:'paragraph'|'heading'='paragraph';
 const flush=()=>{if(lines.length){blocks.push({id:`md-${blocks.length+1}`,kind,lines:[...lines],start:pendingStart,speaker:pendingSpeaker,raw:rawLines.join('\n')});pendingStart=null;lines=[];rawLines=[];kind='paragraph'}};
 for(const original of raw.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n')){
  let line=original;if(!line.trim()){flush();continue}
  const match=line.match(timestamp);if(match){flush();pendingStart=timestampSeconds(match[1]);if(pendingStart===null)warnings.push(`无效时间标记：${match[1]}`);if(match[2])pendingSpeaker=match[2].trim();line=line.slice(match[0].length);if(!line.trim())continue}
  if(/^\s*#{1,6}\s/.test(line)){flush();const anchor=pendingStart;pendingStart=null;kind='heading';lines=[clean(line)];rawLines=[original];flush();pendingStart=anchor;continue}
  if(/^\s*\[\d{1,2}:/.test(line)&&!match)warnings.push('存在未闭合或无法识别的时间标记，已作为普通正文保留');
  if(/[【\[](?:校订|修订|更正|补充)[^】\]]*$/.test(line))warnings.push('存在未闭合校订标记，未删除其内容');
  const text=clean(line);if(text){lines.push(text);rawLines.push(original)}
 }
 flush();if(pendingStart!==null)warnings.push('文末时间标记后没有正文');
 const languages=new Set(blocks.filter(b=>b.kind==='paragraph').flatMap(b=>b.lines.map(lineLanguage)));
 return {blocks,warnings:[...new Set(warnings)],bilingual:languages.has('english')&&languages.has('chinese')};
}
export function markdownSegments(parsed:ParsedMarkdown,mode:ImportMode):Segment[]{
 const result:Segment[]=[];
 for(const block of parsed.blocks){
  if(block.kind==='heading'){result.push({id:block.id,speaker:block.speaker,text:'',annotation:block.lines.join('\n'),start:null,end:null,words:[],stale:true,alignmentStatus:'annotation'});continue}
  const included=block.lines.filter(l=>mode==='all'||lineLanguage(l)==='neutral'||lineLanguage(l)===mode);
  const excluded=block.lines.filter(l=>!included.includes(l));
  if(!included.length&&excluded.length&&result.length){const previous=result[result.length-1];previous.annotation=[previous.annotation,...excluded].filter(Boolean).join('\n');continue}
  result.push({id:block.id,speaker:block.speaker,text:included.join('\n'),annotation:excluded.join('\n')||undefined,start:block.start,end:null,words:[],stale:true,alignmentStatus:'needs_localization',languageReviewRequired:mode==='all'&&parsed.bilingual});
 }
 return result;
}
