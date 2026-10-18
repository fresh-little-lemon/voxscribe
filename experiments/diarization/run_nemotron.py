"""Private-audio CPU smoke test. Writes raw predictions only to --output-dir."""
import argparse, json, os, time, resource
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('audio', nargs='+');p.add_argument('--output-dir',required=True);p.add_argument('--cache-dir',required=True);a=p.parse_args()
os.environ['OMP_NUM_THREADS']='2';os.environ['MKL_NUM_THREADS']='2';os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN']='1'
import torch, soundfile as sf, transformers
from transformers import AutoProcessor, AutoModelForAudioFrameClassification
torch.set_num_threads(2);torch.set_num_interop_threads(2)
model_id='nvidia/Nemotron-3-Diarization';revision='f667ed73aee57d40cc39428eb768b4fd87a0a29e'
start=time.perf_counter();processor=AutoProcessor.from_pretrained(model_id,revision=revision,cache_dir=a.cache_dir,token=False)
model=AutoModelForAudioFrameClassification.from_pretrained(model_id,revision=revision,cache_dir=a.cache_dir,token=False).cpu().eval()
load_sec=time.perf_counter()-start
out=Path(a.output_dir);out.mkdir(parents=True,exist_ok=True)
metrics={'model':model_id,'revision':revision,'runtime':{'transformers':transformers.__version__,'torch':torch.__version__,'device':'cpu','threads':2,'dtype':str(model.dtype)},'load_and_download_seconds':load_sec,'clips':[]}
print(json.dumps({'loaded_seconds':load_sec}),flush=True)
for idx,path in enumerate(a.audio):
 audio,sr=sf.read(path,dtype='float32');assert sr==16000 and audio.ndim==1
 t=time.perf_counter();inputs=processor(audio,sampling_rate=sr).to(model.device,dtype=model.dtype);prep=time.perf_counter()-t
 t=time.perf_counter()
 with torch.inference_mode(): logits=model(**inputs).logits
 infer=time.perf_counter()-t
 segments=processor.extract_speaker_dict(logits,inputs.attention_mask)[0]
 (out/f'clip_{idx+1}_segments.json').write_text(json.dumps(segments,indent=2))
 torch.save(logits.cpu(),out/f'clip_{idx+1}_logits.pt')
 stats={'clip':idx+1,'duration_seconds':len(audio)/sr,'preprocessing_seconds':prep,'inference_seconds':infer,'real_time_factor':infer/(len(audio)/sr),'segments':len(segments),'speaker_channels':sorted(set(s['Speaker'] for s in segments)),'speech_seconds_summed_including_overlap':sum(s['End']-s['Start'] for s in segments),'logits_shape':list(logits.shape),'peak_process_rss_mb':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024}
 metrics['clips'].append(stats); print(json.dumps(stats),flush=True)
 (out/'metrics.json').write_text(json.dumps(metrics,indent=2))
