"""Local HTTP boundary tests. No model loads or external network calls."""
import asyncio
import importlib
import json

from fastapi.testclient import TestClient

api = importlib.import_module('backend.app')
client = TestClient(api.app, base_url='http://localhost')


def test_foreign_origin_rejected_before_alignment(monkeypatch):
    monkeypatch.setattr(api.aligner, 'align_segments', lambda *args: (_ for _ in ()).throw(AssertionError('must not run')))
    response = client.post('/api/align', headers={'Origin': 'https://untrusted.example'}, files={'file': ('a.wav', b'x')})
    assert response.status_code == 403


def test_local_origin_and_host():
    assert client.get('/api/health', headers={'Origin': 'http://localhost:5173'}).status_code == 200
    assert client.get('/api/health', headers={'Host': 'attacker.example'}).status_code == 400
    assert client.get('/api/health', headers={'Origin': 'null'}).status_code == 403
    assert client.get('/api/health', headers={'Host': '[::1]:8000'}).status_code == 200


def test_content_length_limit_before_body_read(monkeypatch):
    monkeypatch.setattr(api, 'MAX_BODY_BYTES', 10)
    assert client.post('/api/align', content=b'12345678901').status_code == 413
    assert client.post('/api/align', headers={'Content-Length': '-1'}, content=b'').status_code == 400


def test_chunked_limit_closes_multipart_file(monkeypatch):
    import starlette.formparsers
    files = []
    original = starlette.formparsers.SpooledTemporaryFile

    def record_file(*args, **kwargs):
        handle = original(*args, **kwargs)
        files.append(handle)
        return handle

    monkeypatch.setattr(starlette.formparsers, 'SpooledTemporaryFile', record_file)
    monkeypatch.setattr(api, 'MAX_BODY_BYTES', 1000)
    chunks = [
        b'--bound\r\nContent-Disposition: form-data; name="file"; filename="a.wav"\r\nContent-Type: audio/wav\r\n\r\n' + b'x' * 500,
        b'y' * 500,
        b'\r\n--bound--\r\n',
    ]
    sent = []
    reads = 0

    async def receive():
        nonlocal reads
        chunk = chunks[reads]
        reads += 1
        return {'type': 'http.request', 'body': chunk, 'more_body': reads < len(chunks)}

    async def send(message):
        sent.append(message)

    scope = {
        'type': 'http', 'asgi': {'version': '3.0'}, 'http_version': '1.1',
        'method': 'POST', 'scheme': 'http', 'path': '/api/align', 'raw_path': b'/api/align',
        'query_string': b'', 'root_path': '', 'server': ('localhost', 8000), 'client': ('127.0.0.1', 1),
        'headers': [(b'host', b'localhost'), (b'content-type', b'multipart/form-data; boundary=bound')],
    }
    asyncio.run(api.app(scope, receive, send))
    assert sent[0]['status'] == 413
    assert json.loads(sent[1]['body']) == {'detail': 'Request body too large'}
    assert reads == 2  # Further upload data is never passed into the parser.
    assert files and all(handle.closed for handle in files)
