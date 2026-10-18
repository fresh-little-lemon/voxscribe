import type { EditPlan } from './incremental-alignment';
import type { Segment } from './demo';
export type ImportVersion={name:string;raw:string;version:number;mode:'all'|'english'|'chinese'};
export type SavedDocument={segments:Segment[];importVersions:ImportVersion[];language:string;method:string;mediaIdentity?:string;incremental?:Record<string,{base:Segment;plan:EditPlan}>};
export type LibraryFolder={id:string;name:string;parentId:string|null};
export type LibraryItem={id:string;name:string;kind:'audio'|'video'|'document'|'demo';folderId:string|null;createdAt:string;updatedAt:string;deletedAt?:string;privateDemo?:boolean;mediaStored?:boolean;mediaName?:string;document?:SavedDocument};
export type LibraryData={version:1;folders:LibraryFolder[];items:LibraryItem[]};
export const STORAGE_KEY='voxscribe-library-v1';
export const initialLibrary=():LibraryData=>({version:1,folders:[{id:'courses',name:'课程学习',parentId:null},{id:'meetings',name:'会议记录',parentId:null}],items:[{id:'welcome-demo',name:'VoxScribe 使用指南（演示）',kind:'demo',folderId:null,createdAt:'2026-10-18T00:00:00Z',updatedAt:'2026-10-18T00:00:00Z'}]});
export function readLibrary():LibraryData{try{const raw=localStorage.getItem(STORAGE_KEY);if(raw){const d=JSON.parse(raw);if(d.version===1&&Array.isArray(d.items)&&Array.isArray(d.folders))return d}}catch{}return initialLibrary()}
export function writeLibrary(data:LibraryData){localStorage.setItem(STORAGE_KEY,JSON.stringify(data))}
export function moveFolder(data:LibraryData,id:string,parentId:string|null):LibraryData{let ancestor=parentId;const seen=new Set<string>();while(ancestor){if(ancestor===id||seen.has(ancestor))throw Error('不能将文件夹移动到自身或子文件夹');seen.add(ancestor);ancestor=data.folders.find(f=>f.id===ancestor)?.parentId??null}return {...data,folders:data.folders.map(f=>f.id===id?{...f,parentId}:f)}}
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{if(!globalThis.indexedDB){reject(Error('浏览器不支持 IndexedDB，音频不能持久保存'));return}const request=indexedDB.open('voxscribe-media-v1',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('media'))request.result.createObjectStore('media')};request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result)})}
export async function saveMedia(id:string,file:File){const db=await database();return new Promise<void>((resolve,reject)=>{const tx=db.transaction('media','readwrite');tx.objectStore('media').put(file,id);tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})}
export async function readMedia(id:string):Promise<File|undefined>{const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('media','readonly');const req=tx.objectStore('media').get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close()})}
