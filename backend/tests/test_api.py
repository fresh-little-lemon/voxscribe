import json
from fastapi.testclient import TestClient
from backend.app import app, aligner
from backend.alignment import boundary_warnings, text_hash
client=TestClient(app, base_url='http://localhost')
def request(data):
    return client.post('/api/align',files={'file':('test.wav',b'not audio')},data={'transcript':json.dumps(data)})
def test_health_does_not_load_model():
    assert client.get('/api/health').status_code==200

def test_reject_invalid_window():
    for start,end in [(10,9),(0,121),(-1,2)]:
        assert request({'segments':[{'id':'1','text':'Hello','start':start,'end':end}]}).status_code==422

def test_duplicate_ids():
    assert request({'segments':[{'id':'1','text':'Hello','start':0,'end':1}]*2}).status_code==422

def test_error_never_returns_fake_words(monkeypatch):
    def fail(*args): raise RuntimeError('model missing')
    monkeypatch.setattr(aligner,'align_segments',fail)
    response=request({'segments':[{'id':'1','text':'Hello','start':0,'end':1}]})
    assert response.status_code==503
    assert 'segments' not in response.json()

def test_revision_echo_contract(monkeypatch):
    # Contract test double only. Real model experiment is separate and documented.
    monkeypatch.setattr(aligner,'align_segments',lambda *args: [])
    response=request({'revision':'edit-2','segments':[{'id':'1','text':'Hello','start':0,'end':1}]})
    assert response.json()['revision']=='edit-2'
    assert response.json()['warnings']

def test_boundary_flags_and_text_revision():
    assert boundary_warnings([{'start':0,'end':0,'text':'x'}],0,1)
    assert boundary_warnings([{'start':-1,'end':0,'text':'x'}],0,1)
    assert text_hash('old')!=text_hash('edited')

def test_empty_words_require_review():
    assert boundary_warnings([],0,1)
