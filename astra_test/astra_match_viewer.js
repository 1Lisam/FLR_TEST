/* Read-only rendering of live observations or append-only recorded history. */
(function () {
  'use strict';
  const E = globalThis.AstraFootball;
  const $ = id => document.getElementById(id);
  const canvas = $('pitch'), ctx = canvas.getContext('2d');
  const SCALE = 10.4, OX = 54, OY = 54;
  const BASE_SPEED = 4; // 1323 causal seconds / 4 = 5m31s at test 1x.
  let match = E.createMatch($('seed').value);
  let accumulator = 0, lastWall = null, uiWall = -Infinity;
  let replay = null, selected = null, eventCount = -1, filterValue = true;
  const clock = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const mix = (a, b, t) => a + (b - a) * t;
  function displayFrame(a, b, alpha) {
    if (a.half !== b.half || (a.phase !== b.phase && b.phase === 'restart')) return b;
    return { ...b, clock: mix(a.clock, b.clock, alpha), time: mix(a.time, b.time, alpha),
      players: b.players.map((v, i) => i % 3 === 2 ? v : mix(a.players[i], v, alpha)),
      ball: b.ball.map((v, i) => mix(a.ball[i], v, alpha)) };
  }
  function pitch() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#12382b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 10; i++) { ctx.fillStyle = i % 2 ? '#286649' : '#2c6e4e'; ctx.fillRect(OX + i * 10.5 * SCALE, OY, 10.5 * SCALE, 68 * SCALE); }
    ctx.strokeStyle = '#d5e7d1'; ctx.lineWidth = 1.8;
    const rect = (x, y, w, h) => ctx.strokeRect(OX + x * SCALE, OY + y * SCALE, w * SCALE, h * SCALE);
    rect(0, 0, 105, 68); rect(0, 13.84, 16.5, 40.32); rect(88.5, 13.84, 16.5, 40.32);
    rect(0, 24.84, 5.5, 18.32); rect(99.5, 24.84, 5.5, 18.32);
    ctx.beginPath(); ctx.moveTo(OX + 52.5 * SCALE, OY); ctx.lineTo(OX + 52.5 * SCALE, OY + 68 * SCALE); ctx.stroke();
    ctx.beginPath(); ctx.arc(OX + 52.5 * SCALE, OY + 34 * SCALE, 9.15 * SCALE, 0, Math.PI * 2); ctx.stroke();
    for (const x of [11, 52.5, 94]) { ctx.beginPath(); ctx.arc(OX + x * SCALE, OY + 34 * SCALE, 2.8, 0, Math.PI * 2); ctx.fillStyle = '#e0ecdc'; ctx.fill(); }
    ctx.beginPath(); ctx.arc(OX + 11 * SCALE, OY + 34 * SCALE, 9.15 * SCALE, -0.925, 0.925); ctx.stroke();
    ctx.beginPath(); ctx.arc(OX + 94 * SCALE, OY + 34 * SCALE, 9.15 * SCALE, Math.PI - 0.925, Math.PI + 0.925); ctx.stroke();
    for (const x of [-2.3, 105]) {
      ctx.fillStyle = '#acc7b633'; ctx.fillRect(OX + x * SCALE, OY + 30.34 * SCALE, 2.3 * SCALE, 7.32 * SCALE);
      rect(x, 30.34, 2.3, 7.32);
    }
    ctx.fillStyle = '#afccb8'; ctx.font = '12px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('ASTRA · INDEPENDENT FOOTBALL', canvas.width / 2, 29);
  }
  function draw(frame) {
    pitch();
    for (let i = 0; i < 22; i++) {
      const x = OX + frame.players[i * 3] * SCALE, y = OY + frame.players[i * 3 + 1] * SCALE;
      const red = i < 11, role = E.ROLES[i % 11], radius = 14;
      ctx.fillStyle = '#071c2370'; ctx.beginPath(); ctx.ellipse(x + 2, y + 5, radius, radius * 0.75, 0, 0, Math.PI * 2); ctx.fill();
      if (selected === i) { ctx.strokeStyle = '#ffe085'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, radius + 5, 0, Math.PI * 2); ctx.stroke(); }
      const gradient = ctx.createRadialGradient(x - 5, y - 6, 1, x, y, radius);
      gradient.addColorStop(0, red ? '#ff9e93' : '#93d4ff'); gradient.addColorStop(0.36, red ? '#e84949' : '#2f8bd3'); gradient.addColorStop(1, red ? '#8f1728' : '#123e87');
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = role === 'GK' ? '#ffdc7d' : '#ffffffbb'; ctx.lineWidth = role === 'GK' ? 2.5 : 1.2; ctx.stroke();
      ctx.font = `bold ${role.length === 3 ? 9 : 10}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#071c23'; ctx.fillText(role, x + 0.7, y + 0.7); ctx.fillStyle = '#fff'; ctx.fillText(role, x, y);
    }
    const bx = OX + frame.ball[0] * SCALE, by = OY + frame.ball[1] * SCALE;
    const lift = Math.min(20, frame.ball[2] * 5);
    ctx.fillStyle = '#071c2380'; ctx.beginPath(); ctx.ellipse(bx + 2, by + 2, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffe87d'; ctx.lineWidth = 2; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(bx, by - lift, 6.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1c2931'; ctx.beginPath(); ctx.arc(bx, by - lift, 2.6, 0, Math.PI * 2); ctx.fill();
    if (replay) {
      ctx.fillStyle = '#122a2ce8'; ctx.fillRect(OX + 12, OY + 12, 255, 36);
      ctx.fillStyle = '#ffe095'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'left'; ctx.fillText('↶ REPLAY · ACTUAL HISTORY', OX + 24, OY + 30);
    }
    ctx.textBaseline = 'alphabetic';
    $('score').textContent = `${frame.score[0]} : ${frame.score[1]}`;
    $('clock').textContent = clock(frame.clock);
    $('half').textContent = frame.phase === 'full-time' ? '경기 종료' : frame.phase === 'half-time' ? '하프타임 · 진영 교대' : frame.half === 1 ? '전반' : '후반';
    $('possession').textContent = frame.possession === null ? (frame.phase === 'restart' ? '재시작 준비' : '경합 / 루즈볼') : `${frame.possession === 0 ? 'RED' : 'BLUE'} 점유`;
    if (selected !== null) $('selection').textContent = `${selected < 11 ? 'RED' : 'BLUE'} ${E.ROLES[selected % 11]} · ${E.DUTIES[frame.players[selected * 3 + 2]]} · ${replay ? '기록된 역할' : '현재 역할'}`;
  }
  function updateUI() {
    const s = match.inspect();
    $('pause').textContent = match.paused ? '계속' : '일시정지';
    $('pause').disabled = !!replay || match.finished;
    $('step').disabled = !!replay || !match.paused || match.finished;
    $('seedDisplay').textContent = `Seed: ${s.seed}${replay ? ' · REPLAY' : match.paused ? ' · PAUSED' : ' · LIVE'}`;
    const events = match.eventsSince();
    const latest = events[events.length - 1];
    $('action').textContent = replay ? `↶ ${clock(replay.clip.event.clock)} ${replay.clip.event.text}` : latest ? latest.text : '킥오프 대기';
    const total = s.stats[0].possessionTicks + s.stats[1].possessionTicks;
    const rows = [
      ['슈팅', 'shots'], ['유효 슈팅', 'shotsOnTarget'], ['골', 'goals'], ['세이브', 'saves'], ['클레임', 'claims'],
      ['패스 / 성공', a => `${a.passes} / ${a.completedPasses}`], ['도전 / 태클 시도', 'challenges'], ['수비 승리', 'defenderWins'],
      ['공격 유지', 'retained'], ['태클 후 루즈볼', 'looseOutcomes'], ['파울', 'fouls'], ['코너킥', 'corners'],
      ['스로인 / 골킥', a => `${a.throwIns} / ${a.goalKicks}`], ['점유 (컨트롤 틱)', a => `${total ? Math.round(a.possessionTicks / total * 100) : 50}%`]
    ];
    const tbody = $('stats').querySelector('tbody'); tbody.replaceChildren();
    for (const [label, value] of rows) {
      const row = document.createElement('tr');
      for (const text of [label, ...s.stats.map(a => typeof value === 'function' ? value(a) : a[value])]) {
        const cell = document.createElement('td'); cell.textContent = String(text); row.appendChild(cell);
      }
      tbody.appendChild(row);
    }
    if (eventCount !== events.length || filterValue !== $('notableOnly').checked) {
      eventCount = events.length; filterValue = $('notableOnly').checked;
      const list = $('events'); list.replaceChildren();
      for (const e of events.filter(e => !filterValue || e.notable || ['kickoff', 'halfTime', 'fullTime'].includes(e.type)).slice(-120).reverse()) {
        const li = document.createElement('li'), time = document.createElement('time'), text = document.createElement('span');
        time.textContent = clock(e.clock); text.textContent = e.text;
        if (e.team !== null) text.className = e.team === 0 ? 'red' : 'blue';
        li.append(time, text);
        if (e.notable) { const button = document.createElement('button'); button.textContent = '↶'; button.title = '이전 상황 다시 보기'; button.setAttribute('aria-label', `${clock(e.clock)} ${e.text} 다시 보기`); button.addEventListener('click', () => beginReplay(e.id)); li.appendChild(button); }
        list.appendChild(li);
      }
    }
    $('replayRecent').disabled = !events.some(e => e.notable);
    if ($('diagnostics').open) {
      const d = s.diagnostics, sample = Math.max(1, d.shapeSamples);
      $('diagnosticData').textContent = [
        `틱 ${s.tick} · RNG ${s.rng.state} / ${s.rng.draws} draws · history ${s.historyLength} frames`,
        `평균 팀 너비 ${d.widths.map(v => (v / sample).toFixed(1)).join(' / ')} m · 깊이 ${d.depths.map(v => (v / sample).toFixed(1)).join(' / ')} m`,
        `접촉 도전 ${d.contacts} · 마크 좌표 일치 ${d.markingGlueTicks}/${d.markingSamples} · 압박 담당 변경 ${d.handoffs}`,
        `측면 위협 포기 ${d.wideAbandonmentTicks}/${d.wideThreatSamples} · 집단 추격 ${d.massChaseTicks} · 공 상태 충돌 ${d.ballTruthConflicts}`,
        `필드 선수 최대 연속 정지 ${Math.max(...d.maxStationarySeconds.filter((_, i) => i % 11 !== 0)).toFixed(1)} s · 최소 이동 ${Math.min(...d.playerDistance.filter((_, i) => i % 11 !== 0)).toFixed(0)} m`
      ].join(' | ');
    }
  }
  function beginReplay(id) {
    const clip = match.replay(id, 10, 2);
    if (!clip || clip.frames.length < 2) return;
    // Gate the VIEWER scheduler. Do not even change the live state's paused flag.
    replay = { clip, time: clip.frames[0].time };
    accumulator = 0;
    $('returnLive').hidden = false; $('replayLabel').hidden = false;
    $('replayStatus').textContent = `${(clip.event.time - clip.frames[0].time).toFixed(1)}초 이전 실제 기록 · 1초/초 재생`;
    updateUI();
  }
  function returnLive() {
    replay = null; accumulator = 0;
    $('returnLive').hidden = true; $('replayLabel').hidden = true;
    $('replayStatus').textContent = '실제 과거 10초 + 가능한 후속 2초';
    updateUI();
  }
  function animate(now) {
    const elapsed = lastWall === null ? 0 : Math.min(0.1, (now - lastWall) / 1000); lastWall = now;
    let frame;
    if (replay) {
      replay.time += elapsed;
      const frames = replay.clip.frames, last = frames[frames.length - 1];
      if (replay.time > last.time + 0.6) { returnLive(); frame = match.frame; }
      else {
        const i = Math.min(frames.length - 2, Math.max(0, Math.floor((replay.time - frames[0].time) / E.DT)));
        const a = frames[i], b = frames[i + 1];
        frame = displayFrame(a, b, Math.max(0, Math.min(1, (replay.time - a.time) / E.DT)));
        $('replayScrub').value = String(Math.min(1000, (replay.time - frames[0].time) / Math.max(E.DT, last.time - frames[0].time) * 1000));
      }
    } else {
      if (!match.paused) {
        accumulator += elapsed * BASE_SPEED * Number($('speed').value);
        let steps = 0;
        while (accumulator >= E.DT && steps++ < 80 && !match.finished) { match.advance(); accumulator -= E.DT; }
        if (match.finished) accumulator = 0;
      }
      frame = match.paused ? match.frame : displayFrame(match.previousFrame, match.frame, Math.min(1, accumulator / E.DT));
    }
    draw(frame);
    if (now - uiWall > 200) { updateUI(); uiWall = now; }
    requestAnimationFrame(animate);
  }
  $('start').addEventListener('click', () => {
    const seed = $('seed').value.trim() || 'astra-659'; $('seed').value = seed;
    match = E.createMatch(seed); match.resume(); selected = null; eventCount = -1; returnLive();
  });
  $('seed').addEventListener('keydown', e => { if (e.key === 'Enter') $('start').click(); });
  $('pause').addEventListener('click', () => { if (replay) return; if (match.paused) match.resume(); else match.pause(); accumulator = 0; updateUI(); });
  $('step').addEventListener('click', () => { if (!replay) { match.step(); accumulator = 0; updateUI(); draw(match.frame); } });
  $('returnLive').addEventListener('click', returnLive);
  $('replayRecent').addEventListener('click', () => { const e = match.eventsSince().filter(e => e.notable).pop(); if (e) beginReplay(e.id); });
  $('replayScrub').addEventListener('input', () => { if (replay) { const f = replay.clip.frames; replay.time = f[0].time + Number($('replayScrub').value) / 1000 * (f[f.length - 1].time - f[0].time); } });
  $('notableOnly').addEventListener('change', updateUI);
  $('diagnostics').addEventListener('toggle', updateUI);
  canvas.addEventListener('click', e => {
    const box = canvas.getBoundingClientRect(), x = ((e.clientX - box.left) * canvas.width / box.width - OX) / SCALE;
    const y = ((e.clientY - box.top) * canvas.height / box.height - OY) / SCALE;
    const f = replay ? replay.clip.frames[Math.min(replay.clip.frames.length - 1, Math.max(0, Math.floor((replay.time - replay.clip.frames[0].time) / E.DT)))] : match.frame;
    let best = 3; selected = null;
    for (let i = 0; i < 22; i++) { const d = Math.hypot(x - f.players[i * 3], y - f.players[i * 3 + 1]); if (d < best) { selected = i; best = d; } }
  });
  document.addEventListener('keydown', e => {
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(document.activeElement.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); $('pause').click(); }
    if (e.code === 'ArrowRight' && match.paused && !replay) { e.preventDefault(); $('step').click(); }
  });
  // Observational test seam: returns copies, never exposes the engine instance/state writer.
  globalThis.AstraViewer = Object.freeze({ inspect: () => match.inspect(), events: () => match.eventsSince(),
    get replaying() { return !!replay; }, version: E.VERSION });
  updateUI(); draw(match.frame); requestAnimationFrame(animate);
})();
