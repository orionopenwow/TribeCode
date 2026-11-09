# Builds site/assets/creator/campton-at-work.{gif,webp} from a cleaned-up pixel portrait (me-cut.png). Run: python3 scripts/campton-portrait.py <dir with me-cut.png> <out path without extension>
import sys
from PIL import Image, ImageDraw
SP=sys.argv[1]; OUT=sys.argv[2]
me=Image.open(f'{SP}/me-cut.png').convert('RGBA'); mp=me.load()
skin=mp[32,47][:3]; dark=(26,20,24)
# hand color from the portrait's hand (cut coords, rows ~100-108)
hand=None
for y in range(98,112):
    for x in range(2,20):
        p=mp[x,y]
        if p[3] and p[0]>200 and p[1]>140 and p[2]<170: hand=p[:3]; break
    if hand: break
hand=hand or (236,170,130); handsh=tuple(int(c*0.82) for c in hand)
shirt=mp[35,75][:3]; shirtd=tuple(int(c*0.75) for c in shirt)
W,H=112,104
# v3: the left arm is the portrait's own pixels, tilted in from the shoulder toward the laptop (RotSprite-style)
def armsprite(x0,x1,y0,y1):
    a=Image.new('RGBA',me.size,(0,0,0,0)); ap=a.load()
    for yy in range(y0,y1):
        for xx in range(x0,x1): ap[xx,yy]=mp[xx,yy]
    return a
def rot(img,deg,piv):
    k=8; big=img.resize((img.width*k,img.height*k),Image.NEAREST)
    big=big.rotate(deg,resample=Image.NEAREST,center=(piv[0]*k+k//2,piv[1]*k+k//2))
    out=Image.new('RGBA',img.size,(0,0,0,0)); op=out.load(); bp=big.load()
    for yy in range(img.height):
        for xx in range(img.width): op[xx,yy]=bp[xx*k+k//2,yy*k+k//2]
    return out
UPPER=armsprite(4,22,67,86); FORE=armsprite(4,22,80,96)
LROT=[rot(UPPER,a,(15,67)) for a in (20,22)]
# the forearm is the portrait's own lower sleeve, turned to reach the keyboard, its top moved to the elbow
def shifted(img,dx,dy): o=Image.new('RGBA',img.size,(0,0,0,0)); o.alpha_composite(img,(dx,dy)); return o
FROT=[shifted(rot(FORE,a,(13,80)),5,1) for a in (78,74)]
def blink(img):
    d=img.load()
    for (x0,x1) in ((28,39),(49,60)):
        for y in range(42,46):
            for x in range(x0,x1):
                if d[x,y][3]: d[x,y]=skin+(255,)
        for x in range(x0+2,x1-2): d[x,45]=dark+(255,)
    return img
def frame(i):
    c=Image.new('RGBA',(W,H),(0,0,0,0)); g=ImageDraw.Draw(c)
    # chair back
    g.rounded_rectangle((16,52,96,100),radius=10,fill=(47,93,168,255),outline=(24,46,90,255))
    g.rectangle((22,58,90,62),fill=(64,116,196,255))
    body=me.copy()
    if i==13: body=blink(body)
    bob=1 if i in (2,3,6,7) else 0
    # paste the body (lower part stays, head + torso bob by a pixel)
    top=body.crop((0,0,70,64)); low=body.crop((0,64,70,96))
    lp=low.load()
    for yy in range(3,32):
        for xx in range(4,22): lp[xx,yy]=(0,0,0,0)
    c.alpha_composite(low,(21,64))
    k2=1 if i%2==0 else 0
    al=Image.new('RGBA',(W,H),(0,0,0,0))
    al.alpha_composite(FROT[k2].crop((0,64,70,110)),(21,64-k2)); al.alpha_composite(LROT[k2].crop((0,64,70,110)),(21,64))
    # tidy the rotated arm on its own layer: fill pinholes in the outline, drop stray single pixels
    ap2=al.load()
    for _ in range(2):
        for yy in range(64,90):
            for xx in range(18,64):
                on=sum(1 for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)) if ap2[xx+dx,yy+dy][3]>0)
                if ap2[xx,yy][3]==0 and on>=3: ap2[xx,yy]=dark+(255,)
                elif ap2[xx,yy][3]>0 and on<=1: ap2[xx,yy]=(0,0,0,0)
    # the outer edge gets one clean dark outline where the arm meets the chair
    for yy in range(64,90):
        for xx in range(18,64):
            if ap2[xx,yy][3]==0 and any(ap2[xx+dx,yy][3]>0 for dx in (1,)) and ap2[xx+1,yy][:3]!=dark: ap2[xx,yy]=dark+(255,)
    c.alpha_composite(al)
    c.alpha_composite(top,(21,bob))
    # forearms: shirt sleeves from the shoulders down to the laptop's sides (the hands reach behind the lid)
    def sleeve(pts):
        g.polygon(pts, fill=shirt+(255,), outline=dark+(255,))
    sleeve([(78,72),(89,72),(109,81),(109,87),(104,87)])
    shl=tuple(min(255,int(v*1.45)+10) for v in shirt)
    g.line((41,73,60,81),fill=shl+(255,)); g.line((79,73,99,81),fill=shl+(255,))
    # hands (drawn before the lid so the fingers tuck behind its edges); they tap in turn
    def handpx(x0,y0,flip):
        # 8x6 pixel hand seen from the side-top: knuckles, three finger bumps, a shade line, a dark outline
        f=i%4
        rows=[".ooooooo..","oHHHHHHHo.","oHHHHHHHHo","oHHHHHHHHo",
              "oH"+("h" if f!=0 else "H")+"H"+("h" if f!=2 else "H")+"H"+("h" if f!=1 else "H")+"HHo",
              "oS"+("S" if f!=0 else "o")+"S"+("S" if f!=2 else "o")+"S"+("S" if f!=1 else "o")+"SSo",".oooooooo."]
        for j,row in enumerate(rows):
            for k,ch in enumerate(row):
                xx=x0+(len(row)-1-k if flip else k); yy=y0+j
                col={'o':dark,'H':hand,'h':handsh,'S':handsh}.get(ch)
                if col: c.putpixel((xx,yy),col+(255,))
        # cuff
        cx=x0+(10 if flip else -1)
        for yy in range(y0+1,y0+6): c.putpixel((cx,yy),shirtd+(255,))
    lu=1 if i%2==0 else 0; ru=1 if i%2==1 else 0
    handpx(57,79-lu,False); handpx(100,79-ru,True)
    # desk
    g.rectangle((0,88,W-1,92),fill=(92,86,116,255)); g.line((0,88,W-1,88),fill=(122,116,146,255))
    g.rectangle((0,93,W-1,H-1),fill=(58,53,80,255)); g.line((0,93,W-1,93),fill=(38,34,54,255))
    g.rectangle((6,96,10,H-1),fill=(44,40,62,255)); g.rectangle((W-11,96,W-7,H-1),fill=(44,40,62,255))
    # laptop, seen from the back: a beveled lid with a tapered silhouette, a hinge, and the deck's front lip
    OUT=(58,62,74); BODY=(176,182,193); HI=(206,211,220); SH=(140,147,160); DEEP=(112,119,133)
    lx0,lx1,ly0,ly1=65,103,63,84
    for yy in range(ly0,ly1+1):
        t=(yy-ly0)/(ly1-ly0); inset=round((1-t)*2)   # a little narrower at the top: perspective
        a,b=lx0+inset,lx1-inset
        for xx in range(a,b+1):
            col=BODY
            if yy==ly0 or xx in (a,b): col=OUT
            elif yy==ly0+1 or xx==a+1: col=HI
            elif xx>=b-2 or yy>=ly1-1: col=SH
            c.putpixel((xx,yy),col+(255,))
    for xx in (lx0+1,lx1-1): c.putpixel((xx,ly0),(0,0,0,0)); c.putpixel((xx+(1 if xx<84 else -1),ly0),OUT+(255,))
    # the TribeCode flame on the lid; it breathes
    fl=["..X..",".XX..",".XXX.","XXYXX","XYYYX",".XXX."]
    lc=(56,198,177) if i%4<2 else (44,160,143); lc2=(150,235,222) if i%4<2 else (110,200,188)
    for j,row in enumerate(fl):
        for k,ch in enumerate(row):
            if ch!='.': c.putpixel((82+k,70+j),(lc if ch=='X' else lc2)+(255,))
    # hinge + deck lip (the keyboard deck pokes out under the lid, wider, catching the light)
    g.rectangle((63,85,105,85),fill=DEEP+(255,))
    g.rectangle((61,86,107,87),fill=HI+(255,)); g.line((61,87,107,87),fill=SH+(255,))
    g.line((60,86,60,87),fill=OUT+(255,)); g.line((108,86,108,87),fill=OUT+(255,)); g.line((61,88,107,88),fill=OUT+(255,))
    # a soft teal spill from the screen on his chin (two flat steps, no glow)
    for xx in range(46,60):
        if c.getpixel((xx,60))[3] and c.getpixel((xx,60))[0]>180: c.putpixel((xx,60),(min(255,c.getpixel((xx,60))[0]-20),c.getpixel((xx,60))[1]+6,c.getpixel((xx,60))[2]+14,255))
    # a few code characters floating up from the screen
    k=i%8
    for j,(dx,col) in enumerate(((97,(56,198,177)),(103,(242,107,29)),(108,(108,124,255)))):
        yy=64-((k*3+j*7)%22)
        if 40<yy<64: g.rectangle((dx,yy,dx+1,yy+1),fill=col+(255,))
    return c
frames=[frame(i).resize((W*4,H*4),Image.NEAREST) for i in range(24)]
frames[0].save(f'{OUT}.png')
# GIF: 1-bit transparency (pixel art has no soft edges)
def togif(f):
    a=f.split()[3]; p=f.convert('RGB').quantize(colors=255,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
    mask=a.point(lambda v:255 if v<128 else 0); p.paste(255,mask); return p
g=[togif(f) for f in frames]
g[0].save(f'{OUT}.gif',save_all=True,append_images=g[1:],duration=[90 if k==13 else 160 for k in range(24)],loop=0,transparency=255,disposal=2)
frames[0].save(f'{OUT}.webp',save_all=True,append_images=frames[1:],duration=160,loop=0,lossless=True)
Image.new('RGBA',(W*4,H*4),(23,20,43,255)).save(f'{SP}/bgtmp.png')
bg=Image.open(f'{SP}/bgtmp.png'); bg.alpha_composite(frames[2]); bg.save(f'{SP}/me-preview.png')
