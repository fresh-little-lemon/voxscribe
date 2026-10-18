"""Run with uvicorn backend.app:app --host 127.0.0.1 --port 8000."""
import json, os, tempfile, logging
from pathlib import Path
from typing import Annotated
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError, model_validator
from starlette.concurrency import run_in_threadpool
from starlette.formparsers import MultiPartException
from starlette.responses import JSONResponse
from .alignment import Aligner, MODEL_ID, MODEL_REVISION, WARNING

ALLOWED_ORIGINS = {'http://localhost:5173', 'http://127.0.0.1:5173'}
MAX_BODY_BYTES = 513 * 1024 * 1024  # 512 MiB file plus multipart overhead.

class LocalRequestGuard:
    """Reject foreign browser origins and bound streaming bodies before parsing.

    CORS alone does not prevent a website from sending a multipart POST.
    Origin-less local CLI clients remain supported; bind Uvicorn to loopback.
    """
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        headers = scope.get('headers', [])
        hosts = [v.decode('latin-1') for k, v in headers if k.lower() == b'host']
        host = hosts[0].lower() if len(hosts) == 1 else ''
        hostname = host.split(']')[0] + ']' if host.startswith('[') else host.split(':')[0]
        if hostname not in {'localhost', '127.0.0.1', '[::1]'}:
            return await JSONResponse({'detail': 'Local host required'}, 400)(scope, receive, send)
        origins = [v.decode('latin-1') for k, v in headers if k.lower() == b'origin']
        if origins and (len(origins) != 1 or origins[0] not in ALLOWED_ORIGINS):
            return await JSONResponse({'detail': 'Origin not allowed'}, 403)(scope, receive, send)
        lengths = [v for k, v in headers if k.lower() == b'content-length']
        if lengths:
            try:
                if len(lengths) != 1 or not lengths[0].isdigit():
                    raise ValueError
                length = int(lengths[0])
            except ValueError:
                return await JSONResponse({'detail': 'Invalid Content-Length'}, 400)(scope, receive, send)
            if length > MAX_BODY_BYTES:
                return await JSONResponse({'detail': 'Request body too large'}, 413)(scope, receive, send)
        received = 0
        exceeded = False
        rejection_sent = False

        async def limited_receive():
            nonlocal received, exceeded
            message = await receive()
            if message['type'] == 'http.request':
                received += len(message.get('body', b''))
                if received > MAX_BODY_BYTES:
                    exceeded = True
                    # Starlette's multipart parser closes spooled files on this error.
                    raise MultiPartException('Request body too large')
            return message

        async def guarded_send(message):
            nonlocal rejection_sent
            if exceeded:
                if not rejection_sent:
                    rejection_sent = True
                    await JSONResponse({'detail': 'Request body too large'}, 413)(scope, receive, send)
                return
            await send(message)

        try:
            await self.app(scope, limited_receive, guarded_send)
        except MultiPartException:
            if not exceeded:
                raise
            await guarded_send({})

app = FastAPI(title='VoxScribe local alignment', version='0.1.0')
app.add_middleware(CORSMiddleware, allow_origins=sorted(ALLOWED_ORIGINS), allow_methods=['POST','GET'], allow_headers=['*'])
app.add_middleware(LocalRequestGuard)
aligner = Aligner()
class Segment(BaseModel):
    id: str = Field(min_length=1,max_length=200)
    speaker: str = Field(default='',max_length=200)
    text: str = Field(min_length=1,max_length=16000)
    start: float = Field(ge=0,allow_inf_nan=False)
    end: float = Field(gt=0,allow_inf_nan=False)
    @model_validator(mode='after')
    def window(self):
        if not self.text.strip() or not 0 < self.end-self.start <=120:
            raise ValueError('Each nonempty segment needs 0 < end-start <=120 seconds')
        return self
class Transcript(BaseModel):
    revision: str = Field(default='',max_length=200)
    language: str = 'English'
    segments: list[Segment] = Field(min_length=1,max_length=12)
    @model_validator(mode='after')
    def ids(self):
        if len({s.id for s in self.segments}) != len(self.segments):
            raise ValueError('Segment IDs must be unique')
        return self

@app.get('/api/health')
def health():
    return {'status':'ok','model':MODEL_ID,'modelLoaded':aligner.model is not None,'method':'forced-alignment','audioLeavesServer':False}

@app.post('/api/align')
async def align(file: Annotated[UploadFile,File()], transcript: Annotated[str,Form()]):
    try:
        req = Transcript.model_validate_json(transcript)
    except (ValidationError, ValueError) as exc:
        raise HTTPException(422, str(exc))
    # Temporary local file only; remove on success and failure. No external upload.
    with tempfile.TemporaryDirectory(prefix='voxscribe-') as tmp:
        path=Path(tmp)/'audio.media'
        size=0
        with path.open('wb') as target:
            while chunk := await file.read(1024*1024):
                size += len(chunk)
                if size>512*1024*1024:
                    raise HTTPException(413,'Audio must be <=512 MiB')
                target.write(chunk)
        if not size:
            raise HTTPException(422,'Empty audio file')
        try:
            segments=await run_in_threadpool(aligner.align_segments,path,[s.model_dump() for s in req.segments],req.language)
        except ValueError as exc:
            raise HTTPException(422,str(exc))
        except Exception as exc:
            # Do not substitute generated timings if dependencies/weights fail.
            logging.getLogger(__name__).exception('Local forced alignment failed')
            raise HTTPException(503,f'Alignment unavailable ({type(exc).__name__}). Check local server model/dependency logs.')
    return {'revision':req.revision,'segments':segments,'method':'Qwen3-ForcedAligner-0.6B-hf','modelRevision':MODEL_REVISION,'warnings':[WARNING]}

# Coarse matching endpoint; deliberately separate from acoustic alignment.
from .localization import localize
class Paragraph(BaseModel):
    id: str = Field(min_length=1,max_length=200)
    text: str = Field(min_length=1,max_length=16000)
    annotation: str = Field(default='',max_length=16000)
class CoarseSegment(BaseModel):
    text: str = Field(min_length=1,max_length=32000)
    start: float = Field(ge=0,allow_inf_nan=False)
    end: float = Field(gt=0,allow_inf_nan=False)
    @model_validator(mode='after')
    def bounds(self):
        if self.end<=self.start: raise ValueError('Coarse end must exceed start')
        return self
class LocalizationRequest(BaseModel):
    revision: str = Field(default='',max_length=200)
    paragraphs: list[Paragraph] = Field(min_length=1,max_length=200)
    coarseSegments: list[CoarseSegment] = Field(default_factory=list,max_length=10000)
    language: str = 'English'
    @model_validator(mode='after')
    def validate_source(self):
        if sum(len(s.text) for s in self.coarseSegments)>500000:
            raise ValueError('Coarse transcript exceeds 500000 characters')
        if len({p.id for p in self.paragraphs})!=len(self.paragraphs):
            raise ValueError('Paragraph IDs must be unique')
        if any(b.start<a.start for a,b in zip(self.coarseSegments,self.coarseSegments[1:])):
            raise ValueError('Coarse segments must be ordered by start')
        return self

@app.post('/api/localize')
async def localize_transcript(request:LocalizationRequest):
    result=await run_in_threadpool(localize,[p.model_dump() for p in request.paragraphs],[s.model_dump() for s in request.coarseSegments])
    return {**result,'revision':request.revision,'method':'coarse-text-candidate-matching'}

class TranscriptionOptions(BaseModel):
    start: float = Field(default=0,ge=0,allow_inf_nan=False)
    end: float = Field(gt=0,allow_inf_nan=False)
    language: str = 'English'
    @model_validator(mode='after')
    def short_window(self):
        if not 0<self.end-self.start<=120:raise ValueError('Select a range of at most 120 seconds')
        if self.language not in {'English','Chinese'}:raise ValueError('Short-clip MVP supports English or Chinese')
        return self

@app.post('/api/transcribe')
async def transcribe(file:Annotated[UploadFile,File()],options:Annotated[str,Form()]):
    if os.getenv('VOXSCRIBE_ENABLE_ASR','0')!='1':
        raise HTTPException(503,'Local short-clip ASR is disabled. Set VOXSCRIBE_ENABLE_ASR=1 on the server; official model weights may download. Whole-recording transcription is not implemented.')
    try:req=TranscriptionOptions.model_validate_json(options)
    except ValueError as exc:raise HTTPException(422,str(exc))
    with tempfile.TemporaryDirectory(prefix='voxscribe-asr-') as tmp:
        path=Path(tmp)/'audio.media';size=0
        with path.open('wb') as target:
            while chunk:=await file.read(1024*1024):
                size+=len(chunk)
                if size>512*1024*1024:raise HTTPException(413,'Audio must be <=512 MiB')
                target.write(chunk)
        if not size:raise HTTPException(422,'Empty audio file')
        from .transcription import transcribe_window
        try:return await run_in_threadpool(transcribe_window,path,req.start,req.end,req.language,aligner)
        except ValueError as exc:raise HTTPException(422,str(exc))
        except Exception as exc:
            logging.getLogger(__name__).exception('Local short-clip ASR failed')
            raise HTTPException(503,f'Local ASR unavailable ({type(exc).__name__}); check server model/dependency logs.')
