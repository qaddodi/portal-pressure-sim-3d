#!/usr/bin/env python3
# Builds a page background from the Gemini engraving: removes the stray squiggle by the tube's foot, refills the page with the
# image's own blank paper (mirror-tiled), and lays the scene back scaled. scale 0 gives the plain-paper page.
#   python3 comp.py <gemini image> <out.jpg> <scale> <top fraction>
#   page 1: python3 comp.py gemini-original.jpg page1-bg.jpg 0.72 0.115      page 2: python3 comp.py gemini-original.jpg page2-bg.jpg 0 0
# The iPhone flyer's two pictures come from the same image:
#   python3 comp.py gemini-original.jpg paper-tile.jpg tile        the blank paper, mirrored into a tile that repeats without a seam
#   python3 comp.py gemini-original.jpg scene.jpg scene            the scene alone, its edges faded into that paper
import sys
from PIL import Image, ImageFilter, ImageOps
im=Image.open(sys.argv[1]).convert('RGB'); W,H=im.size
im.paste(im.crop((1166,1829,1198,1854)),(1128,1829))  # remove the stray squiggle by the tube's foot
mode=sys.argv[3]
# paper patch from the blank band, mirror-tiled
px0,px1=int(W*.10),int(W*.90); py0,py1=int(H*.765),int(H*.935)
patch=im.crop((px0,py0,px1,py1)); ph=patch.height
if mode=='tile':
    t=Image.new('RGB',(patch.width*2,ph*2))
    t.paste(patch,(0,0)); t.paste(ImageOps.mirror(patch),(patch.width,0))
    t.paste(ImageOps.flip(patch),(0,ph)); t.paste(ImageOps.flip(ImageOps.mirror(patch)),(patch.width,ph))
    # half the paper's contrast, so the tile's repeat does not show as a pattern on a long phone page
    from PIL import ImageStat
    flat=Image.new('RGB',t.size,tuple(int(v) for v in ImageStat.Stat(t).mean))
    t=Image.blend(t,flat,0.55)
    t.resize((t.width//2,t.height//2),Image.LANCZOS).save(sys.argv[2],quality=90); print('tile'); sys.exit()
if mode=='scene':
    sx0,sx1,sy0,sy1=int(W*.105),int(W*.895),int(H*.095),int(H*.755)
    sc=im.crop((sx0,sy0,sx1,sy1))
    bg=Image.new('RGB',sc.size); y=0; flip=False
    while y<bg.height:
        bg.paste(ImageOps.flip(patch) if flip else patch,(0,y)); y+=ph; flip=not flip
    bg=bg.resize(sc.size) if bg.width!=sc.width else bg
    f=42; sm=Image.new('L',sc.size,0); sm.paste(255,(f,f,sc.width-f,sc.height-f)); sm=sm.filter(ImageFilter.GaussianBlur(f*0.6))
    bg.paste(sc,(0,0),sm); bg.resize((sc.width*3//4,sc.height*3//4),Image.LANCZOS).save(sys.argv[2],quality=88); print('scene'); sys.exit()
scale=float(mode)
x0,x1,y0,y1=px0,px1,int(H*.075),int(H*.945)
fill=Image.new('RGB',(x1-x0,y1-y0)); y=0; flip=False
while y<fill.height:
    fill.paste(ImageOps.flip(patch) if flip else patch,(0,y)); y+=ph; flip=not flip
# feathered paste of the fill
m=Image.new('L',fill.size,0); m.paste(255,(14,30,fill.width-14,fill.height-30)); m=m.filter(ImageFilter.GaussianBlur(7))
out=im.copy(); out.paste(fill,(x0,y0),m)
if scale<=0:
    out.save(sys.argv[2],quality=92); print('paper only'); sys.exit()
# scene crop scaled, placed at top
sx0,sx1,sy0,sy1=int(W*.105),int(W*.895),int(H*.095),int(H*.755)
scene=im.crop((sx0,sy0,sx1,sy1)); nw,nh=int(scene.width*scale),int(scene.height*scale)
scene=scene.resize((nw,nh),Image.LANCZOS)
sm=Image.new('L',(nw,nh),0); f=int(30*scale); sm.paste(255,(f,f,nw-f,nh-f)); sm=sm.filter(ImageFilter.GaussianBlur(f*0.6))
top=int(H*float(sys.argv[4]))
out.paste(scene,((W-nw)//2,top),sm)
out.save(sys.argv[2],quality=92)
print('scene bottom fraction', (top+nh)/H)
