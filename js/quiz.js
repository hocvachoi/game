// Đọc file Excel mẫu và hiển thị câu hỏi (Lựa chọn / Danh sách / Kéo thả).
// Cột (theo vị trí, vì tiêu đề trong file mẫu bị lệch):
// 0 STT | 1 Độ khó | 2 Mã | 3 Chủ đề | 4 Câu hỏi | 5 Loại | 6-11 Lựa chọn 1-6 | 12 Đáp án | 13 Link hình | 14 Giải thích
function el(t, c, x) { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const NL = /\\n|\n/g;

const Quiz = {
  parse(buf) {
    const wb = XLSX.read(buf, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    const c = v => String(v == null ? '' : v).trim();
    const out = [];
    rows.slice(1).forEach(r => {
      const text = c(r[4]), type = c(r[5]);
      if (!text || !type) return;
      out.push({
        id: c(r[0]), diff: c(r[1]), type,
        text: text.replace(NL, '<br>'),
        opts: r.slice(6, 12).map(c).filter(Boolean),
        ans: c(r[12]).split(',').map(s => parseInt(s, 10)).filter(n => n > 0),
        img: c(r[13]), exp: c(r[14])
      });
    });
    return out;
  },
  pick(list, n) { return shuffle(list.slice()).slice(0, Math.min(n, list.length)); },

  render(q) {
    const node = el('div', 'q'), txt = el('div', 'qtext');
    let check, mark, solution;
    if (q.type === 'Danh sách') {
      const parts = q.text.split('{D}');
      txt.innerHTML = parts.map((p, k) => p + (k < parts.length - 1 ? '<select></select>' : '')).join('');
      const sels = [...txt.querySelectorAll('select')];
      sels.forEach(s => { s.append(new Option('— chọn —', '')); q.opts.forEach((o, k) => s.append(new Option(o, k + 1))); });
      check = () => ({ ready: sels.every(s => s.value), correct: sels.every((s, k) => +s.value === q.ans[k]) });
      mark = () => sels.forEach((s, k) => s.classList.add(+s.value === q.ans[k] ? 'good' : 'bad'));
      solution = () => sels.map((s, k) => q.opts[q.ans[k] - 1] || '?').join(' · ');
      node.append(txt);
    } else if (q.type === 'Kéo thả') {
      txt.innerHTML = q.text; node.append(txt);
      const pairs = q.opts.map(o => { const p = o.split(NL); return { l: p[0].trim(), r: p.slice(1).join(' ').trim() }; });
      const pool = el('div', 'pool'), box = el('div');
      const chips = pairs.map((p, i) => { const b = el('button', 'chip', p.r); b.type = 'button'; b.dataset.i = i; b.draggable = true; return b; });
      const slots = pairs.map((p, i) => { const row = el('div', 'row'), s = el('div', 'slot'); s.dataset.i = i; row.append(el('div', '', p.l), s); box.append(row); return s; });
      shuffle(chips.slice()).forEach(b => pool.append(b));
      let sel = null, drag = null;
      const put = (slot, chip) => { const old = slot.firstElementChild; if (old) pool.append(old); slot.append(chip); if (sel) sel.classList.remove('sel'); sel = null; };
      chips.forEach(b => {
        b.onclick = () => {
          if (b.parentElement !== pool) { pool.append(b); return; }
          if (sel) sel.classList.remove('sel');
          sel = sel === b ? null : b; if (sel) b.classList.add('sel');
        };
        b.ondragstart = () => { drag = b; };
      });
      slots.forEach(s => {
        s.onclick = e => { if (sel && e.target === s) put(s, sel); };
        s.ondragover = e => e.preventDefault();
        s.ondrop = e => { e.preventDefault(); if (drag) put(s, drag); drag = null; };
      });
      node.append(box, pool, el('p', 'note', 'Kéo thả hoặc chạm vào đáp án rồi chạm vào ô trống. Chạm lại đáp án để gỡ ra.'));
      check = () => ({ ready: slots.every(s => s.firstElementChild), correct: slots.every(s => s.firstElementChild && s.firstElementChild.dataset.i === s.dataset.i) });
      mark = () => slots.forEach(s => s.classList.add(s.firstElementChild && s.firstElementChild.dataset.i === s.dataset.i ? 'good' : 'bad'));
      solution = () => pairs.map(p => p.l + ' → ' + p.r).join(' | ');
    } else { // Lựa chọn (và mọi loại khác)
      txt.innerHTML = q.text; node.append(txt);
      const multi = q.ans.length > 1, list = el('div');
      const labels = shuffle(q.opts.map((t, k) => ({ t, n: k + 1 }))).map(it => {
        const l = el('label', 'opt'), i = document.createElement('input');
        i.type = multi ? 'checkbox' : 'radio'; i.name = 'o'; i.value = it.n;
        l.append(i, el('span', '', it.t)); list.append(l); return l;
      });
      const inputs = labels.map(l => l.firstChild);
      const chosen = () => inputs.filter(i => i.checked).map(i => +i.value).sort((a, b) => a - b);
      check = () => ({ ready: chosen().length > 0, correct: chosen().join() === q.ans.slice().sort((a, b) => a - b).join() });
      mark = () => labels.forEach(l => { const n = +l.firstChild.value, on = l.firstChild.checked, right = q.ans.includes(n); if (right) l.classList.add('good'); else if (on) l.classList.add('bad'); });
      solution = () => q.ans.map(n => q.opts[n - 1]).join(' · ');
      node.append(list);
    }
    if (q.img) { const im = el('img'); im.src = q.img; im.alt = ''; im.loading = 'lazy'; node.prepend(im); }
    return { node, check, mark, solution, lock: () => node.classList.add('locked') };
  },

  // Chạy một lượt làm bài. cb.result(correct, soFar, total, answered) trả về true (người chơi gục) hoặc số ms khóa nút.
  // cb.begin(index, headEl) gọi mỗi khi hiện câu mới (dùng cho đồng hồ). cb.loop = true: hết câu thì xáo lại và làm tiếp (Dungeon).
  // cb.finish({correct,total,answered,playerDefeated?}). Trả về { end(extra) } để kết thúc lượt từ bên ngoài (hết giờ bị hạ gục).
  run(qs, box, cb) {
    let i = 0, ok = 0, answered = 0, ended = false;
    const total = () => cb.loop ? answered : qs.length;
    const ctl = { end(extra) { if (ended) return; ended = true; cb.finish({ correct: ok, total: total(), answered, ...extra }); } };
    const next = () => {
      if (ended) return;
      if (i >= qs.length) {
        if (!cb.loop) return ctl.end();
        shuffle(qs); i = 0;
      }
      const q = qs[i], v = Quiz.render(q), fb = el('div', 'fb'), btn = el('button', 'btn', 'Trả lời');
      const head = el('div', 'qhead', cb.loop ? `Câu ${answered + 1}` : `Câu ${i + 1}/${qs.length}`);
      btn.type = 'button'; let done = false;
      fb.setAttribute('role', 'status');
      box.replaceChildren(head, v.node, fb, btn);
      if (cb.begin) cb.begin(i, head);
      btn.onclick = () => {
        if (ended) return;
        if (done) { i++; next(); return; }
        const r = v.check();
        if (!r.ready) { fb.className = 'fb warn'; fb.textContent = 'Hãy trả lời hết các ô trước nhé.'; return; }
        done = true; answered++; v.lock(); v.mark(); if (r.correct) ok++;
        fb.className = 'fb ' + (r.correct ? 'good' : 'bad');
        fb.replaceChildren(el('b', '', r.correct ? 'Chính xác!' : 'Chưa đúng.'));
        if (!r.correct) fb.append(el('div', '', 'Đáp án: ' + v.solution()));
        if (q.exp) fb.append(el('div', '', q.exp));
        btn.textContent = cb.loop || i + 1 < qs.length ? 'Câu tiếp' : 'Xem kết quả';
        const action = cb.result(r.correct, ok, qs.length, answered);
        if (action === true) return ctl.end({ playerDefeated: true });
        if (Number.isFinite(action) && action > 0) {
          btn.disabled = true;
          setTimeout(() => { if (btn.isConnected) btn.disabled = false; }, action);
        }
      };
    };
    next();
    return ctl;
  }
};
