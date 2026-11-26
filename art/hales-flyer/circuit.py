#!/usr/bin/env python3
# Draws the engine's portal circuit as an engraving-style SVG (sepia ink, one oxblood accent).
INK='#3a2a1c'; RED='#7A2A22'; SOFT='#8a735a'
out=[]
def L(*pts,c=INK,w=1.6,dash=None):
    d=' '.join(f'{x},{y}' for x,y in pts)
    out.append(f'<polyline points="{d}" fill="none" stroke="{c}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round"{f" stroke-dasharray=\"{dash}\"" if dash else ""}/>')
def T(x,y,s,size=9.5,anchor='middle',c=INK,it=False,b=False):
    out.append(f'<text x="{x}" y="{y}" font-size="{size*1.13:.2f}" text-anchor="{anchor}" fill="{c}"{" font-style=\"italic\"" if it else ""}{" font-weight=\"700\"" if b else ""}>{s}</text>')
def R(x1,x2,y,c=INK,var=False):   # horizontal resistor
    n=6; w=(x2-x1); pts=[(x1,y)]
    for i in range(n): pts.append((x1+w*(i+0.5)/n, y+(-6 if i%2==0 else 6)))
    pts.append((x2,y)); L(*pts,c=c)
    if var: arrow(x1+4,y+12,x2-2,y-12,c)
def RV(x,y1,y2,c=INK,var=False):  # vertical resistor
    n=6; h=y2-y1; pts=[(x,y1)]
    for i in range(n): pts.append((x+(-6 if i%2==0 else 6), y1+h*(i+0.5)/n))
    pts.append((x,y2)); L(*pts,c=c)
    if var: arrow(x-13,y2-4,x+13,y1+2,c)
def arrow(x1,y1,x2,y2,c=INK):
    import math
    L((x1,y1),(x2,y2),c=c,w=1.1); a=math.atan2(y2-y1,x2-x1)
    p=[(x2,y2),(x2-7*math.cos(a-0.4),y2-7*math.sin(a-0.4)),(x2-7*math.cos(a+0.4),y2-7*math.sin(a+0.4))]
    out.append(f'<polygon points="{" ".join(f"{x},{y}" for x,y in p)}" fill="{c}"/>')
def C(x,y,label=None,gnd='',below=True):  # capacitor hanging from a node at (x,y) to an outside-pressure ground
    L((x,y),(x,y+26)); L((x-11,y+26),(x+11,y+26),w=2.2); L((x-11,y+33),(x+11,y+33),w=2.2); L((x,y+33),(x,y+50))
    for i,hw in enumerate((10,6,2.5)): L((x-hw,y+50+i*4),(x+hw,y+50+i*4),w=1.2)
    if gnd: T(x,y+72,gnd,7.5,c=SOFT,it=True)
def dot(x,y): out.append(f'<circle cx="{x}" cy="{y}" r="2.8" fill="{INK}"/>')
def bracket(x1,x2,y,label,c=RED):
    L((x1,y+6),(x1,y),(x2,y),(x2,y+6),c=c,w=1.1); T((x1+x2)/2,y-4,label,8.6,c=c,b=True)

Y=118; B=392
# heart: pump on the left limb
L((40,B),(40,262)); L((40,218),(40,Y),(95,Y))
out.append(f'<circle cx="40" cy="240" r="22" fill="#F3EAD7" stroke="{INK}" stroke-width="1.8"/>'); arrow(40,254,40,226)
T(70,236,'Heart',9.5,'start',b=True); T(70,248,'a pump whose output',7.8,'start',it=True); T(70,258,'rises with its filling',7.8,'start',it=True)
# arteries (Windkessel)
dot(95,Y); C(95,Y); T(88,Y-8,'arteries',8.4,'end')
L((95,Y),(118,Y)); R(118,172,Y); T(145,Y-25,'gut &amp; spleen',8.2); T(145,Y-15,'arterioles',8.2)
L((172,Y),(200,Y)); dot(200,Y); C(200,Y,gnd='')
L((200,Y),(222,Y)); R(222,262,Y); T(242,Y-25,'portal',8.2); T(242,Y-15,'vein',8.2)
L((262,Y),(352,Y)); dot(290,Y); C(290,Y); dot(312,Y); dot(332,Y)
# liver group shading
out.append(f'<rect x="346" y="{Y-40}" width="206" height="64" rx="8" fill="{RED}" fill-opacity="0.07" stroke="{RED}" stroke-opacity="0.35" stroke-width="0.8"/>')
T(449,Y+40,'LIVER',8.5,c=RED,b=True)
R(352,384,Y); T(368,Y-24,'pre-',7.8); T(368,Y-15,'sinusoidal',7.4)
L((384,Y),(405,Y)); dot(405,Y)
R(405,455,Y,var=True); T(430,Y-20,'sinusoidal',7.8)
L((455,Y),(480,Y)); dot(480,Y)
R(480,520,Y); T(500,Y-24,'post-',7.8); T(500,Y-15,'sinusoidal',7.4)
L((520,Y),(565,Y)); dot(565,Y); T(574,Y+18,'hepatic',8.2,'start'); T(574,Y+28,'veins',8.2,'start')
L((565,Y),(612,Y),(612,232)); RV(612,232,282); T(624,261,'IVC',8.2,'start')
L((612,282),(612,B)); dot(612,B); C(612,B-0,gnd='') if False else None
# right atrium node and return wire
L((612,B),(40,B)); T(570,B-8,'right atrium',8.2)
# capacitor for RA, hanging below
L((520,B),(520,B+22)); L((509,B+22),(531,B+22),w=2.2); L((509,B+29),(531,B+29),w=2.2); L((520,B+29),(520,B+40))
for i,hw in enumerate((10,6,2.5)): L((520-hw,B+40+i*4),(520+hw,B+40+i*4),w=1.2)
dot(520,B); T(540,B+31,'chest pressure',7.5,'start',c=SOFT,it=True)
# hepatic artery: from the arteries over the top into the sinusoids
L((95,Y),(95,30),(250,30)); R(250,300,30); L((300,30),(405,30),(405,Y)); T(275,18,'hepatic artery',8.2)
# collaterals and varices: portal vein to the systemic veins, opening as pressure rises
L((312,Y),(312,262)); RV(312,262,322,var=True); L((312,322),(312,B)); dot(312,B)
T(282,282,'collaterals',8.4,'end',b=True); T(282,293,'&amp; varices',8.4,'end',b=True); T(282,305,'open as portal',7.6,'end',it=True); T(282,315,'pressure rises',7.6,'end',it=True)
# TIPS: a switched low resistance from the portal vein to the hepatic veins
L((332,Y),(332,222),(410,222),c=RED); L((410,222),(436,210),c=RED,w=1.8); dot(410,222)
out.append(f'<circle cx="440" cy="222" r="2.6" fill="none" stroke="{RED}" stroke-width="1.4"/>')
L((442,222),(470,222),c=RED); R(470,505,222,c=RED); L((505,222),(565,222),(565,Y),c=RED)
T(455,245,'TIPS: a switch that',8.2,c=RED,b=True); T(455,256,'bypasses the liver',8.2,c=RED,b=True)
# measurements
bracket(290,612,Y-66,'')
T(345,Y-70,'PPG',8.6,c=RED,b=True)
bracket(405,565,Y-50,'')
T(485,Y-54,'HVPG',8.6,c=RED,b=True)
# outside-pressure note for the belly capacitors
T(245,Y+72,'belly pressure',7.5,c=SOFT,it=True); T(160,B-8,'systemic veins',8.2)
T(95,Y+72,'',7.5)
svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 450" font-family="Liberation Serif, FreeSerif, serif">'+''.join(out)+'</svg>'
import os
open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'circuit.svg'),'w').write(svg)
