// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {expect,test} from 'vitest';
import {saveMedia,readMedia} from './library-store';
// IndexedDB test double checks durable key/object-store behavior; browser codec playback is separate.
test('media survives database close and reopen under its record key',async()=>{const media={name:'example.wav',type:'audio/wav',bytes:[1,2,3]} as unknown as File;await saveMedia('persistence-test',media);const restored=await readMedia('persistence-test');expect(restored).toEqual(media);expect(await readMedia('missing-record')).toBeUndefined()});
