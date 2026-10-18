/** Local record identity only: a page token is not an authentication/share token. */
export type PageRoute = {kind:'library'} | {kind:'recording';token:string} | {kind:'not-found'};
export const LIBRARY_HASH = '#/library';
const ROUTE_EVENT = 'voxscribe:page-route';

/** Preserve existing IDs (including private-fresh:nonce), without path delimiters. */
export function isPageToken(token:string):boolean {
 if (!token || token.length > 512 || token.trim() !== token || token === '.' || token === '..' || /[\u0000-\u001f\u007f/\\?#]/u.test(token)) return false;
 try { encodeURIComponent(token); return true; } catch { return false; }
}
export function recordingHash(token:string):string {
 if (!isPageToken(token)) throw new Error('Invalid recording page token');
 return `#/recordings/${encodeURIComponent(token)}`;
}
export function parsePageRoute(hash:string):PageRoute {
 if (hash === '' || hash === '#' || hash === '#/' || hash === LIBRARY_HASH) return {kind:'library'};
 const match = /^#\/recordings\/([^/]+)$/.exec(hash);
 if (!match) return {kind:'not-found'};
 try {
  const token = decodeURIComponent(match[1]);
  return isPageToken(token) ? {kind:'recording',token} : {kind:'not-found'};
 } catch { return {kind:'not-found'}; }
}
/** Legacy demo URLs are consumed only on the entry page, never over an explicit hash. */
export function readFreshDemoNonce(search:string):string {
 const value = new URLSearchParams(search).get('fresh-demo');
 // Match the existing 100-character ID convention; do not migrate saved records.
 const nonce = value?.slice(0,100) || '';
 return nonce && isPageToken(`private-fresh:${nonce}`) ? nonce : '';
}
export function resolveInitialPageRoute(hash:string,search:string,items:readonly {id:string;deletedAt?:string}[]):PageRoute {
 if (hash && hash !== '#') return parsePageRoute(hash);
 const nonce = readFreshDemoNonce(search);
 if (nonce) {
  const token = `private-fresh:${nonce}`;
  // A missing/deleted legacy target is a missing page, never a different record.
  return items.some(item=>item.id===token&&!item.deletedAt) ? {kind:'recording',token} : {kind:'not-found'};
 }
 return {kind:'library'};
}
export function navigatePage(route:Exclude<PageRoute,{kind:'not-found'}>,options:{replace?:boolean;consumeFreshDemo?:boolean}={}):void {
 const hash = route.kind === 'library' ? LIBRARY_HASH : recordingHash(route.token);
 const url = new URL(window.location.href);
 if (options.consumeFreshDemo) url.searchParams.delete('fresh-demo');
 url.hash = hash;
 if (url.href === window.location.href) return;
 // Preserve host-app history state and deployment subpath/query parameters.
 window.history[options.replace?'replaceState':'pushState'](window.history.state,'',url.href);
 window.dispatchEvent(new Event(ROUTE_EVENT));
}
/** Both native browser traversal/manual hash edits and our synchronous navigation. */
export function subscribePageRoute(listener:(route:PageRoute)=>void):()=>void {
 let previous = window.location.hash;
 const update=()=>{
  const hash=window.location.hash;
  if(hash===previous)return;
  previous=hash;
  listener(parsePageRoute(hash));
 };
 window.addEventListener('hashchange',update);
 window.addEventListener('popstate',update);
 window.addEventListener(ROUTE_EVENT,update);
 return ()=>{
  window.removeEventListener('hashchange',update);
  window.removeEventListener('popstate',update);
  window.removeEventListener(ROUTE_EVENT,update);
 };
}
