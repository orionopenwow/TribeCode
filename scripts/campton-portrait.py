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
def armsprite(x0,x1,y0,y1):
    a=Image.new('RGBA',me.size,(0,0,0,0)); ap=a.load()
    for yy in range(y0,y1):
        for xx in range(x0,x1): ap[xx,yy]=mp[xx,yy]
    return a
LARM=armsprite(4,22,67,108); RARM=armsprite(54,67,67,108)
def rot(img,deg,piv):
    # RotSprite-style: scale up 8x, rotate with nearest neighbour around the pivot, scale back by sampling (keeps the pixel detail)
    k=8; big=img.resize((img.width*k,img.height*k),Image.NEAREST)
    big=big.rotate(deg,resample=Image.NEAREST,center=(piv[0]*k+k//2,piv[1]*k+k//2))
    out=Image.new('RGBA',img.size,(0,0,0,0)); op=out.load(); bp=big.load()
    for yy in range(img.height):
        for xx in range(img.width): op[xx,yy]=bp[xx*k+k//2,yy*k+k//2]
    return out
LROT=[rot(LARM,14+d,(14,67)) for d in (0,2)]; RROT=[rot(RARM,-14-d,(59,67)) for d in (0,2)]
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
    # the portrait's arms hang straight down; take them out below the shoulder and draw them reaching for the laptop
    lp=low.load()
    for yy in range(3,32):   # low starts at portrait row 64
        for xx in list(range(4,22))+list(range(54,67)): lp[xx,yy]=(0,0,0,0)
    c.alpha_composite(low,(21,64))
    # the arms, swung in toward the laptop; they take turns lifting a little (typing)
    la=LROT[1 if i%2==0 else 0]; ra=RROT[1 if i%2==1 else 0]
    c.alpha_composite(la.crop((0,64,70,110)),(21,64)); c.alpha_composite(ra.crop((0,64,70,110)),(21,64))
    c.alpha_composite(top,(21,bob))
    # forearms: shirt sleeves from the shoulders down to the laptop's sides (the hands reach behind the lid)
    def sleeve(pts):
        g.polygon(pts, fill=shirt+(255,), outline=dark+(255,))
    # desk
    g.rectangle((0,88,W-1,92),fill=(92,86,116,255)); g.line((0,88,W-1,88),fill=(122,116,146,255))
    g.rectangle((0,93,W-1,H-1),fill=(58,53,80,255)); g.line((0,93,W-1,93),fill=(38,34,54,255))
    g.rectangle((6,96,10,H-1),fill=(44,40,62,255)); g.rectangle((W-11,96,W-7,H-1),fill=(44,40,62,255))
    # laptop, seen from the back: a beveled lid with a tapered silhouette, a hinge, and the deck's front lip
    OUT=(58,62,74); BODY=(176,182,193); HI=(206,211,220); SH=(140,147,160); DEEP=(112,119,133)
    lx0,lx1,ly0,ly1=39,73,71,84
    for yy in range(ly0,ly1+1):
        t=(yy-ly0)/(ly1-ly0); inset=round((1-t)*2)   # a little narrower at the top: perspective
        a,b=lx0+inset,lx1-inset
        for xx in range(a,b+1):
            col=BODY
            if yy==ly0 or xx in (a,b): col=OUT
            elif yy==ly0+1 or xx==a+1: col=HI
            elif xx>=b-2 or yy>=ly1-1: col=SH
            c.putpixel((xx,yy),col+(255,))
    for xx in (lx0+1,lx1-1): c.putpixel((xx,ly0),(0,0,0,0)); c.putpixel((xx+(1 if xx<56 else -1),ly0),OUT+(255,))
    # the TribeCode flame on the lid; it breathes
    fl=["..X..",".XX..",".XXX.","XXYXX","XYYYX",".XXX."]
    lc=(56,198,177) if i%4<2 else (44,160,143); lc2=(150,235,222) if i%4<2 else (110,200,188)
    for j,row in enumerate(fl):
        for k,ch in enumerate(row):
            if ch!='.': c.putpixel((54+k,75+j),(lc if ch=='X' else lc2)+(255,))
    # hinge + deck lip (the keyboard deck pokes out under the lid, wider, catching the light)
    g.rectangle((35,85,77,85),fill=DEEP+(255,))
    g.rectangle((33,86,79,87),fill=HI+(255,)); g.line((33,87,79,87),fill=SH+(255,))
    g.line((32,86,32,87),fill=OUT+(255,)); g.line((80,86,80,87),fill=OUT+(255,)); g.line((33,88,79,88),fill=OUT+(255,))
    # a soft teal spill from the screen on his chin (two flat steps, no glow)
    for xx in range(46,60):
        if c.getpixel((xx,60))[3] and c.getpixel((xx,60))[0]>180: c.putpixel((xx,60),(min(255,c.getpixel((xx,60))[0]-20),c.getpixel((xx,60))[1]+6,c.getpixel((xx,60))[2]+14,255))
    # a few code characters floating up from the screen
    k=i%8
    for j,(dx,col) in enumerate(((96,(56,198,177)),(101,(242,107,29)),(106,(108,124,255)))):
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
