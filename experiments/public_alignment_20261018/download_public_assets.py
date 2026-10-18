"""Download only public example audio and official pinned model assets.

Run with a Python environment containing huggingface_hub. Does not upload audio,
use a token, or execute remote model code. Assets remain outside the repository.
"""
import argparse
import hashlib
import os
from pathlib import Path
import urllib.request

AUDIO_URL = 'https://huggingface.co/datasets/bezzam/audio_samples/resolve/main/librispeech_mr_quilter.wav'
AUDIO_SHA256 = '799f78ed4beb4de7ceae3a809262d4ce242394342ccd1d58cef7d49dbc2def46'
MODEL = 'Qwen/Qwen3-ForcedAligner-0.6B-hf'
REVISION = 'c07281df297b9905d24a508279258cccf987a064'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('assets_directory', type=Path)
    parser.add_argument('model_cache', type=Path)
    args = parser.parse_args()
    args.assets_directory.mkdir(parents=True, exist_ok=True)
    audio = urllib.request.urlopen(AUDIO_URL, timeout=120).read()
    actual = hashlib.sha256(audio).hexdigest()
    if actual != AUDIO_SHA256:
        raise ValueError(f'Public audio hash changed: {actual}')
    path = args.assets_directory / 'librispeech_mr_quilter.wav'
    path.write_bytes(audio)
    print(path, len(audio), actual)
    os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN'] = '1'
    from huggingface_hub import snapshot_download
    result = snapshot_download(MODEL, revision=REVISION, cache_dir=str(args.model_cache / 'hub'), allow_patterns=['*.json', '*.jinja', '*.safetensors'], token=False, max_workers=3)
    print(result)


if __name__ == '__main__':
    main()
