// Chiến trường: nền theo ải, nhân vật và quái vật dạng sprite sheet.
// Sprite nhân vật: CONFIG.CHARACTERS (assets/characters/<key>/character.json); quái vật: assets/monsters/<key>/<key>.json (sprites.idle/attack).
const Stage = {
  FW: 256, FH: 202,                // kích thước canvas nhân vật/quái vật (đúng 1 khung sprite đã crop)
  resizeObserver: null, background: null, bgSrc: null,
  hero: null,  // { key, def, images:{idle,attack,skill}, mode:'idle'|'attack', i }
  mob: null,   // { monster, images:{idle,attack,skill}, mode, i }
  heroTimer: null, mobTimer: null, impactTimers: [], respawnTimer: null, visibilityObserver: null, visibilityHandler: null,

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
    if (h.mode === 'attack' && h.i >= h.def.attack.frames.length) {
      h.mode = 'idle'; h.i = 0;
      this.drawHero(); this.finishAttack('hero');
    } else this.drawHero();
    this.sync();
  },
  tickMob() {
    this.mobTimer = null; if (!this.visible() || !this.mob) return;
    const m = this.mob, sheet = this.mobSheet(); m.i++;
    if (m.mode === 'attack' && m.i >= sheet.frames.length) {
      m.mode = 'idle'; m.i = 0;
      this.drawMob(); this.finishAttack('mob');
    } else this.drawMob();
    this.sync();
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
    document.getElementById('mob').classList.toggle('ranked-opponent', monster.type === 'Ranked');
    if (!this.mob || this.mob.monster.key !== monster.key) this.createMob(monster);
    this.observe();
    this.drawHero(); this.drawMob(); this.sync();
  },
  createMob(monster) {
    this.mob = { monster, mode: 'idle', i: 0, images: {} };
    ['idle', 'attack', 'skill'].forEach(mode => {
      const sheet = monster.sprites[mode];
      if (sheet && sheet.src) this.mob.images[mode] = this.loadImage(sheet.src, () => { this.drawMob(); this.sync(); });
    });
  },
  // Dungeon: thay quái mới (khác key thì nạp sprite mới) rồi hồi sinh với HP đầy.
  setMonster(monster) {
    this.stopTimers();
    if (!this.mob || this.mob.monster.key !== monster.key) this.createMob(monster);
    this.respawn();
  },
  reset() {
    this.stopTimers();
    this.impactTimers.forEach(clearTimeout); this.impactTimers = [];
    clearTimeout(this.respawnTimer); this.respawnTimer = null;
    document.getElementById('hero').classList.remove('atk', 'hurt', 'lunge', 'dead');
    document.getElementById('mob').classList.remove('atk', 'hurt', 'lunge', 'dead');
    const projectile = document.getElementById('skill-projectile');
    projectile.classList.remove('is-flying');
    projectile.style.removeProperty('--skill-scale');
    if (this.hero) { this.hero.mode = 'idle'; this.hero.i = 0; this.hero.onImpact = []; }
    if (this.mob) { this.mob.mode = 'idle'; this.mob.i = 0; this.mob.onImpact = []; }
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
  play(who, mode, onImpact) {  // chuyển sang hoạt ảnh tấn công từ khung đầu
    const o = this[who];
    if (!o) { if (onImpact) onImpact(); return; }
    if (mode === 'attack' && onImpact) {
      if (!o.onImpact) o.onImpact = [];
      o.onImpact.push(onImpact);
    }
    if (this.reduced()) {
      o.mode = 'idle'; o.i = 0;
      who === 'hero' ? this.drawHero() : this.drawMob();
      if (mode === 'attack') this.finishAttack(who);
      return;
    }
    clearTimeout(who === 'hero' ? this.heroTimer : this.mobTimer);
    if (who === 'hero') this.heroTimer = null; else this.mobTimer = null;
    o.mode = mode; o.i = 0;
    who === 'hero' ? this.drawHero() : this.drawMob();
    this.sync();
  },
  finishAttack(who) {
    const actor = this[who], callbacks = actor && actor.onImpact ? actor.onImpact.splice(0) : [];
    if (!actor) return;
    const impact = () => {
      this.anim(who === 'hero' ? 'mob' : 'hero', 'hurt');
      callbacks.forEach(callback => callback());
    };
    if (this.isRanged(who) && this.castSkill(who)) {
      const timer = setTimeout(() => {
        this.impactTimers = this.impactTimers.filter(id => id !== timer);
        impact();
      }, 240);
      this.impactTimers.push(timer);
    } else impact();
  },
  isRanged(who) {
    const actor = who === 'hero' ? this.hero : this.mob;
    if (!actor) return false;
    if (who === 'hero') return actor.def.ranged;
    const monster = actor.monster, classKey = String(monster.Class || monster.class || '').split('_')[0].toLowerCase();
    return monster.attackStyle === 'ranged' || classKey === 'mage' || classKey === 'archer';
  },
  fx(correct, soFar, total, onImpact) {
    const who = correct ? 'hero' : 'mob';
    const melee = !this.reduced() && !this.isRanged(who);
    return new Promise(resolve => {
      this.play(who, 'attack', () => {
        try {
          if (onImpact) onImpact();
        } finally {
          resolve();
        }
      });
      if (melee) this.anim(who, 'lunge');
    });
  },
  castSkill(who = 'hero') {
    const actor = who === 'hero' ? this.hero : this.mob;
    if (!actor || this.reduced()) return false;
    const def = who === 'hero' ? actor.def : actor.monster;
    const skill = who === 'hero' ? def.skill : def.sprites.skill;
    if (!def.castSkill || !skill || !skill.src || !this.ready(actor.images.skill)) return false;
    const stage = document.getElementById('stage');
    const source = document.getElementById(who === 'hero' ? 'hero' : 'mob').getBoundingClientRect();
    const target = document.getElementById(who === 'hero' ? 'mob' : 'hero').getBoundingClientRect();
    const bounds = stage.getBoundingClientRect();
    const projectile = document.getElementById('skill-projectile');
    const flip = who === 'mob' && Boolean(def.flip);
    const { origin, target: aim } = def.castSkill;
    const startX = source.left + source.width * (flip ? 1 - origin.x : origin.x) - bounds.left;
    const startY = source.top + source.height * origin.y - bounds.top;
    const endX = target.left + target.width * (flip ? 1 - aim.x : aim.x) - bounds.left;
    const endY = target.top + target.height * aim.y - bounds.top;
    projectile.src = skill.src;
    projectile.style.left = `${startX}px`;
    projectile.style.top = `${startY}px`;
    projectile.style.setProperty('--skill-scale', flip ? '-1' : '1');
    projectile.style.setProperty('--skill-x', `${endX - startX}px`);
    projectile.style.setProperty('--skill-y', `${endY - startY}px`);
    projectile.onanimationend = () => projectile.classList.remove('is-flying');
    projectile.classList.remove('is-flying');
    void projectile.offsetWidth;
    projectile.classList.add('is-flying');
    return true;
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
