"""Private visualization of one continuous session; never joins independent IDs."""
import argparse,json,os
from pathlib import Path
os.environ.setdefault('MPLCONFIGDIR','/tmp/voxscribe-matplotlib')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
p=argparse.ArgumentParser();p.add_argument('--nemotron',required=True);p.add_argument('--fsmn',required=True);p.add_argument('--output',required=True);a=p.parse_args()
n=json.loads(Path(a.nemotron).read_text());f=json.loads(Path(a.fsmn).read_text())[0]['value']
colors=['#2563eb','#a855f7','#e88719','#16877b']
fig=plt.figure(figsize=(16,9),facecolor='#f8fafc');gs=fig.add_gridspec(2,2,height_ratios=[1.25,1],hspace=.45,wspace=.18)
axes=[fig.add_subplot(gs[0,:]),fig.add_subplot(gs[1,0]),fig.add_subplot(gs[1,1])]
for ax,limits,title in zip(axes,[(0,260),(0,65),(195,260)],['Continuous 260-second session','Detail A: first 65 seconds','Detail B: final 65 seconds']):
 ax.set_facecolor('#ffffff');ax.set_title(title,loc='left',fontsize=13,fontweight='bold',pad=13,color='#17243b')
 for sp in range(3):
  spans=[(s['Start'],s['End']-s['Start']) for s in n if s['Speaker']==sp]
  ax.broken_barh(spans,(3-sp-.27,.54),facecolors=colors[sp])
 ax.broken_barh([(s/1000,(e-s)/1000) for s,e in f],(-.27,.54),facecolors=colors[3])
 ax.set_xlim(*limits);ax.set_ylim(-.65,3.65);ax.set_yticks([3,2,1,0],['Speaker 0','Speaker 1','Speaker 2','FSMN speech']);ax.tick_params(axis='both',labelsize=10,length=0,pad=8)
 ax.set_xlabel('Seconds from start of continuous excerpt',fontsize=10,labelpad=10)
 ax.grid(axis='x',alpha=.15);ax.set_axisbelow(True)
 for spine in ax.spines.values():spine.set_visible(False)
fig.suptitle('Predicted speaker activity vs. VAD speech regions',x=.08,y=.965,ha='left',fontsize=22,fontweight='bold',color='#17243b')
fig.text(.08,.92,'NVIDIA Nemotron-3-Diarization (formal) + FunASR FSMN-VAD  |  Private course-audio inspection',fontsize=12,color='#475569')
fig.text(.08,.055,'Anonymous model channel IDs, not verified people. One continuous session; no independent-clip IDs were merged.',fontsize=11,color='#334155')
fig.text(.08,.025,'No human reference or listening review. Gaps and overlaps are predictions; disagreement is not proof of missed speech.',fontsize=11,color='#9a3412')
fig.subplots_adjust(left=.08,right=.975,top=.85,bottom=.15)
fig.savefig(a.output,dpi=130,facecolor=fig.get_facecolor());print(a.output)
