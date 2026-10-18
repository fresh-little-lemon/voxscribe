"""Reproduce public-human-speech checks against the unchanged local production API.

No ASR, doubles, fabricated timings, remote inference, or private audio are used.
Set HF_HOME to the pinned official model cache before running. This script forces
Hugging Face offline mode during inference and leaves all returned words intact.
"""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import sys
import time
import wave

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN'] = '1'
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from fastapi.testclient import TestClient
from backend.app import app, aligner
from backend.alignment import MODEL_ID, MODEL_REVISION

FULL = 'MISTER QUILTER IS THE APOSTLE OF THE MIDDLE CLASSES AND WE ARE GLAD TO WELCOME HIS GOSPEL'
CASES = {
    'reference_full': FULL,
    'initial_omitted_middle': FULL.replace(' MIDDLE', ''),
    'initial_omitted_clause': FULL.replace(' THE MIDDLE CLASSES AND WE ARE GLAD', ''),
    'initial_omitted_tail': FULL.split(' AND WE')[0],
    'negative_unspoken': FULL.replace(' CLASSES', ' CLASSES PURPLE ELEPHANTS DANCE ON THE MOON'),
}


def inspect(words, duration):
    return {
        'word_count': len(words),
        'starts_monotonic': all(a['start'] <= b['start'] for a, b in zip(words, words[1:])),
        'ends_monotonic': all(a['end'] <= b['end'] for a, b in zip(words, words[1:])),
        'nonoverlap': all(a['end'] <= b['start'] for a, b in zip(words, words[1:])),
        'strictly_inside_audio': all(0 <= w['start'] <= w['end'] <= duration for w in words),
        'zero_duration_words': [w for w in words if w['start'] == w['end']],
        'near_zero_duration_count': sum(w['end'] - w['start'] < .02 for w in words),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('audio', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--jobs', type=Path, help='optional production frontend jobs manifest')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    audio = args.audio.read_bytes()
    sha = hashlib.sha256(audio).hexdigest()
    with wave.open(str(args.audio)) as f:
        duration = f.getnframes() / f.getframerate()
    client = TestClient(app, base_url='http://127.0.0.1')
    model_start = time.perf_counter()
    aligner.load()
    prep = time.perf_counter() - model_start
    print('MODEL_LOADED', json.dumps({'load_seconds': aligner.load_seconds, 'total_prepare_seconds': prep}), flush=True)
    cases = []
    if args.jobs:
        doc = json.loads(args.jobs.read_text())
        for case in doc['cases']:
            if case.get('jobs'):
                cases.append((case['name'], case['jobs']))
    else:
        cases = [(name, [dict(id='public-speech', text=text, start=0, end=duration, speaker='LibriSpeech reader', scoped=True)]) for name, text in CASES.items()]
    metrics = []
    for name, segments in cases:
        revision = f'public-model-{name}'
        start = time.perf_counter()
        response = client.post('/api/align', files={'file': (args.audio.name, audio, 'audio/wav')}, data={'transcript': json.dumps({'revision': revision, 'language': 'English', 'segments': segments})})
        elapsed = time.perf_counter() - start
        data = response.json()
        (args.output / f'{name}.json').write_text(json.dumps(data, indent=2) + '\n')
        metric = {'case': name, 'status': response.status_code, 'api_seconds': elapsed, 'model_load_included': False, 'request_segments': segments, 'revision_preserved': data.get('revision') == revision, 'segments': []}
        for result in data.get('segments', []):
            metric['segments'].append({**inspect(result['words'], duration), 'id': result['id'], 'inference_seconds': result['inferenceSeconds'], 'alignment_status': result['alignmentStatus'], 'verified': result['verified'], 'warnings': result['warnings']})
        metrics.append(metric)
        print(json.dumps(metric), flush=True)
    result = {
        'recorded_at_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'test_type': 'real local CPU model via production FastAPI TestClient; not browser or deployed service',
        'model': MODEL_ID, 'model_revision': MODEL_REVISION,
        'model_load_seconds': aligner.load_seconds, 'total_prepare_seconds': prep,
        'python': platform.python_version(),
        'packages': {n: importlib.metadata.version(n) for n in ['torch', 'transformers', 'accelerate', 'fastapi', 'soundfile', 'librosa']},
        'inference_network_disabled': True, 'audio_sent_to_external_service': False,
        'audio': {'file': args.audio.name, 'sha256': sha, 'duration': duration, 'source': 'https://huggingface.co/datasets/bezzam/audio_samples/resolve/main/librispeech_mr_quilter.wav', 'official_model_example': 'https://huggingface.co/Qwen/Qwen3-ForcedAligner-0.6B-hf', 'original_sample_id': 'LibriSpeech dev-clean 1272-128104-0000', 'transcript_source': 'https://huggingface.co/datasets/hf-internal-testing/librispeech_asr_demo/viewer', 'original_corpus_license': 'CC BY 4.0', 'license_source': 'https://www.openslr.org/12', 'attribution': 'LibriSpeech corpus: Vassil Panayotov, Guoguo Chen, Daniel Povey, Sanjeev Khudanpur; derived from LibriVox audiobooks', 'transcript': FULL},
        'cases': metrics,
        'limits': ['Known public transcript is not a manually timestamp-labeled reference.', 'Monotonic/in-bounds model timings do not prove spoken-text agreement.', 'Single public English reader and short clip; no accent, language, diarization or long-recording accuracy claim.'],
    }
    (args.output / ('local-job-metrics.json' if args.jobs else 'real-api-metrics.json')).write_text(json.dumps(result, indent=2) + '\n')


if __name__ == '__main__':
    main()
