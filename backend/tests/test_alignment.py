import sys
import numpy as np
import pytest
from backend.alignment import Aligner, decode_window

@pytest.mark.parametrize('start,expected',[(10,9.5),(0,0)])
def test_window_offset_and_unverified(monkeypatch,start,expected):
    import backend.alignment as module
    a=Aligner();seen=[]
    def decode(path,left,right):
        seen.append((left,right));return np.zeros(16000)
    def align(audio,text,language,offset):
        return [{'text':'Hello','start':offset+.2,'end':offset+.4}],.01
    monkeypatch.setattr(module,'decode_window',decode)
    monkeypatch.setattr(a,'align_audio',align)
    result=a.align_segments('x',[{'id':'1','speaker':'x','text':'Hello','start':start,'end':start+1}])[0]
    assert seen[0][0]==expected
    assert result['words'][0]['start']==expected+.2
    assert result['verified'] is False
    assert result['start']==start

@pytest.mark.parametrize('words',[[],[{'text':'unspoken','start':0,'end':0}]])
def test_empty_and_collapsed_are_review(monkeypatch,words):
    import backend.alignment as module
    a=Aligner()
    monkeypatch.setattr(module,'decode_window',lambda *args:np.zeros(16000))
    monkeypatch.setattr(a,'align_audio',lambda *args:(words,.01))
    r=a.align_segments('x',[{'id':'1','text':'unspoken','start':0,'end':1}])[0]
    assert r['alignmentStatus']=='review'
    assert r['verified'] is False

def test_ffmpeg_rejects_playlist(tmp_path):
    playlist=tmp_path/'bad.m3u8'
    playlist.write_text('#EXTM3U\n#EXTINF:1,\nhttp://127.0.0.1:9/no.wav\n')
    with pytest.raises(ValueError,match='decode failed'):
        decode_window(playlist,0,1)

def test_implausibly_long_word_warns():
    from backend.alignment import boundary_warnings
    assert any('two seconds' in s for s in boundary_warnings([{'text':'happens','start':0,'end':11.28}],0,15))

def test_scoped_window_is_not_expanded(monkeypatch):
    import backend.alignment as module
    a=Aligner();seen=[]
    def decode(path,start,end):
        seen.append((start,end));return np.zeros(16000)
    monkeypatch.setattr(module,'decode_window',decode)
    monkeypatch.setattr(a,'align_audio',lambda audio,text,language,offset:([{'text':'edit','start':offset+.2,'end':offset+.4}],.01))
    result=a.align_segments('x',[{'id':'local','text':'edit','start':10,'end':11,'scoped':True}])[0]
    assert seen==[(10,11)]
    assert result['words'][0]['start']==10.2
