"""사진 한 장을 줄여서(가로 400px WebP) 여행 페이지에 넣고, 카드에 쓸 번호 I[K]를 알려 준다.

쓰는 법:  python3 .claude/skills/travel-page/addphoto.py istanbul 받은사진.jpg
  → __setImgs 배열 맨 끝에 사진을 넣고, I 배열 맨 끝에 "data:,N"을 붙인 뒤 "I[K]"를 출력한다.
  → 카드 연결(PHOTOS · photo · photos)과 photo-credits.md는 PHOTOS.md를 보고 직접 넣는다.
기존 사진 칸의 순서는 절대 바꾸지 않는다(바꾸면 다른 카드 사진이 뒤바뀐다).
"""
import base64, io, re, sys
from PIL import Image

if len(sys.argv) < 3:
    sys.exit(__doc__)
trip, src = sys.argv[1], sys.argv[2]
page = f"{trip}/index.html"

im = Image.open(src)
im = im.convert("RGB")
if im.width > 400:
    im = im.resize((400, round(im.height * 400 / im.width)), Image.LANCZOS)
buf = io.BytesIO()
quality = 75
im.save(buf, "WEBP", quality=quality)
while buf.tell() > 60_000 and quality > 40:  # 한 장에 60KB를 넘지 않게
    quality -= 10; buf = io.BytesIO(); im.save(buf, "WEBP", quality=quality)
uri = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()

t = open(page, encoding="utf-8").read()
k = t.rindex("__setImgs([")
end = t.index("])", k)
n = len(re.findall(r'"data:image/[^"]+"', t[k:end]))  # 새 사진의 자리 번호(0부터)
t = t[:end] + ',"' + uri + '"' + t[end:]
i = t.index("const I=[")
j = t.index("]", i)
slot = len(re.findall(r'"[^"]*"', t[i:j]))  # I 배열에서 새 칸 번호
t = t[:j] + f',"data:,{n}"' + t[j:]
open(page, "w", encoding="utf-8").write(t)
print(f"I[{slot}]   (사진 {im.width}x{im.height}, {buf.tell() // 1024}KB, WebP 품질 {quality}, 사진 자리 data:,{n})")
