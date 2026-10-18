"""Run privately: python experiments/run_alignment.py AUDIO OUTPUT_DIR CASES_JSON.
Output contains private course text; never commit the output directory.
"""
import json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.alignment import Aligner, decode_window, boundary_warnings, MODEL_ID, MODEL_REVISION
case_data=json.loads(Path(sys.argv[3]).read_text())
start,end=case_data['start'],case_data['end']
out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
audio=decode_window(sys.argv[1],start,end)
a=Aligner();a.load();print('MODEL LOADED',a.load_seconds,flush=True)
for name,text in case_data['cases'].items():
    words,elapsed=a.align_audio(audio,text,offset=start)
    result=dict(case=name,model=MODEL_ID,revision=MODEL_REVISION,audio_window=[start,end],inference_seconds=elapsed,load_seconds=a.load_seconds,threads=2,transcript=text,words=words,warnings=boundary_warnings(words,start,end),verified=False)
    (out/f'{name}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(name,elapsed,len(words),result['warnings'],flush=True)
