"""Local-only Qwen forced alignment. No ASR and no fabricated timing fallback."""
import hashlib
import os
import subprocess
import threading
import time
from pathlib import Path

os.environ.setdefault('OMP_NUM_THREADS', '2')
os.environ.setdefault('MKL_NUM_THREADS', '2')
MODEL_ID = 'Qwen/Qwen3-ForcedAligner-0.6B-hf'
MODEL_REVISION = 'c07281df297b9905d24a508279258cccf987a064'
WARNING = 'Forced alignment assumes supplied text was spoken; timestamps do not verify transcript truth. Listen to edited passages.'

def text_hash(text):
    return hashlib.sha256(text.encode()).hexdigest()

def decode_window(path, start, end):
    import numpy as np
    result = subprocess.run(['ffmpeg', '-v', 'error', '-threads', '1', '-ss', str(start), '-protocol_whitelist', 'file,pipe', '-format_whitelist', 'mov,mp3,wav,flac,ogg,matroska,aac,aiff', '-i', str(path), '-t', str(end-start), '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1'], capture_output=True, timeout=90)
    if result.returncode:
        raise ValueError('Audio decode failed: unsupported or damaged media')
    audio = np.frombuffer(result.stdout, dtype=np.float32).copy()
    if len(audio) < 160:
        raise ValueError('No audio in requested time window')
    return audio

def boundary_warnings(words, start, end):
    warnings = []
    if not words:
        warnings.append('Model emitted no word timings; review required')
    previous = start
    for w in words:
        if not (start <= w['start'] <= w['end'] <= end + .08):
            warnings.append('Model emitted an out-of-bounds or inverted timestamp; review required')
        if w['start'] < previous - .08:
            warnings.append('Model emitted nonmonotonic timestamps; review required')
        if w['end'] - w['start'] > 2.0:
            warnings.append('One or more words span over two seconds; broad or mismatched anchors may be responsible')
        if w['end'] - w['start'] < .02:
            warnings.append('One or more words have near-zero duration; text/audio mismatch is possible')
        previous = w['start']
    return list(dict.fromkeys(warnings))

class Aligner:
    def __init__(self):
        self.processor = self.model = None
        self.lock = threading.Lock()
        self.load_seconds = None
    def load(self):
        if self.model is not None:
            return
        import torch
        from transformers import AutoProcessor, AutoModelForTokenClassification
        torch.set_num_threads(min(2, max(1, int(os.getenv('VOXSCRIBE_THREADS', '2')))))
        t = time.perf_counter()
        self.processor = AutoProcessor.from_pretrained(MODEL_ID, revision=MODEL_REVISION)
        self.model = AutoModelForTokenClassification.from_pretrained(MODEL_ID, revision=MODEL_REVISION, dtype=torch.bfloat16, attn_implementation='sdpa').eval()
        self.load_seconds = time.perf_counter() - t
    def align_audio(self, audio, text, language='English', offset=0):
        import torch
        self.load()
        t = time.perf_counter()
        inputs, word_lists = self.processor.prepare_forced_aligner_inputs(audio=audio, transcript=text, language=language, return_tensors='pt')
        inputs = inputs.to(self.model.device, self.model.dtype)
        with torch.inference_mode():
            outputs = self.model(**inputs)
        decoded = self.processor.decode_forced_alignment(logits=outputs.logits, input_ids=inputs['input_ids'], word_lists=word_lists, timestamp_token_id=self.model.config.timestamp_token_id)[0]
        words = [{'text': w['text'], 'start': round(offset+w['start_time'], 3), 'end': round(offset+w['end_time'], 3)} for w in decoded]
        return words, time.perf_counter()-t
    def align_segments(self, path, segments, language='English'):
        results = []
        with self.lock:
            for s in segments:
                # Segment anchors are approximate. Add 0.5 s context, retaining absolute offsets.
                start, end = (s['start'], s['end']) if s.get('scoped') else (max(0, s['start']-.5), s['end']+.5)
                audio = decode_window(path, start, end)
                words, elapsed = self.align_audio(audio, s['text'], language, start)
                warnings = boundary_warnings(words, start, start+len(audio)/16000)
                results.append({**s, 'words': words, 'textHash': text_hash(s['text']), 'alignmentStatus': 'review' if warnings else 'aligned', 'verified': False, 'warnings': warnings, 'inferenceSeconds': elapsed})
        return results


def refine_coarse_anchors(path, coarse_segments, aligner):
    """Align whole ASR windows before locating an edited subparagraph.

    Passing just the edited phrase against a wide window can pull it onto earlier
    unrelated speech. This stage supplies the full recognized context instead.
    """
    words=[];warnings=[]
    for i,s in enumerate(coarse_segments):
        result=aligner.align_segments(path,[{'id':f'coarse-{i}','text':s['text'],'start':s['start'],'end':s['end'],'speaker':''}])[0]
        words.extend(w for w in result['words'] if w['end']>w['start'])
        warnings.extend(result['warnings'])
    return sorted(words,key=lambda w:(w['start'],w['end'])),list(dict.fromkeys(warnings))
