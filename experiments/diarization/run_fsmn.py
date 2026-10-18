"""FSMN-VAD CPU test; private boundaries stay in explicit output directory."""
import os, argparse, time, json, resource
from pathlib import Path
os.environ['OMP_NUM_THREADS']='2';os.environ['MKL_NUM_THREADS']='2';os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN']='1'
p=argparse.ArgumentParser();p.add_argument('audio',nargs='+');p.add_argument('--output-dir',required=True);a=p.parse_args()
import torch,soundfile as sf,funasr
from funasr import AutoModel
from huggingface_hub import snapshot_download
torch.set_num_threads(2);torch.set_num_interop_threads(2)
mid='funasr/fsmn-vad';rev='df20e6b30c653645fa4ff125cacfcabd1020a669'
t=time.perf_counter();local=snapshot_download(mid,revision=rev,token=False)
model=AutoModel(model=local,hub='hf',device='cpu',ncpu=2,disable_update=True,disable_pbar=True)
metrics={'model':mid,'revision':rev,'funasr':funasr.__version__,'torch':torch.__version__,'device':'cpu','threads':2,'load_and_download_seconds':time.perf_counter()-t,'clips':[]}
out=Path(a.output_dir);out.mkdir(exist_ok=True,parents=True)
for i,path in enumerate(a.audio):
 audio,sr=sf.read(path,dtype='float32');assert sr==16000
 t=time.perf_counter();res=model.generate(input=audio,fs=sr,disable_pbar=True);elapsed=time.perf_counter()-t
 (out/f'clip_{i+1}_segments.json').write_text(json.dumps(res,indent=2))
 spans=res[0]['value'];stats={'clip':i+1,'duration_seconds':len(audio)/sr,'inference_seconds':elapsed,'real_time_factor':elapsed/(len(audio)/sr),'segments':len(spans),'speech_seconds':sum(e-s for s,e in spans)/1000,'peak_process_rss_mib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024};metrics['clips'].append(stats);print(json.dumps(stats),flush=True)
 (out/'metrics.json').write_text(json.dumps(metrics,indent=2))
