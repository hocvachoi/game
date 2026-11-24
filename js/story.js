// CỐT TRUYỆN (v5.15): hộp thoại hiện đè ở góc dưới màn hình (không đổi bố cục), có nút "Tiếp tục" và "Bỏ qua".
// Nội dung: assets/story/story.json (xem "_help" trong file). Chỉ áp dụng cho ẢI (Stage).
//   start_stage — phát khi VÀO ải, trước câu hỏi đầu tiên (Adventure.run).
//   end_stage   — phát khi VƯỢT ải rồi quay về bản đồ (Adventure.finish đặt Story.pendingEnd, renderLevels phát).
// Hiện MỌI lần. Không dùng Firestore. Thiếu file / thiếu ải / lỗi mạng → bỏ qua hộp thoại, game chạy bình thường.
const Story = {
  data: null, loading: null, cache: {}, node: null, timer: null, pendingEnd: null, token: 0,
  CROP_RATIO: 0.6,    // lấy 60% phía trên chiều cao nhân vật (đầu + ngực)
  load() {
    if (this.data) return Promise.resolve(this.data);
    if (!this.loading) {
      this.loading = fetch('assets/story/story.json').then(r => (r.ok ? r.json() : null)).catch(() => null).then(d => (this.data = d && typeof d === 'object' ? d : {}));
    }
    return this.loading;
  },
  // Danh sách lời thoại của một ải ([] nếu không có).
  async lines(world, stage, phase) {
    const d = await this.load();
    const block = d && d[world.folder] && d[world.folder][stage.key];
    const arr = block && block[phase];
    return Array.isArray(arr) ? arr.filter(l => l && typeof l.text === 'string' && l.who) : [];
  },
  // Thông tin ảnh idle + tên của một nhân vật thoại: { src, frameW, frameH, frames, name }
  async actor(who) {
    if (this.cache[who]) return this.cache[who];
    const def = { frameW: 256, frameH: 202, frames: [0, 1, 2, 3, 4, 5] };
    let info;
    if (who === 'player') {
      const c = CONFIG.character(), idle = c && c.sprites && c.sprites.idle;
      const dir = String(CONFIG.selectedCharacter || '').toLowerCase();
      info = { ...def, ...(idle || { src: `assets/characters/${dir}/${dir}_idle.png` }), name: Player.data && Player.data.nick || 'Bạn' };
    } else {
      const cfg = (this.data && this.data.characters && this.data.characters[who]) || {};
      info = { ...def, ...(typeof cfg === 'string' ? { src: cfg } : cfg) };
      if (!info.src) {
        for (const url of [`assets/monsters/${who}/${who}.json`, `assets/characters/${who}/character.json`]) {
          try {
            const r = await fetch(url); if (!r.ok) continue;
            const j = await r.json(), idle = j.sprites && j.sprites.idle;
            if (idle && idle.src) { info = { ...info, ...idle, name: info.name || j.name }; break; }
          } catch (e) { /* thử đường dẫn kế */ }
        }
        if (!info.src) info.src = `assets/monsters/${who}/${who}_idle.png`;
      }
      info.name = info.name || who;
    }
    return (this.cache[who] = info);
  },
  // Ảnh idle: lấy 60% phía TRÊN của nhân vật (tính theo khung bao thật của nhân vật, canh giữa), vẽ lên canvas vuông và chạy hoạt ảnh idle.
  // Kích thước hiển thị do CSS (.story-portrait / .char-opt) quy định → ảnh phóng ~200% so với ảnh gốc. info.still = chỉ vẽ 1 khung, không chạy.
  portrait(info) {
    const cv = document.createElement('canvas'); cv.className = 'story-face';
    let sx = 0, sy = 0, S = 120, f = 0;
    cv.width = cv.height = S;
    if (info.flip) cv.style.transform = 'scaleX(-1)';   // lật ngang nếu nhân vật trong ảnh quay sai hướng ("flip": true trong story.json)
    const img = new Image(), g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const draw = () => {
      if (!img.complete || !img.naturalWidth) return;
      const fr = info.frames[f % info.frames.length];
      g.clearRect(0, 0, S, S);
      g.drawImage(img, fr * info.frameW + sx, sy, S, S, 0, 0, S, S);
    };
    img.onload = () => {
      try {   // khung bao (phần không trong suốt) của khung đầu tiên
        const t = document.createElement('canvas'); t.width = info.frameW; t.height = info.frameH;
        const tg = t.getContext('2d'); tg.drawImage(img, info.frames[0] * info.frameW, 0, info.frameW, info.frameH, 0, 0, info.frameW, info.frameH);
        const px = tg.getImageData(0, 0, info.frameW, info.frameH).data;
        let lo = info.frameW, hi = 0, top = info.frameH, bot = 0;
        for (let y = 0; y < info.frameH; y++) for (let x = 0; x < info.frameW; x++) if (px[(y * info.frameW + x) * 4 + 3] > 20) { if (x < lo) lo = x; if (x > hi) hi = x; if (y < top) top = y; if (y > bot) bot = y; }
        if (hi > lo && bot > top) {
          S = Math.max(16, Math.round((bot - top) * this.CROP_RATIO));          // 60% chiều cao nhân vật
          sx = Math.max(0, Math.min(info.frameW - S, Math.round((lo + hi) / 2 - S / 2)));
          sy = top;
          cv.width = cv.height = S; g.imageSmoothingEnabled = false;
        }
      } catch (e) { /* không đọc được điểm ảnh: dùng ô mặc định */ }
      draw();
    };
    img.src = info.src;
    if (!info.still && info.frames.length > 1) cv.dataset.timer = String(setInterval(() => { f++; draw(); }, 150));
    return cv;
  },
  close() {
    this.token++;
    if (!this.node) return;
    this.node.querySelectorAll('canvas').forEach(c => clearInterval(Number(c.dataset.timer)));
    clearInterval(this.timer); this.timer = null;
    document.removeEventListener('keydown', this.onKey);
    this.node.remove(); this.node = null;
  },
  onKey(e) { if (Story.node && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight')) { e.preventDefault(); Story.node.querySelector('.story-next').click(); } else if (Story.node && e.key === 'Escape') Story.node.querySelector('.story-skip').click(); },
  // Phát hộp thoại; gọi done() khi hết lời thoại hoặc khi bấm "Bỏ qua". Không có lời thoại → done() ngay.
  async play(world, stage, phase, done) {
    this.close();
    const my = this.token;
    let lines = [];
    try { lines = await this.lines(world, stage, phase); } catch (e) { lines = []; }
    if (!lines.length || my !== this.token) { if (my === this.token) done(); return; }
    const sides = {}, actors = {};
    for (const l of lines) {
      l.side = l.side === 'left' || l.side === 'right' ? l.side : (l.who === 'player' ? 'left' : 'right');
      if (!actors[l.who]) actors[l.who] = await this.actor(l.who);
      if (my !== this.token) return;
    }
    const root = el('div', 'story'), wrap = el('div', 'story-wrap'), face = { left: el('div', 'story-portrait is-left'), right: el('div', 'story-portrait is-right') };
    const box = el('div', 'story-box'), tab = el('div', 'story-name'), text = el('p', 'story-text');
    const skip = el('button', 'btn ghost story-skip', 'Bỏ qua'), next = el('button', 'btn story-next', 'Tiếp tục');
    skip.type = next.type = 'button';
    box.append(tab, text, el('div', 'story-actions'));
    box.lastChild.append(skip, next);
    wrap.append(face.left, face.right, box); root.append(wrap);
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Hội thoại');
    document.body.append(root); this.node = root;
    const shown = { left: null, right: null };
    let i = 0, typing = false;
    const setFace = (side, who) => {
      if (shown[side] === who) return;
      shown[side] = who; face[side].replaceChildren(this.portrait(actors[who]));
    };
    // Cả hai bên hiện sẵn ngay từ lời thoại đầu: lấy người đầu tiên nói ở mỗi bên.
    ['left', 'right'].forEach(s => { const f = lines.find(l => l.side === s); if (f) setFace(s, f.who); });
    const finish = () => { this.close(); done(); };
    const show = () => {
      const l = lines[i], a = actors[l.who];
      setFace(l.side, l.who);
      face.left.classList.toggle('is-dim', l.side !== 'left'); face.right.classList.toggle('is-dim', l.side !== 'right');
      tab.textContent = l.name || a.name; tab.className = 'story-name is-' + l.side;
      const full = String(l.text).replace(/\\n/g, '\n');
      next.textContent = i === lines.length - 1 ? 'Kết thúc' : 'Tiếp tục';
      clearInterval(this.timer); text.textContent = ''; typing = true;
      let n = 0;   // hiện chữ dần (bấm Tiếp tục khi đang hiện chữ = hiện đủ câu)
      this.timer = setInterval(() => { n += 2; text.textContent = full.slice(0, n); if (n >= full.length) { clearInterval(this.timer); typing = false; } }, 28);
      text._full = full;
    };
    next.onclick = () => {
      if (typing) { clearInterval(this.timer); text.textContent = text._full; typing = false; return; }
      if (++i >= lines.length) { finish(); return; }
      show();
    };
    skip.onclick = finish;
    document.addEventListener('keydown', this.onKey);
    show(); next.focus();
  }
};
