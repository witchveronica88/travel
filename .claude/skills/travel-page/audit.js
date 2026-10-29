/* 일정을 고친 뒤 돌리는 점검: node .claude/skills/travel-page/audit.js istanbul
   1) 장소·맛집 카드의 일정 날짜 표시가 실제 일정 카드 연결과 같은지
   2) 일정 카드의 "시각 + 체류 = 다음 이동 시각", 이동 시각 ≤ 다음 도착 시각인지
   3) 카드와 카드 사이에 이동 글(`move`)이 있는지 — 없으면 카드끼리 붙어 보인다(첫 카드는 예외)
   4) 가로 스크롤이 없는지(360px) · 스크립트 오류가 없는지
   두 번째 인자로 날 id(예: d1028)를 주면 그날부터만 본다. 첫 카드(아침 자유시간)와 날짜가 넘어가는 칸은 건너뛴다(날 id를 주면 장소 날짜 대조는 생략).
   경고가 나오면 그 날을 처음부터 다시 읽고 고친다. 경고가 없어도 글 속 날짜·동행·준비물은 직접 읽어 본다. */
const { chromium } = require('playwright');
(async () => {
  const dir = process.argv[2] || 'istanbul', fromDay = process.argv[3] || '';
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 360, height: 780 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + process.cwd() + '/' + dir + '/index.html'); await page.waitForTimeout(500);
  const warn = await page.evaluate(fromDay => {
    const out = [], actual = {};
    const hm = t => { const m = String(t || '').match(/(\d{1,2}):(\d{2})/g); if (!m) return null; const x = m[m.length - 1].split(':'); return +x[0] * 60 + +x[1]; };
    const first = t => { const m = String(t || '').match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
    const stay = t => { t = String(t || ''); const h = (t.match(/(\d+)시간/) || [])[1], m = (t.match(/(\d+)분/) || [])[1]; return h || m ? +(h || 0) * 60 + +(m || 0) : null; };
    const f = x => String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0');
    DAYS.forEach(d => {
      if (fromDay && d.id < fromDay) return;
      const md = +d.id.slice(1, 3) + '/' + +d.id.slice(3, 5), st = d.blocks[0].i;
      st.forEach((s, i) => {
        new Set([...(s.rel || []), ...(s.placeId ? [s.placeId] : [])]).forEach(id => (actual[id] = actual[id] || new Set()).add(md));
        if (i > 0 && !s.move && !st[i - 1].afterMove) out.push(`${d.id} "${s.title}": 앞 카드와 사이에 이동 글이 없어 카드가 붙어 보임`);
        const n = st[i + 1]; if (!n) return;
        const t0 = first(s.time), sy = stay(s.stay), mv = hm(n.moveAt), t1 = first(n.time);
        if (i > 0 && !/~/.test(s.time) && t0 != null && sy != null && mv != null && Math.abs(t0 + sy - mv) > 20) out.push(`${d.id} "${s.title}": ${s.time} + 체류 ${sy}분 = ${f(t0 + sy)} 인데 다음 이동 시각은 ${f(mv)}`);
        if (mv != null && t1 != null && t1 < mv && mv - t1 < 240) out.push(`${d.id} "${n.title}": 도착 ${n.time}이 이동 시작 ${f(mv)}보다 빠름`);
      });
    });
    ENTRIES.filter(e => !fromDay && (e.tab === '장소' || e.tab === '맛집')).forEach(e => {
      const want = [...(actual[e.id] || [])].sort().join('·');
      const have = String(e.scheduleDates || '').split('·').map(x => x.trim().replace(/^0/, '').replace('/0', '/')).filter(Boolean).sort().join('·');
      if (want !== have) out.push(`${e.id} ${e.title}: 카드 날짜 [${have}] ≠ 일정 [${want}]`);
    });
    return out;
  }, fromDay);
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  warn.forEach(x => console.log('경고', x));
  if (w > 360) console.log('경고 가로 스크롤', w);
  if (errs.length) console.log('경고 스크립트 오류', errs.join(' | '));
  console.log(warn.length || errs.length || w > 360 ? '' : '점검 통과', `(경고 ${warn.length}개)`);
  await browser.close();
})();
