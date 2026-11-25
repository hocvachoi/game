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
  imageOk(src) { return new Promise(res => { const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = src; }); },
  // Thông tin ảnh idle + tên của một nhân vật thoại: { src, frameW, frameH, frames, name }
  async actor(who) {
    if (who !== 'player' && this.cache[who]) return this.cache[who];   // 'player' không cache: học sinh có thể đổi nhân vật
    const def = { frameW: 256, frameH: 202, frames: [0, 1, 2, 3, 4, 5] };
    let info;
    if (who === 'player') {
      const c = CONFIG.character(), idle = c && c.sprites && c.sprites.idle;
      const dir = String(CONFIG.selectedCharacter || '').toLowerCase();
      info = { ...def, ...(idle || { src: `assets/characters/${dir}/${dir}_idle.png` }), name: (Player.data && Player.data.nick) || (c && c.name) || 'Bạn' };   // tab tên của học sinh = nickname
    } else {
      const cfg = (this.data && this.data.characters && this.data.characters[who]) || {};
      info = { ...def, ...(typeof cfg === 'string' ? { src: cfg } : cfg) };
      // Người dẫn truyện: khai báo trong "characters" với src rỗng "" → KHÔNG hiện ảnh, KHÔNG hiện tab tên (chỉ hiện chữ).
      if (typeof cfg === 'object' && cfg.src === '') return (this.cache[who] = { ...info, hidden: true, name: cfg.name || '' });
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
      // Không tìm thấy ảnh (sai chính tả "who", thiếu file…) → coi như người dẫn truyện (không ảnh, không tab tên) và báo ở Console, không để hiện ảnh lỗi.
      if (!(await this.imageOk(info.src))) { console.warn(`Story: không tải được ảnh của "${who}" (${info.src}) — kiểm tra lại "who" trong story.json.`); info = { ...info, hidden: true, name: (typeof cfg === 'object' && cfg.name) || '' }; }
    }
    return who === 'player' ? info : (this.cache[who] = info);
  },
  // Ảnh idle trong hộp thoại: GIỮ 100% khung ảnh gốc (frameW×frameH, mặc định 256×202), không cắt; kích thước hiển thị = gốc × --zoom (CSS, mặc định 1.5).
  // Hoạt ảnh idle chạy bằng canvas. info.still = chỉ vẽ 1 khung.
  portrait(info) {
    const cv = document.createElement('canvas'); cv.className = 'story-face';
    cv.width = info.frameW; cv.height = info.frameH;
    if (info.flip) cv.style.transform = 'scaleX(-1)';   // lật ngang nếu nhân vật trong ảnh quay sai hướng ("flip": true trong story.json)
    const img = new Image(), g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    let f = 0;
    const draw = () => {
      if (!img.complete || !img.naturalWidth) return;
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(img, info.frames[f % info.frames.length] * info.frameW, 0, info.frameW, info.frameH, 0, 0, info.frameW, info.frameH);
    };
    img.onload = draw; img.src = info.src;
    if (!info.still && info.frames.length > 1) cv.dataset.timer = String(setInterval(() => { f++; draw(); }, 150));
    return cv;
  },
  // Ảnh ĐẦU–NGỰC cho ô nhỏ (chọn nhân vật khi đăng ký): giữ toàn bộ chiều ngang nhân vật, chỉ cắt phần DƯỚI (60% chiều cao từ đỉnh).
  // Khung bao tính trên mọi khung hình để hoạt ảnh không bị cắt cụt. Kích thước hiển thị: CSS (.story-face dùng --w × --zoom; ô chọn nhân vật dùng ô vuông cố định).
  // info.still = chỉ vẽ 1 khung, không chạy hoạt ảnh.
  bust(info) {
    const cv = document.createElement('canvas'); cv.className = 'story-face';
    let sx = 0, sy = 0, W = 120, H = 120, f = 0;
    cv.width = W; cv.height = H; cv.style.setProperty('--w', W);
    if (info.flip) cv.style.transform = 'scaleX(-1)';   // lật ngang nếu nhân vật trong ảnh quay sai hướng ("flip": true trong story.json)
    const img = new Image(), g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const draw = () => {
      if (!img.complete || !img.naturalWidth) return;
      const fr = info.frames[f % info.frames.length];
      g.clearRect(0, 0, W, H);
      g.drawImage(img, fr * info.frameW + sx, sy, W, H, 0, 0, W, H);
    };
    img.onload = () => {
      try {   // khung bao (phần không trong suốt) gộp từ mọi khung hình
        const t = document.createElement('canvas'); t.width = info.frameW; t.height = info.frameH;
        const tg = t.getContext('2d', { willReadFrequently: true });
        let lo = info.frameW, hi = 0, top = info.frameH, bot = 0;
        for (const fr of info.frames) {
          tg.clearRect(0, 0, info.frameW, info.frameH);
          tg.drawImage(img, fr * info.frameW, 0, info.frameW, info.frameH, 0, 0, info.frameW, info.frameH);
          const px = tg.getImageData(0, 0, info.frameW, info.frameH).data;
          for (let y = 0; y < info.frameH; y++) for (let x = 0; x < info.frameW; x++) if (px[(y * info.frameW + x) * 4 + 3] > 20) { if (x < lo) lo = x; if (x > hi) hi = x; if (y < top) top = y; if (y > bot) bot = y; }
        }
        if (hi > lo && bot > top) {
          sx = Math.max(0, lo - 2); W = Math.min(info.frameW - sx, hi - lo + 5);   // đủ chiều ngang nhân vật
          sy = top; H = Math.max(16, Math.round((bot - top) * this.CROP_RATIO));      // chỉ lấy 60% phía trên
          cv.width = W; cv.height = H; cv.style.setProperty('--w', W); g.imageSmoothingEnabled = false;
        }
      } catch (e) { /* không đọc được điểm ảnh: dùng ô mặc định */ }
      draw();
    };
    img.src = info.src;
    if (!info.still && info.frames.length > 1) cv.dataset.timer = String(setInterval(() => { f++; draw(); }, 150));
    return cv;
  },
  // Thay chỗ giữ chỗ trong lời thoại: {name} = "name" trong character.json của nhân vật học sinh đang chọn (vd "Cung thủ nữ"), {nick} = nickname.
  fill(text) {
    const c = CONFIG.character && CONFIG.character(), nick = Player.data && Player.data.nick || '';
    return text.replace(/\{name\}/g, (c && c.name) || nick || 'Bạn').replace(/\{nick\}/g, nick || (c && c.name) || 'Bạn');
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
      shown[side] = who;
      face[side].style.setProperty('--fw', actors[who].frameW); face[side].style.setProperty('--fh', actors[who].frameH);   // CSS: kích thước & độ chìm sau hộp thoại
      face[side].replaceChildren(this.portrait(actors[who]));
    };
    // Cả hai bên hiện sẵn ngay từ lời thoại đầu: lấy người đầu tiên nói ở mỗi bên.
    ['left', 'right'].forEach(s => { const f = lines.find(l => l.side === s && !actors[l.who].hidden); if (f) setFace(s, f.who); });
    const finish = () => { this.close(); done(); };
    const show = () => {
      const l = lines[i], a = actors[l.who];
      const who = l.name || a.name;   // tab tên: dòng có "name" riêng > tên nhân vật (học sinh = nickname)
      if (a.hidden) {   // người dẫn truyện: không ảnh, cả hai bên mờ đi
        face.left.classList.add('is-dim'); face.right.classList.add('is-dim');
      } else {
        setFace(l.side, l.who);
        face.left.classList.toggle('is-dim', l.side !== 'left'); face.right.classList.toggle('is-dim', l.side !== 'right');
      }
      tab.hidden = a.hidden ? !l.name : !who;
      tab.textContent = who; tab.className = 'story-name is-' + l.side;
      const full = this.fill(String(l.text)).replace(/\\n/g, '\n');
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
