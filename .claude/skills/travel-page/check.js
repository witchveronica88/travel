/* 어느 여행 페이지든 기본 규칙을 점검한다(이스탄불은 audit.js가 더 자세하다).
   쓰는 법: NODE_PATH=/opt/node-tools/node_modules node .claude/skills/travel-page/check.js haenam
   보는 것: 글자 토큰·20px 상한, 100dvh·scrollTo 꼼수, 360·800·1280px 가로 스크롤, 다크 모드, 스크립트 오류,
   일정 카드(제목 모양·불렛 설명·지도·이동 글 모양·첫 카드 이동 글·시각 사슬), 아이콘 순서(지도 맨 오른쪽), 날짜의 '/' */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const trip = process.argv[2] || 'haenam';
const file = path.resolve(__dirname, '../../..', trip, 'index.html');
(async () => {
  const src = fs.readFileSync(file, 'utf8');
  const css = (src.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
  const warn = [], note = [];
  const raw = [...css.matchAll(/font-size:\s*([^;}]+)/g)].map(m => m[1].trim()).filter(v => !/^var\(--fs-(xl|l|m|s)\)$/.test(v) && v !== 'inherit');
  if (raw.length) warn.push('font-size에 토큰이 아닌 값: ' + [...new Set(raw)].join(', '));
  const toks = [...css.matchAll(/--fs-(xl|l|m|s)\s*:\s*(\d+)px/g)];
  toks.forEach(m => { if (+m[2] > 20) warn.push(`글자 토큰 --fs-${m[1]} ${m[2]}px (20px 넘음)`); });
  if (/100dvh/.test(src)) warn.push('100dvh를 쓴다');
  if (/scrollTo\(0,\s*1\)/.test(src)) warn.push('scrollTo(0,1) 꼼수를 쓴다');
  if (/overscroll-behavior:\s*none/.test(css)) warn.push('overscroll-behavior:none을 쓴다');
  const b = await chromium.launch();
  for (const [w, scheme] of [[360, 'light'], [800, 'light'], [1280, 'light'], [360, 'dark']]) {
    const p = await (await b.newContext({ viewport: { width: w, height: 800 }, colorScheme: scheme })).newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('file://' + file); await p.waitForTimeout(900);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    if (sw > w) warn.push(`${w}px ${scheme}: 가로 스크롤 ${sw}px`);
    if (errs.length) warn.push(`${w}px ${scheme}: 스크립트 오류 ${errs.join(' | ')}`);
    if (w !== 360 || scheme !== 'light') continue;
    const r = await p.evaluate(() => {
      const o = [];
      const days = (typeof DAYS !== 'undefined' && DAYS[0] && DAYS[0].blocks) ? DAYS.map(d => ({ id: d.id, stops: d.blocks[0].i })) : Object.values(BY).filter(d => d.stops).map(d => ({ id: d.id, stops: d.stops }));
      const toMin = s => { const m = String(s).match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
      const dur = s => { const h = (String(s).match(/(\d+)\s*시간/) || [0, 0])[1], m = (String(s).match(/(\d+)\s*분/) || [0, 0])[1]; return +h * 60 + +m; };
      /* '대중교통 약 30~50분', '약 1시간~1시간 30분' → [최소, 최대]분. 단위가 없는 쪽은 다른 쪽 단위를 따른다 */
      const range = s => { const seg = String(s).split(' · ')[0]; const sides = seg.split('~'); if (sides.length < 2) { const v = dur(seg); return [v, v]; }
        const unit = /시간\s*$/.test(sides[1].trim()) && !/분/.test(sides[1]) ? '시간' : '분'; const fix = x => /시간|분/.test(x) ? x : x.replace(/(\d+)\s*$/, '$1' + unit);
        return [dur(fix(sides[0])), dur(sides.slice(1).join('~'))]; };
      const wrap = x => ((x % 1440) + 2160) % 1440 - 720;
      days.forEach(d => d.stops.forEach((st, i) => {
        const tag = `${d.id} ${st.time} "${st.title}"`;
        if (/[:(]|선택|예정/.test(st.title)) o.push('제목은 하는 일·장소 이름만(콜론·괄호·선택·예정 없이): ' + tag);
        if (/^호텔 (조식|아침)$/.test(st.title)) o.push('호텔 조식 카드는 두지 않는다: ' + tag);
        if (!st.key || !String(st.key).trim()) o.push('설명(key) 없음: ' + tag);
        else if (!Array.isArray(st.key)) o.push('설명은 불렛 배열로: ' + tag);
        [].concat(st.key || []).forEach(k => { if ((String(k).match(/다\. (?!대중교통|택시|도보|차로)/g) || []).length) o.push('한 불렛에 문장이 여럿: ' + tag + ' → ' + String(k).slice(0, 30)); if (/(하기|함|음)\.$/.test(String(k).trim())) o.push('메모체(~하기·~함) 대신 ~한다·~이다: ' + tag + ' → ' + String(k).slice(-20)); });
        if (!st.q && !st.map && !st.n) o.push('지도 없음: ' + tag);
        if (i === 0 && st.move) o.push('첫 카드 위에는 이동 글을 두지 않는다: ' + tag);
        if (st.move && !/^(\d{1,2}:\d{2} 출발 · )?((대중교통|택시|도보|차로|KTX|SRT|열차|배|페리|비행기|버스|공항버스|공항리무진|지하철|트램|셔틀|케이블카|도보·모노레일) 약 [\d~시간분 ]+( · )?)+$/.test(st.move.trim()) && !st.moveOnly) o.push('이동 글은 수단과 시간만(예: 09:50 출발 · 차로 약 50분): ' + tag + ' → ' + st.move);
        if (i > 0 && st.move && !/\d{1,2}\.\d{1,2}\s+\d/.test(String(st.moveAt || '')) && !/비행기/.test(st.move)) {
          const prev = d.stops[i - 1]; const dep = st.moveAt ? toMin(st.moveAt) : toMin(st.move);
          if (dep != null && prev.stay && toMin(prev.time) != null) { const tt = String(prev.time).match(/\d{1,2}:\d{2}/g) || []; const s0 = toMin(tt[0]) + dur(prev.stay), s1 = (tt[1] ? toMin(tt[1]) : toMin(tt[0])) + dur(prev.stay); if (wrap(dep - s0) < -5 || wrap(dep - s1) > 5) o.push(`시각 사슬: ${tag} 출발 ${Math.floor(dep / 60)}:${String(dep % 60).padStart(2, '0')} ≠ 앞 카드 끝 ${Math.floor(s0 / 60)}:${String(s0 % 60).padStart(2, '0')}`); }
          const tm = String(st.move).replace(/^\d{1,2}:\d{2} 출발 · /, '').split(' · ')[0];
          if (dep != null && toMin(st.time) != null) { const [lo, hi] = range(tm); const t0 = toMin(st.time); if (wrap(t0 - (dep + lo)) < -10 || wrap(t0 - (dep + hi)) > 10) { const arr = dep + lo; o.push(`시각 사슬: ${tag} 도착 계산 ${Math.floor(arr / 60)}:${String(arr % 60).padStart(2, '0')}`); } }
        }
      }));
      document.querySelectorAll('.stop-actions,.act-row').forEach(a => { const l = [...a.querySelectorAll('a,button')].map(x => x.getAttribute('aria-label') || x.textContent.trim()); if (l.length && !/지도|카카오맵|구글/.test(l[l.length - 1])) o.push('지도 아이콘이 맨 오른쪽이 아니다: ' + l.join(' → ')); });
      const bad = document.body.innerText.match(/(^|[^\d/])(1[0-2]|[1-9])\/([12]?\d|3[01])(?![\d/])/g); if (bad) o.push('날짜는 11.7처럼(/ 아님): ' + [...new Set(bad.map(x => x.trim()))].slice(0, 5).join(', '));
      return o;
    });
    note.push(...r);
  }
  await b.close();
  [...warn, ...note].forEach(x => console.log('경고', x));
  console.log(warn.length + note.length ? `(경고 ${warn.length + note.length}개)` : '점검 통과 (경고 0개)');
})();
