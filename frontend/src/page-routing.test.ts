// @vitest-environment jsdom
import {beforeEach,expect,test,vi} from 'vitest';
import {isPageToken,recordingHash,parsePageRoute,readFreshDemoNonce,resolveInitialPageRoute,navigatePage,subscribePageRoute} from './page-routing';
beforeEach(()=>window.history.replaceState({},'', '/'));
test('library aliases and encoded stable record IDs round trip',()=>{
 for(const hash of ['', '#', '#/', '#/library']) expect(parsePageRoute(hash)).toEqual({kind:'library'});
 for(const token of ['welcome-demo','550e8400-e29b-41d4-a716-446655440000','private-fresh:review-1','录音 2026','literal%2F']) expect(parsePageRoute(recordingHash(token))).toEqual({kind:'recording',token});
});
test('malformed encoding, paths, delimiters, empty and control tokens fail closed',()=>{
 for(const hash of ['#/unknown','#/recordings/','#/recordings/a/b','#/recordings/%','#/recordings/%ED%A0%80','#/recordings/%2F','#/recordings/%5C','#/recordings/%00','#/recordings/a?b','#/recordings/%23','#/recordings/..','#/recordings/%20a','#/recordings/'+ 'a'.repeat(513)]) expect(parsePageRoute(hash)).toEqual({kind:'not-found'});
 for(const token of ['', '/', '\\', '\u0000', '..', '\ud800',' a','a ']) {expect(isPageToken(token)).toBe(false);expect(()=>recordingHash(token)).toThrow();}
});
test('legacy fresh-demo reads deterministic bounded ID; explicit route always wins',()=>{
 expect(readFreshDemoNonce('?fresh-demo=abc%3Adef')).toBe('abc:def');
 expect(readFreshDemoNonce('?fresh-demo='+ 'x'.repeat(101))).toBe('x'.repeat(100));
 expect(readFreshDemoNonce('?fresh-demo=bad%2Fid')).toBe('');
 const items=[{id:'private-fresh:abc'}];
 expect(resolveInitialPageRoute('','?fresh-demo=abc',items)).toEqual({kind:'recording',token:'private-fresh:abc'});
 expect(resolveInitialPageRoute('#/library','?fresh-demo=abc',items)).toEqual({kind:'library'});
 expect(resolveInitialPageRoute('#/recordings/other','?fresh-demo=abc',items)).toEqual({kind:'recording',token:'other'});
 expect(resolveInitialPageRoute('#/bad','?fresh-demo=abc',items)).toEqual({kind:'not-found'});
 expect(resolveInitialPageRoute('','?fresh-demo=abc',[])).toEqual({kind:'not-found'});
 expect(resolveInitialPageRoute('','?fresh-demo=abc',[{id:'private-fresh:abc',deletedAt:'today'}])).toEqual({kind:'not-found'});
});
test('navigation preserves deployment path, unrelated query and history state; notifications deduplicate',()=>{
 window.history.replaceState({host:'kept'},'', '/nested/site/?fresh-demo=abc&theme=dark');
 const listener=vi.fn();const unsubscribe=subscribePageRoute(listener);
 navigatePage({kind:'recording',token:'private-fresh:abc'},{replace:true,consumeFreshDemo:true});
 expect(window.location.pathname).toBe('/nested/site/');expect(window.location.search).toBe('?theme=dark');expect(window.history.state).toEqual({host:'kept'});
 expect(listener).toHaveBeenCalledExactlyOnceWith({kind:'recording',token:'private-fresh:abc'});
 window.dispatchEvent(new PopStateEvent('popstate'));window.dispatchEvent(new HashChangeEvent('hashchange'));expect(listener).toHaveBeenCalledTimes(1);
 navigatePage({kind:'recording',token:'private-fresh:abc'});expect(listener).toHaveBeenCalledTimes(1);
 navigatePage({kind:'library'});expect(listener).toHaveBeenLastCalledWith({kind:'library'});
 unsubscribe();navigatePage({kind:'recording',token:'welcome-demo'});expect(listener).toHaveBeenCalledTimes(2);
});
test('back and forward traverse the record and overview routes',async()=>{
 navigatePage({kind:'library'},{replace:true});navigatePage({kind:'recording',token:'welcome-demo'});
 const listener=vi.fn();const unsubscribe=subscribePageRoute(listener);
 window.history.back();await vi.waitFor(()=>expect(listener).toHaveBeenLastCalledWith({kind:'library'}));
 window.history.forward();await vi.waitFor(()=>expect(listener).toHaveBeenLastCalledWith({kind:'recording',token:'welcome-demo'}));
 expect(listener).toHaveBeenCalledTimes(2);unsubscribe();
});
