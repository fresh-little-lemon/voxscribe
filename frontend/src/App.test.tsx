// @vitest-environment jsdom
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
beforeEach(()=>{URL.createObjectURL=vi.fn(()=> 'blob:local-media');URL.revokeObjectURL=vi.fn();});
afterEach(()=>{cleanup();vi.restoreAllMocks()});
test('demonstration, search and stale edited words are honest',()=>{const {container}=render(<App/>);expect(screen.getByText('演示')).toBeTruthy();fireEvent.click(screen.getByLabelText('搜索文字'));fireEvent.change(screen.getByPlaceholderText('搜索逐字稿…'),{target:{value:'xyz-not-in-document'}});expect(screen.getByText('没有找到匹配的文字')).toBeTruthy();fireEvent.click(screen.getByLabelText('关闭搜索'));fireEvent.click(screen.getByLabelText('编辑段落 1'));fireEvent.change(screen.getByLabelText('编辑逐字稿'),{target:{value:'A revised transcript.'}});fireEvent.click(screen.getByText('保存'));expect(container.querySelector('.is-stale')).toBeTruthy();expect(container.querySelector('.is-stale .word')).toBeNull();fireEvent.click(screen.getByText('重新对齐'));expect(screen.getByRole('status').textContent).toContain('请先导入');});
test('video layout uses the same sole media element',()=>{const {container}=render(<App/>);const media=container.querySelector('video');fireEvent.click(screen.getByText('视频布局'));expect(container.querySelector('.video-mode')).toBeTruthy();expect(container.querySelectorAll('video').length).toBe(1);expect(container.querySelector('video')).toBe(media);fireEvent.click(screen.getByText('音频布局'));expect(container.querySelector('video')).toBe(media);});
test('upload clears illustrative timestamps and initializes an editable draft',()=>{const {container}=render(<App/>);const input=container.querySelector('input[type=file]')!;fireEvent.change(input,{target:{files:[new File(['audio'],'recording.wav',{type:'audio/wav'})]}});expect(screen.queryByText('演示')).toBeNull();expect(screen.getByLabelText('编辑逐字稿')).toBeTruthy();expect(container.querySelector('.word')).toBeNull();expect(screen.getByRole('status').textContent).toContain('仅在点击对齐后发送');});

// Explicitly mocked API responses test UI revision safety, not alignment quality.
test.each(['text','anchors','audio'])('rejects an in-flight result after %s changes',async(kind)=>{
 const {container}=render(<App/>);const input=container.querySelector('input[type=file]')!;
 const upload=()=>fireEvent.change(input,{target:{files:[new File(['test-audio'],'recording.wav',{type:'audio/wav'})]}});upload();
 const video=container.querySelector('video')!;Object.defineProperty(video,'duration',{configurable:true,value:75});fireEvent.loadedMetadata(video);
 fireEvent.change(screen.getByLabelText('编辑逐字稿'),{target:{value:'Original text.'}});fireEvent.click(screen.getByText('保存'));
 let resolve!:(r:unknown)=>void;let requested='';vi.stubGlobal('fetch',vi.fn((_u,opts)=>{requested=JSON.parse(opts.body.get('transcript')).revision;return new Promise(r=>{resolve=r})}));
 fireEvent.click(screen.getByText('重新对齐'));
 if(kind==='audio')upload();else{fireEvent.click(screen.getByLabelText('编辑段落 1'));if(kind==='text')fireEvent.change(screen.getByLabelText('编辑逐字稿'),{target:{value:'New draft while waiting.'}});else fireEvent.change(screen.getByLabelText('开始（秒）'),{target:{value:'2'}})}
 resolve({ok:true,json:async()=>({revision:requested,method:'explicit-test-double',segments:[{id:'1',speaker:'Speaker',text:'SHOULD NOT APPLY',start:0,end:75,words:[{text:'SHOULD NOT APPLY',start:1,end:2}]}]})});
 await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('文字已变化'));expect(screen.queryByText('SHOULD NOT APPLY')).toBeNull();vi.unstubAllGlobals();
});
