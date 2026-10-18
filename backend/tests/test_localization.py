from backend.localization import localize,tokens

def test_missing_coarse_does_not_invent_time():
    r=localize([{'id':'x','text':'hello world today'}],[])
    assert r['status']=='needs_transcription'
    assert 'start' not in r['segments'][0]

def test_english_edited_paragraph():
    r=localize([{'id':'p','text':'The two nodes cannot hear each other.'}],[{'text':'Introduction to wireless networks','start':0,'end':10},{'text':'The two user nodes cannot hear each other','start':10,'end':20},{'text':'Let us move to a different topic','start':20,'end':30}])
    s=r['segments'][0];assert s['localizationStatus']=='candidate';assert (s['start'],s['end'])==(10,20)

def test_repeated_passage_needs_review():
    text='Both user nodes can hear the access point'
    r=localize([{'id':'p','text':text}],[{'text':text,'start':0,'end':10},{'text':'A separate completely different topic in between','start':10,'end':20},{'text':text,'start':20,'end':30}])
    s=r['segments'][0];assert s['localizationStatus']=='needs_review';assert 'start' not in s

def test_chinese_translation_only_annotation():
    r=localize([{'id':'p','text':'两个节点无法相互听到','annotation':'The purple elephant lives on Mars'}],[{'text':'今天我们研究无线网络','start':0,'end':5},{'text':'两个节点无法相互听到','start':5,'end':12}])
    s=r['segments'][0];assert s['start']==5;assert s['annotation'].startswith('The purple');assert s['verified'] is False

def test_unmatched_and_short_not_timed():
    for text in ['hello','purple elephants drink coffee on Mars']:
        r=localize([{'id':'p','text':text}],[{'text':'the transmitter sends the packet after waiting','start':0,'end':5}]);assert 'start' not in r['segments'][0]

def test_long_candidate_not_ready_for_alignment():
    text='The transmitter sends the packet after waiting'
    s=localize([{'id':'p','text':text}],[{'text':text,'start':0,'end':300}])['segments'][0]
    assert s['localizationStatus']=='needs_review';assert 'start' not in s

def test_localization_api_and_revision():
    from fastapi.testclient import TestClient
    from backend.app import app
    c=TestClient(app,base_url='http://localhost')
    r=c.post('/api/localize',json={'revision':'import-2','paragraphs':[{'id':'p','text':'words without anchors'}]})
    assert r.status_code==200;assert r.json()['revision']=='import-2';assert r.json()['status']=='needs_transcription'
    r=c.post('/api/localize',json={'paragraphs':[{'id':'p','text':'words without anchors'}],'coarseSegments':[{'text':'x','start':5,'end':2}]})
    assert r.status_code==422

def test_transcribe_disabled_and_overlong(monkeypatch):
    from fastapi.testclient import TestClient
    from backend.app import app
    import json
    c=TestClient(app,base_url='http://localhost')
    monkeypatch.delenv('VOXSCRIBE_ENABLE_ASR',raising=False)
    r=c.post('/api/transcribe',files={'file':('x.wav',b'x')},data={'options':json.dumps({'start':0,'end':75})})
    assert r.status_code==503
    monkeypatch.setenv('VOXSCRIBE_ENABLE_ASR','1')
    r=c.post('/api/transcribe',files={'file':('x.wav',b'x')},data={'options':json.dumps({'start':0,'end':121})})
    assert r.status_code==422
