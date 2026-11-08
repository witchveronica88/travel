/* 사진이 없는 카드를 찾는다. 사진 넣는 방법은 같은 폴더의 PHOTOS.md.
   쓰는 법: NODE_PATH=/opt/node-tools/node_modules node .claude/skills/travel-page/photos.js istanbul (또는 haenam)
   나오는 것: ① 사진이 하나도 안 뜨는 일정 카드 ② 사진 칸이 없는 장소·맛집·음식 카드 ③ 이미 있는 사진 목록(다시 쓸 수 있다) */
const { chromium } = require('playwright');
const trip = process.argv[2] || 'istanbul';
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 360, height: 780 } })).newPage();
  await page.goto('file://' + require('path').resolve(__dirname, '../../..', trip, 'index.html'));
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    if (!(DAYS[0] && DAYS[0].blocks)) {
      /* 해남 모양: 일정 카드·＋ 줄 카드 모두 img:"iNN" 칸 하나로 사진을 단다 */
      const stops = [], relIds = [];
      Object.values(BY).filter(d => d.stops).forEach(d => d.stops.forEach(s => {
        (s.rel || []).forEach(id => { if (!relIds.includes(id)) relIds.push(id); });
        if (!s.img && !s.noPhoto) stops.push(`${d.id} ${s.time} "${s.title}"${s.rel && s.rel.length ? ' (＋ 줄 ' + s.rel.join(', ') + ')' : ''}`);
      }));
      const cards = relIds.filter(id => BY[id] && !BY[id].img && ['장소', '맛집'].includes(BY[id].tab)).map(id => `${BY[id].tab} ${id} "${BY[id].title}"${BY[id].sub ? ' · ' + BY[id].sub : ''}`);
      const used = Object.values(BY).filter(e => e.img && e.title).map(e => `${e.id} "${e.title}" → img:"${e.img}"`);
      return { stops, cards, used, haenam: true };
    }
    const has = e => e && e.blocks && e.blocks.some(b => b.t === 'photo');
    const stops = [];
    DAYS.forEach(d => d.blocks[0].i.forEach(s => {
      if (s.noPhoto || (s.photos && s.photos.length)) return;
      const ids = (s.rel || []).filter(id => BY[id]);
      const ownId = s.q && s.placeId && BY[s.placeId] ? s.placeId : (s.q ? ids.find(id => LOCAL[id] === s.q) : null);
      const ok = ownId ? has(BY[ownId]) : ids.some(id => has(BY[id]));
      if (!ok) stops.push(`${d.id} ${s.time} "${s.title}"${s.placeId ? ` (placeId ${s.placeId})` : ''}`);
    }));
    const cards = ENTRIES.filter(e => ['장소', '맛집', '음식'].includes(e.tab) && !has(e)).map(e => `${e.tab} ${e.id} "${e.title}"${e.sub ? ' · ' + e.sub : ''}`);
    const used = ENTRIES.filter(has).map(e => { const b = e.blocks.find(x => x.t === 'photo'); return `${e.id} "${e.title}" → ${b.src}`; });
    return { stops, cards, used };
  });
  console.log(r.haenam ? `사진이 없는 일정 카드 ${r.stops.length}개 (일정 카드에 img:"iNN"을 넣는다. ＋ 줄 카드와 같은 사진 번호를 써도 된다):` : `사진이 안 뜨는 일정 카드 ${r.stops.length}개 (카드에 photos를 넣거나, ＋ 줄로 붙은 장소에 사진을 넣으면 그 사진이 뜬다):`);
  r.stops.forEach(x => console.log('  -', x));
  console.log(`\n사진 칸이 없는 장소·맛집·음식 카드 ${r.cards.length}개:`);
  r.cards.forEach(x => console.log('  -', x));
  if (process.argv.includes('--used')) { console.log(`\n이미 쓰는 사진 ${r.used.length}개:`); r.used.forEach(x => console.log('  -', x)); }
  await browser.close();
})();
