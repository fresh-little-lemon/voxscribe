"""Conservative coarse transcript localization. Candidate anchors are not alignment."""
import re
from collections import defaultdict
from difflib import SequenceMatcher

TOKEN = re.compile(r"[\u3400-\u9fff]|[a-z0-9]+(?:['’][a-z0-9]+)*", re.IGNORECASE)

def tokens(text):
    return [m.group().lower().replace('’', "'") for m in TOKEN.finditer(text)]

def localize(paragraphs, coarse_segments):
    if not coarse_segments:
        return {'status':'needs_transcription','segments':[{'id':p['id'],'text':p['text'],'annotation':p.get('annotation',''),'localizationStatus':'needs_review','verified':False,'candidates':[],'warnings':['No timestamped coarse transcript supplied']} for p in paragraphs], 'warnings':['Run or import a timestamped coarse ASR transcript first. No timestamps were invented.']}
    source=[];bounds=[];index=defaultdict(list)
    for s in coarse_segments:
        for token in tokens(s['text']):
            index[token].append(len(source));source.append(token);bounds.append((s['start'],s['end']))
    results=[]
    for p in paragraphs:
        query=tokens(p['text']);warning=[];candidates=[]
        if len(query)<3:
            warning.append('Paragraph too short for reliable localization')
        elif len(query)>400:
            warning.append('Paragraph exceeds 400 tokens: split it before localization')
        else:
            # Rare-token seeds tolerate omitted/edited words without scoring every window.
            seeds=sorted([(len(index[t]),i,t) for i,t in enumerate(query) if t in index])[:8]
            starts=set()
            for _,i,t in seeds:
                for pos in index[t][:50]:
                    starts.add(max(0,pos-i))
            margin=max(4,int(len(query)*.35))
            seen={}
            for seed in sorted(starts)[:300]:
                lo=max(0,seed-margin);hi=min(len(source),seed+len(query)+margin)
                matcher=SequenceMatcher(None,query,source[lo:hi],autojunk=False)
                blocks=[b for b in matcher.get_matching_blocks() if b.size]
                if not blocks: continue
                first=lo+blocks[0].b;last=lo+blocks[-1].b+blocks[-1].size-1
                matched=sum(b.size for b in blocks)
                coverage=matched/len(query)
                precision=matched/(last-first+1)
                score=round(2*coverage*precision/(coverage+precision),4)
                if score<.45: continue
                start,end=bounds[first][0],bounds[last][1]
                key=(start,end)
                candidate={'start':start,'end':end,'score':score,'textCoverage':round(coverage,4)}
                if key not in seen or score>seen[key]['score']:seen[key]=candidate
            # Adjacent seed windows describing the same occurrence are one candidate.
            ranked=sorted(seen.values(),key=lambda c:(-c['score'],c['start']))
            for c in ranked:
                if any(max(c['start'],x['start'])<min(c['end'],x['end']) and abs(c['start']-x['start'])<2 for x in candidates):continue
                candidates.append(c)
                if len(candidates)==5:break
        best=candidates[0] if candidates else None
        ambiguous=len(candidates)>1 and candidates[1]['score']>=best['score']-.08
        good=best is not None and best['score']>=.72 and best['textCoverage']>=.7 and not ambiguous
        if not best:warning.append('No sufficiently supported text match')
        elif ambiguous:warning.append('Repeated or ambiguous passage: select the intended occurrence')
        elif not good:warning.append('Weak text match: review candidate ranges')
        if best and best['end']-best['start']>120:
            good=False;warning.append('Candidate exceeds 120 seconds: split paragraph before forced alignment')
        result={'id':p['id'],'text':p['text'],'annotation':p.get('annotation',''),'localizationStatus':'candidate' if good else 'needs_review','candidates':candidates,'warnings':warning,'verified':False}
        if good:result.update(start=best['start'],end=best['end'])
        results.append(result)
    return {'status':'localized' if all(r['localizationStatus']=='candidate' for r in results) else 'needs_review','segments':results,'warnings':['Candidate ranges come from coarse ASR text matching, not verified word boundaries. Review anchors before forced alignment. Translation annotations are never aligned.']}
