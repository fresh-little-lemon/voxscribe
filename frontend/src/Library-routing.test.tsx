// @vitest-environment jsdom
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor,act} from '@testing-library/react';
import Library from './Library';
import * as libraryStore from './library-store';
import {initialLibrary,readLibrary,STORAGE_KEY} from './library-store';
import {navigatePage,recordingHash} from './page-routing';
vi.mock('./App',()=>({default:({documentId,onBack}:{documentId?:string;onBack?:()=>void})=><div data-testid="recording-page"><span data-testid="page-token">{documentId}</span><button onClick={onBack}>返回概览</button></div>}));
beforeEach(()=>{localStorage.clear();window.history.replaceState({},'','/');});
afterEach(()=>{cleanup();vi.restoreAllMocks();delete (window as any).VOXSCRIBE_PRIVATE_DEMO;});
test('direct token link and reload reopen exactly the same saved record',async()=>{
 const data=initialLibrary();data.items.push({...data.items[0],id:'record:unique',name:'A stable recording'});localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
 window.history.replaceState({},'',recordingHash('record:unique'));
 const first=render(<Library/>);await waitFor(()=>expect(screen.getByTestId('page-token').textContent).toBe('record:unique'));first.unmount();
 render(<Library/>);await waitFor(()=>expect(screen.getByTestId('page-token').textContent).toBe('record:unique'));
 expect(readLibrary().items.map(i=>i.id)).toEqual(data.items.map(i=>i.id));
});
test('library open, overview, browser Back and Forward follow the URL',async()=>{
 render(<Library/>);fireEvent.click(screen.getByText('VoxScribe 使用指南（演示）'));
 await waitFor(()=>expect(window.location.hash).toBe(recordingHash('welcome-demo')));
 fireEvent.click(await screen.findByText('返回概览'));await screen.findByText('VoxScribe 使用指南（演示）');expect(window.location.hash).toBe('#/library');
 await act(async()=>{window.history.back();});await waitFor(()=>expect(screen.getByTestId('page-token').textContent).toBe('welcome-demo'));
 await act(async()=>{window.history.forward();});await screen.findByText('VoxScribe 使用指南（演示）');expect(screen.queryByTestId('recording-page')).toBeNull();
});
test('unknown, trashed and malformed tokens never open or create a replacement record',async()=>{
 const data=initialLibrary();data.items.push({...data.items[0],id:'trashed',deletedAt:'2026-10-18'});localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
 window.history.replaceState({},'',recordingHash('unknown'));
 render(<Library/>);await screen.findByRole('heading',{name:'此浏览器中找不到这个页面'});expect(screen.queryByTestId('recording-page')).toBeNull();
 expect(readLibrary().items).toEqual(data.items);
 act(()=>navigatePage({kind:'recording',token:'trashed'}));expect(screen.queryByTestId('recording-page')).toBeNull();
 act(()=>{window.location.hash='#/recordings/%';window.dispatchEvent(new HashChangeEvent('hashchange'));});expect(screen.queryByTestId('recording-page')).toBeNull();
 expect(readLibrary().items).toEqual(data.items);
});
test('legacy fresh-demo canonicalizes once and explicit overview prevents another fresh copy',async()=>{
 (window as any).VOXSCRIBE_PRIVATE_DEMO={name:'example.wav',segments:[]};
 window.history.replaceState({},'','/?fresh-demo=stable-copy&theme=dark');
 const first=render(<Library/>);await waitFor(()=>expect(screen.getByTestId('page-token').textContent).toBe('private-fresh:stable-copy'));
 expect(window.location.hash).toBe(recordingHash('private-fresh:stable-copy'));expect(window.location.search).toBe('?theme=dark');
 const count=readLibrary().items.length;first.unmount();render(<Library/>);await screen.findByTestId('recording-page');expect(readLibrary().items.length).toBe(count);cleanup();
 window.history.replaceState({},'','/?fresh-demo=do-not-create#/library');render(<Library/>);expect(screen.queryByTestId('recording-page')).toBeNull();
 expect(readLibrary().items.some(i=>i.id==='private-fresh:do-not-create')).toBe(false);
});

test('a delayed media lookup cannot reopen a record after navigation away',async()=>{
 let finish!:(file:File|undefined)=>void;
 const read=vi.spyOn(libraryStore,'readMedia').mockImplementation(()=>new Promise(resolve=>{finish=resolve}));
 const data=initialLibrary();data.items.push({...data.items[0],id:'slow-audio',name:'Slow audio',kind:'audio',mediaStored:true});localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
 window.history.replaceState({},'',recordingHash('slow-audio'));render(<Library/>);
 await screen.findByRole('status');expect(read).toHaveBeenCalledWith('slow-audio');
 act(()=>navigatePage({kind:'recording',token:'welcome-demo'}));await waitFor(()=>expect(screen.getByTestId('page-token').textContent).toBe('welcome-demo'));
 await act(async()=>{finish(new File(['audio'],'slow.wav',{type:'audio/wav'}));});
 expect(screen.getByTestId('page-token').textContent).toBe('welcome-demo');expect(window.location.hash).toBe(recordingHash('welcome-demo'));
});
test('a deleted legacy demo nonce stays deleted and its history remains intact',async()=>{
 (window as any).VOXSCRIBE_PRIVATE_DEMO={name:'example.wav',segments:[]};
 const data=initialLibrary();data.items.push({...data.items[0],id:'private-fresh:deleted',deletedAt:'2026-10-18'});localStorage.setItem(STORAGE_KEY,JSON.stringify(data));localStorage.setItem('voxscribe-history-v1:private-fresh:deleted','saved-history');
 window.history.replaceState({},'','/?fresh-demo=deleted');render(<Library/>);
 await screen.findByRole('heading',{name:'此浏览器中找不到这个页面'});expect(screen.queryByTestId('recording-page')).toBeNull();
 expect(readLibrary().items.filter(i=>i.id==='private-fresh:deleted')).toEqual([data.items[1]]);expect(localStorage.getItem('voxscribe-history-v1:private-fresh:deleted')).toBe('saved-history');
 fireEvent.click(screen.getByText('返回概览'));expect(window.location.hash).toBe('#/library');expect(window.location.search).toBe('');
});
