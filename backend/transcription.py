"""Optional bounded local ASR; no remote speech API and no full-recording queue."""
import gc
import os
import time
from .alignment import decode_window, refine_coarse_anchors

ASR_MODEL='Qwen/Qwen3-ASR-0.6B-hf'
ASR_REVISION='7f1569a48a89f3e3f4dc3a5c9d28bddd903bc76c'

def transcribe_window(path,start,end,language,aligner):
    import torch
    from transformers import AutoProcessor,AutoModelForMultimodalLM
    if not 0<end-start<=120: raise ValueError('Select an audio range of at most 120 seconds')
    coarse=[];began=time.perf_counter()
    # Share compute lock with alignment; never run two CPU model requests together.
    with aligner.lock:
        torch.set_num_threads(2)
        kwargs={'revision':ASR_REVISION}
        if os.getenv('VOXSCRIBE_ASR_CACHE'):kwargs['cache_dir']=os.environ['VOXSCRIBE_ASR_CACHE']
        processor=AutoProcessor.from_pretrained(ASR_MODEL,**kwargs)
        model=AutoModelForMultimodalLM.from_pretrained(ASR_MODEL,dtype=torch.bfloat16,**kwargs).eval()
        try:
            current=start
            while current<end:
                stop=min(end,current+25)
                audio=decode_window(path,current,stop)
                inputs=processor.apply_transcription_request(audio=audio,language=language,sampling_rate=16000).to(model.device,model.dtype)
                with torch.inference_mode():ids=model.generate(**inputs,max_new_tokens=512,do_sample=False)
                generated=ids[:,inputs['input_ids'].shape[1]:]
                if generated.shape[1]>=512:raise ValueError('ASR token limit reached; choose a shorter range')
                text=processor.decode(generated,return_format='transcription_only')[0].strip()
                if text:coarse.append({'text':text,'start':current,'end':current+len(audio)/16000})
                current=stop
        finally:
            del model,processor
            gc.collect()
    anchors,warnings=refine_coarse_anchors(path,coarse,aligner)
    return {'coarseSegments':anchors,'rawCoarseSegments':coarse,'method':'Qwen3-ASR-0.6B-hf + Qwen3-ForcedAligner word anchors','modelRevision':ASR_REVISION,'elapsedSeconds':time.perf_counter()-began,'verified':False,'warnings':warnings+['Machine transcription and coarse word anchors may be wrong. Review localization candidates and final timings.']}
