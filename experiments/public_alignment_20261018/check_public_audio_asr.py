import time,json,wave,numpy as np
from pathlib import Path
from faster_whisper import WhisperModel
cache=Path('/workspace/shared/asr-model-cache/hub/models--Systran--faster-whisper-base.en/snapshots')
t=time.perf_counter()
m=WhisperModel(str(next(cache.iterdir())),device='cpu',compute_type='int8',cpu_threads=2)
with wave.open('/workspace/shared/voxscribe-public-assets/librispeech_mr_quilter.wav') as f: audio=np.frombuffer(f.readframes(f.getnframes()),dtype=np.int16).astype(np.float32)/32768
s,info=m.transcribe(audio,language='en',beam_size=5,word_timestamps=False)
text=' '.join(x.text.strip() for x in s)
r={'purpose':'Independent ASR content cross-check only, never timing source','model':'Systran/faster-whisper-base.en','text':text,'seconds':time.perf_counter()-t,'word_timestamps_requested':False,'audio_external_upload':False}
Path('/workspace/shared/voxscribe-restored/experiments/public_alignment_20261018/independent-asr-content.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps(r))
