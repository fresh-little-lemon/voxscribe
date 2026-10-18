import type { SavedDocument } from './library-store';

/** A media identity must change whenever the recording changes. No media bytes or credentials are stored here. */
export type Revision = {id:string; createdAt:string; summary:string; mediaIdentity:string|null; document:SavedDocument; restoredFrom?:string};
export type RevisionHistoryData = {version:1; documentId:string; headId:string; revisions:Revision[]};
export const HISTORY_KEY_PREFIX='voxscribe-history-v1:';
const copy=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));
function freeze<T>(value:T):T {if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value}
const immutable=<T,>(value:T):T=>freeze(copy(value));
const newId=()=>globalThis.crypto.randomUUID();
function snapshot(document:SavedDocument,mediaIdentity:string|null,summary:string):Revision {
 return {id:newId(),createdAt:new Date().toISOString(),summary,mediaIdentity,document:copy(document)};
}
export function createHistory(documentId:string,document:SavedDocument,mediaIdentity:string|null):RevisionHistoryData {
 const initial=snapshot(document,mediaIdentity,'初始版本');return immutable({version:1,documentId,headId:initial.id,revisions:[initial]});
}
export function currentRevision(history:RevisionHistoryData):Revision {
 const revision=history.revisions.find(r=>r.id===history.headId);if(!revision)throw Error('编辑历史缺少当前版本');return revision;
}
/** Append all text, word times, annotations, source/import versions and document metadata exactly. */
export function appendRevision(history:RevisionHistoryData,document:SavedDocument,mediaIdentity:string|null,summary:string):RevisionHistoryData {
 const head=currentRevision(history);
 if(head.mediaIdentity===mediaIdentity&&JSON.stringify(head.document)===JSON.stringify(document))return history;
 const revision=snapshot(document,mediaIdentity,summary);return immutable({...history,headId:revision.id,revisions:[...history.revisions,revision]});
}
export function restoreRevision(history:RevisionHistoryData,id:string,currentMediaIdentity:string|null):RevisionHistoryData {
 const target=history.revisions.find(r=>r.id===id);if(!target)throw Error('该历史版本已不存在');
 if(target.mediaIdentity!==currentMediaIdentity)throw Error('历史版本属于不同音频，无法回滚到当前媒体');
 const revision={...snapshot(target.document,target.mediaIdentity,`回滚：${target.summary}`),restoredFrom:target.id};
 return immutable({...history,headId:revision.id,revisions:[...history.revisions,revision]});
}
/** Confirmation is mandatory. The current head can never be deleted. Does not touch documents or media storage. */
export function deleteRevisions(history:RevisionHistoryData,ids:string[],confirmed:boolean):RevisionHistoryData {
 if(!confirmed)return history;
 const selected=new Set(ids);return immutable({...history,revisions:history.revisions.filter(r=>r.id===history.headId||!selected.has(r.id))});
}
export function writeHistory(history:RevisionHistoryData,storage:Pick<Storage,'setItem'>=localStorage):void {
 currentRevision(history);storage.setItem(HISTORY_KEY_PREFIX+history.documentId,JSON.stringify(history));
}
export function readHistory(documentId:string,storage:Pick<Storage,'getItem'>=localStorage):RevisionHistoryData|null {
 const raw=storage.getItem(HISTORY_KEY_PREFIX+documentId);if(!raw)return null;
 let parsed:RevisionHistoryData;
 try {parsed=JSON.parse(raw)}catch {throw Error('编辑历史无法读取；原始数据已保留')}
 if(parsed.version!==1||parsed.documentId!==documentId||!Array.isArray(parsed.revisions)||!parsed.revisions.every(r=>typeof r.id==='string'&&typeof r.createdAt==='string'&&typeof r.summary==='string'&&(r.mediaIdentity===null||typeof r.mediaIdentity==='string')&&Array.isArray(r.document?.segments)&&Array.isArray(r.document?.importVersions)))throw Error('编辑历史格式不兼容；原始数据已保留');
 currentRevision(parsed);return immutable(parsed);
}
/** Capture before async alignment; compare again immediately before applying the result. Rollback always invalidates old jobs. */
export function revisionToken(history:RevisionHistoryData):string {return JSON.stringify([history.documentId,history.headId,currentRevision(history).mediaIdentity])}
export function assertCurrentRevision(history:RevisionHistoryData,token:string):void {
 if(revisionToken(history)!==token)throw Error('文字或媒体版本已变化，已丢弃过期对齐结果');
}
export type RevisionDifference={segmentId:string;before:string;after:string;timingChanged:boolean;metadataChanged:boolean};
export function diffRevisions(before:Revision,after:Revision):RevisionDifference[] {
 const ids=new Set([...before.document.segments.map(s=>s.id),...after.document.segments.map(s=>s.id)]);
 return [...ids].flatMap(segmentId=>{const a=before.document.segments.find(s=>s.id===segmentId),b=after.document.segments.find(s=>s.id===segmentId);if(JSON.stringify(a)===JSON.stringify(b))return [];
 const timing=(s:typeof a)=>s?JSON.stringify([s.start,s.end,s.words,s.stale,s.alignmentStatus]):null;
 const metadata=(s:typeof a)=>s?JSON.stringify([s.speaker,s.annotation,s.languageReviewRequired]):null;
 return [{segmentId,before:a?.text??'',after:b?.text??'',timingChanged:timing(a)!==timing(b),metadataChanged:metadata(a)!==metadata(b)}]});
}
