// Chiến trường: nền theo ải, nhân vật và quái vật dạng sprite sheet.
// Sprite nhân vật: CONFIG.CHARACTERS (assets/characters/<key>/character.json); quái vật: assets/monsters/<key>/<key>.json (sprites.idle/attack).
const Stage = {
  FW: 256, FH: 202,                // kích thước canvas nhân vật/quái vật (đúng 1 khung sprite đã crop)
  resizeObserver: null, background: null, bgSrc: null,
  hero: null,  // { key, def, images:{idle,attack}, mode:'idle'|'attack', i }
  mob: null,   // { monster, images:{idle,attack}, mode, i }
  heroTimer: null, mobTimer: null, effectTimer: null, respawnTimer: null, visibilityObserver: null, visibilityHandler: null,

  reduced() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; },
  loadImage(src, onload) {
    const im = new Image();
    im.onload = onload;
    im.onerror = () => console.error('Không tải được ảnh: ' + src);
    im.src = src;
    return im;
  },
  ready(im) { return im && im.complete && im.naturalWidth; },
  mobSheet() {
    return this.mob.monster.sprites[this.mob.mode === 'idle' ? 'idle' : 'attack'];
  },

  // ----- vẽ khung sprite -----
  // flip = true: lật ngang (dùng cho đối thủ Ranked là sprite NHÂN VẬT vốn quay mặt sang phải, cần quay về phía người chơi).
  drawFrame(canvasId, image, sheet, frame, flip) {
    const cv = document.getElementById(canvasId), g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    if (!this.ready(image)) return;
    g.imageSmoothingEnabled = false;
    const fw = sheet.frameW, ch = sheet.cropH || sheet.frameH, cy = sheet.cropY || 0;
    if (flip) { g.save(); g.translate(this.FW, 0); g.scale(-1, 1); }
    g.drawImage(image, frame * fw, cy, fw, ch, 0, 0, this.FW, this.FH);
    if (flip) g.restore();
  },
  drawHero() {
    const h = this.hero; if (!h) return;
    const sheet = h.mode === 'attack' ? h.def.attack : h.def.idle;
    this.drawFrame('hero', h.images[h.mode], sheet, sheet.frames[h.i % sheet.frames.length]);
  },
  drawMob() {
    const m = this.mob; if (!m) return;
    const sheet = this.mobSheet();
    const image = m.images[m.mode === 'idle' ? 'idle' : 'attack'];
    this.drawFrame('mob', image, sheet, sheet.frames[m.i % sheet.frames.length], Boolean(m.monster.flip));
  },

  // ----- vòng lặp hoạt ảnh (idle / attack) -----
  visible() { const s = document.getElementById('stage'); return !document.hidden && s.isConnected && s.getClientRects().length > 0; },
  stopTimers() { clearTimeout(this.heroTimer); clearTimeout(this.mobTimer); this.heroTimer = this.mobTimer = null; },
  sync() {
    if (!this.visible() || this.reduced()) {
      this.stopTimers();
      if (this.reduced()) { if (this.hero) { this.hero.mode = 'idle'; this.hero.i = 0; } if (this.mob) { this.mob.mode = 'idle'; this.mob.i = 0; } this.drawHero(); this.drawMob(); }
      return;
    }
    if (this.heroTimer === null && this.hero && this.ready(this.hero.images[this.hero.mode]))
      this.heroTimer = setTimeout(() => this.tickHero(), this.hero.mode === 'attack' ? 80 : 160);
    if (this.mobTimer === null && this.mob && this.ready(this.mob.images[this.mob.mode]))
      this.mobTimer = setTimeout(() => this.tickMob(), this.mob.mode === 'attack' ? 80 : 200);
  },
  tickHero() {
    this.heroTimer = null; if (!this.visible() || !this.hero) return;
    const h = this.hero; h.i++;
    if (h.mode === 'attack' && h.i >= h.def.attack.frames.length) { h.mode = 'idle'; h.i = 0; }
    this.drawHero();
    if (h.mode === 'attack' && h.def.ranged && h.def.castSkill && h.i === h.def.castSkill.frame) this.castSkill();
    this.sync();
  },
  tickMob() {
    this.mobTimer = null; if (!this.visible() || !this.mob) return;
    const m = this.mob, sheet = this.mobSheet(); m.i++;
    if (m.mode === 'attack' && m.i >= sheet.frames.length) { m.mode = 'idle'; m.i = 0; }
    this.drawMob(); this.sync();
  },
  observe() {
    const stage = document.getElementById('stage');
    if (!this.visibilityObserver && 'IntersectionObserver' in window) {
      this.visibilityObserver = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) this.sync(); else this.stopTimers(); });
      this.visibilityObserver.observe(stage);
    }
    if (!this.visibilityHandler) { this.visibilityHandler = () => this.sync(); document.addEventListener('visibilitychange', this.visibilityHandler); }
  },

  // ----- nền -----
  drawScene() {
    const cv = document.getElementById('scene'), stage = document.getElementById('stage');
    const w = Math.max(1, Math.round(stage.clientWidth)), h = Math.max(1, Math.round(stage.clientHeight));
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.fillStyle = '#1d2430'; g.fillRect(0, 0, w, h);
    if (!this.ready(this.background)) return;
    const s = Math.max(w / this.background.naturalWidth, h / this.background.naturalHeight);
    const iw = this.background.naturalWidth * s, ih = this.background.naturalHeight * s;
    g.drawImage(this.background, (w - iw) / 2, (h - ih) / 2, iw, ih);
  },

  // opts: { background: 'assets/maps/WorldN/Stage_i.jpg', monster: {…<key>.json…}, character: 'Archer_F' }
  init(opts = {}) {
    const bg = opts.background || this.bgSrc;
    if (bg && bg !== this.bgSrc) { this.bgSrc = bg; this.background = this.loadImage(bg, () => this.drawScene()); }
    this.drawScene();
    if (!this.resizeObserver && 'ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => this.drawScene());
      this.resizeObserver.observe(document.getElementById('stage'));
    }
    ['hero', 'mob'].forEach(id => { const cv = document.getElementById(id); cv.width = this.FW; cv.height = this.FH; });

    const def = CONFIG.CHARACTERS[opts.character] || CONFIG.character(), key = def.key;
    if (!this.hero || this.hero.key !== key) {
      this.hero = { key, def, mode: 'idle', i: 0, images: {} };
      ['idle', 'attack', 'skill'].forEach(m => {
        if (def[m] && def[m].src) this.hero.images[m] = this.loadImage(def[m].src, () => { this.drawHero(); this.sync(); });
      });
    }
    const monster = opts.monster || StageMonster.FALLBACK;
    if (!this.mob || this.mob.monster.key !== monster.key) this.createMob(monster);
    this.observe();
    this.drawHero(); this.drawMob(); this.sync();
  },
  createMob(monster) {
    this.mob = { monster, mode: 'idle', i: 0, images: {} };
    ['idle', 'attack'].forEach(mode => {
      this.mob.images[mode] = this.loadImage(monster.sprites[mode].src, () => { this.drawMob(); this.sync(); });
    });
  },
  // Dungeon: thay quái mới (khác key thì nạp sprite mới) rồi hồi sinh với HP đầy.
  setMonster(monster) {
    this.stopTimers();
    if (!this.mob || this.mob.monster.key !== monster.key) this.createMob(monster);
    this.respawn();
  },
  reset() {
    this.stopTimers(); clearTimeout(this.effectTimer); this.effectTimer = null;
    clearTimeout(this.respawnTimer); this.respawnTimer = null;
    document.getElementById('hero').classList.remove('atk', 'hurt', 'lunge', 'dead');
    document.getElementById('mob').classList.remove('atk', 'hurt', 'lunge', 'dead');
    document.getElementById('skill-projectile').classList.remove('is-flying');
    if (this.hero) { this.hero.mode = 'idle'; this.hero.i = 0; }
    if (this.mob) { this.mob.mode = 'idle'; this.mob.i = 0; }
    this.drawHero(); this.drawMob(); this.sync();
    const hp = this.mob && Number(this.mob.monster.stats && this.mob.monster.stats.HP);
    this.hp(1, hp > 0 ? hp : 1, hp > 0 ? hp : 1);
  },
  hp(f, current, max) {
    document.querySelector('#mobhp i').style.width = Math.max(0, Math.min(1, f)) * 100 + '%';
    document.getElementById('mob-hp').textContent = `${current} / ${max}`;
  },
  playerHp(f, current, max) {
    document.querySelector('.player-hp i').style.width = Math.max(0, Math.min(1, f)) * 100 + '%';
    document.getElementById('hud-hp').textContent = `${current} / ${max}`;
  },
  anim(id, cls) {
    const e = document.getElementById(id);
    e.classList.remove(cls);
    if (this.reduced()) return;
    void e.offsetWidth; e.classList.add(cls);
    e.addEventListener('animationend', () => e.classList.remove(cls), { once: true });
  },
  play(who, mode) {  // chuyển sang hoạt ảnh tấn công từ khung đầu
    const o = this[who]; if (!o || this.reduced()) return;
    clearTimeout(who === 'hero' ? this.heroTimer : this.mobTimer);
    if (who === 'hero') this.heroTimer = null; else this.mobTimer = null;
    o.mode = mode; o.i = 0;
    who === 'hero' ? this.drawHero() : this.drawMob();
    this.sync();
  },
  fx(correct, soFar, total) {
    clearTimeout(this.effectTimer);
    if (correct) {
      this.play('hero', 'attack');
      const melee = !this.reduced() && this.hero && !this.hero.def.ranged;
      if (melee) this.anim('hero', 'lunge');
      this.effectTimer = setTimeout(() => { this.effectTimer = null; this.anim('mob', 'hurt'); }, melee ? 560 : 350);
    } else {
      this.play('mob', 'attack');
      const lunge = !this.reduced();
      if (lunge) this.anim('mob', 'lunge');
      this.effectTimer = setTimeout(() => { this.effectTimer = null; this.anim('hero', 'hurt'); }, lunge ? 560 : 350);
    }
  },
  castSkill() {
    if (!this.hero || !this.hero.def.castSkill || this.reduced() || !this.ready(this.hero.images.skill)) return;
    const stage = document.getElementById('stage');
    const hero = document.getElementById('hero').getBoundingClientRect();
    const mob = document.getElementById('mob').getBoundingClientRect();
    const bounds = stage.getBoundingClientRect();
    const projectile = document.getElementById('skill-projectile');
    const { origin, target } = this.hero.def.castSkill;
    const startX = hero.left + hero.width * origin.x - bounds.left;
    const startY = hero.top + hero.height * origin.y - bounds.top;
    const endX = mob.left + mob.width * target.x - bounds.left;
    const endY = mob.top + mob.height * target.y - bounds.top;
    projectile.src = this.hero.def.skill.src;
    projectile.style.left = `${startX}px`;
    projectile.style.top = `${startY}px`;
    projectile.style.setProperty('--skill-x', `${endX - startX}px`);
    projectile.style.setProperty('--skill-y', `${endY - startY}px`);
    projectile.onanimationend = () => projectile.classList.remove('is-flying');
    projectile.classList.remove('is-flying');
    void projectile.offsetWidth;
    projectile.classList.add('is-flying');
  },
  defeat() {
    clearTimeout(this.respawnTimer);
    this.respawnTimer = null;
    document.getElementById('mob').classList.add('dead');
  },
  respawn() {
    this.respawnTimer = null;
    document.getElementById('mob').classList.remove('dead', 'hurt', 'atk', 'lunge');
    if (this.mob) { this.mob.mode = 'idle'; this.mob.i = 0; }
    this.drawMob();
    const hp = Number(this.mob && this.mob.monster.stats && this.mob.monster.stats.HP) || 1;
    this.hp(1, hp, hp);
    this.sync();
  },
  playerDefeat() {
    document.getElementById('hero').classList.add('dead');
  }
};
