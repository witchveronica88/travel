/* 일정을 고친 뒤 돌리는 점검: node .claude/skills/travel-page/audit.js istanbul
   1) 장소·맛집 카드의 일정 날짜 표시가 실제 일정 카드 연결과 같은지
   2) 일정 카드의 "시각 + 체류 = 다음 이동 시각", 이동 시각 ≤ 다음 도착 시각인지
   3) 카드와 카드 사이에 이동 글(`move`)이 있는지 — 없으면 카드끼리 붙어 보인다(첫 카드는 예외)
   4) 이동 글에 노선·번호·환승·정류장·거리·오르막 같은 세부가 없는지, `route`(가는 길) 줄이 없는지 — 형식은 `대중교통 약 N분 · 택시 약 N분`뿐
   5) 카드 설명(`key`)이 두 문장 이상인데 문자열로 이어 써 있지 않은지 — 불렛(배열)으로 쓴다
   6) 카드 설명(`key`)이 불렛 5개를 넘지 않는지 — 핵심만 쓰고 자세한 내용은 연결한 장소 카드로
   7) 날짜가 월.일인지(11/4 ✗) · key에 A. B. 기호가 없는지 · 이동 글에 주소가 없는지
   8) 장소·맛집·음식 카드 서식: `머무는 시간`·`영업 상태` 줄 금지, 주소는 현지어(한글 없이), 장소 탭은 `운영`·맛집 탭은 `영업시간` 라벨, 일정 카드가 가리키는 id가 실제로 있는지, 같은 id가 겹치지 않는지, 맛집 카드에 동네(region)가 있는지. 맛집 카드에 주소·영업시간이 비어 있으면 '채울 것'으로 따로 보여 준다(경고 수에는 넣지 않는다)
   9) 가로 스크롤이 없는지(360px) · 스크립트 오류가 없는지
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
        if (typeof s.key === 'string' && s.key.split(/(?<=[가-힣)\]])\.\s+/).length >= 2) out.push(`${d.id} "${s.title}": key가 여러 문장 문단임 → 불렛(배열)로 나눈다`);
        if (Array.isArray(s.key) && s.key.length > 5) out.push(`${d.id} "${s.title}": key 불렛이 ${s.key.length}개 — 핵심만 남기고 나머지는 장소 카드로`);
        [s.title, s.move, ...[].concat(s.key || [])].forEach(x => { if (/(^|[^0-9.])\d{1,2}\/\d{1,2}([^0-9]|$)/.test(x || '')) out.push(`${d.id} "${s.title}": 날짜는 11.4처럼 월.일로 쓴다 → ${x}`); });
        [].concat(s.key || []).forEach(x => { if (/^[A-C]\.\s/.test(x)) out.push(`${d.id} "${s.title}": A. B. 같은 기호 대신 말로 나눠 쓴다 → ${x}`); });
        if (/\b(Sok|Sk|Cd|Cad|Mah)\.|No:/.test(s.move || '')) out.push(`${d.id} "${s.title}": 이동 글에 주소가 있음 → ${s.move}`);
        if (s.route) out.push(`${d.id} "${s.title}": route(가는 길) 줄은 쓰지 않는다`);
        if (/→|정류장|\d\s?km|\d\s?m(?![a-z가-힣])|환승|오르막|내리막|가파른|푸니쿨라|트램|케이블카|\b[MTF]\d\b|\d+\s?번 버스/.test(s.move || '')) out.push(`${d.id} "${s.title}": 이동 글에 노선·거리 같은 세부가 있음 → ${s.move}`);
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
  const fmt = fromDay ? { warn: [], todo: [] } : await page.evaluate(() => {
    const warn = [], todo = [], seen = {};
    ENTRIES.forEach(e => {
      if (seen[e.id]) warn.push(`${e.id}: id가 겹친다`); seen[e.id] = 1;
      const info = (e.blocks.find(b => b.h === '정보') || {}).i || [], L = info.map(x => x[0]);
      if (e.tab === '장소' || e.tab === '맛집') {
        L.filter(l => /머무는 시간|영업 상태/.test(l)).forEach(l => warn.push(`${e.id} ${e.title}: 정보 칸에 '${l}' 줄을 두지 않는다`));
        info.filter(([l, v]) => l === '주소' && /[가-힣]/.test(v)).forEach(([l, v]) => warn.push(`${e.id} ${e.title}: 주소는 현지어로만 쓴다 → ${v}`));
        if (e.tab === '장소' && L.includes('영업시간')) warn.push(`${e.id} ${e.title}: 장소 탭은 '영업시간'이 아니라 '운영' 라벨을 쓴다`);
        if (e.tab === '맛집' && L.includes('운영')) warn.push(`${e.id} ${e.title}: 맛집 탭은 '운영'이 아니라 '영업시간' 라벨을 쓴다`);
      }
      if (e.restaurant) {
        if (!e.sub) warn.push(`${e.id} ${e.title}: 동네(region)가 비어 있다`);
        const miss = ['주소', '영업시간'].filter(l => !L.includes(l));
        if (miss.length) todo.push(`${e.id} ${e.title}: ${miss.join('·')} 없음`);
      }
      if (!e.map && (e.tab === '장소' || e.tab === '맛집')) todo.push(`${e.id} ${e.title}: 지도 아이콘 없음(확인된 지도 주소를 넣는다)`);
    });
    DAYS.forEach(d => d.blocks[0].i.forEach(s => [...(s.rel || []), ...(s.placeId ? [s.placeId] : [])].forEach(id => { if (!BY[id]) warn.push(`${d.id} "${s.title}": 연결한 id가 없다 → ${id}`); })));
    return { warn, todo };
  });
  warn.push(...fmt.warn);
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  warn.forEach(x => console.log('경고', x));
  if (w > 360) console.log('경고 가로 스크롤', w);
  if (errs.length) console.log('경고 스크립트 오류', errs.join(' | '));
  console.log(warn.length || errs.length || w > 360 ? '' : '점검 통과', `(경고 ${warn.length}개)`);
  if (fmt.todo.length) { console.log(`채울 것 ${fmt.todo.length}곳 (지도가 열리는 환경에서 확인해 넣는다):`); fmt.todo.forEach(x => console.log('  -', x)); }
  await browser.close();
})();
