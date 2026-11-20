// Chiến trường: nền theo ải, nhân vật và quái vật dạng sprite sheet.
// Sprite nhân vật: CONFIG.CHARACTERS (assets/characters/<key>/character.json); quái vật: assets/monsters/<key>/<key>.json (sprites.idle/attack).
const Stage = {
  FW: 256, FH: 202,                // kích thước canvas nhân vật/quái vật (đúng 1 khung sprite đã crop)
  resizeObserver: null, background: null, bgSrc: null,
  hero: null,  // { key, def, images:{idle,attack,skill}, mode:'idle'|'attack', i }
  mob: null,   // { monster, images:{idle,attack,skill}, mode, i }
  lungeDone: { hero: null, mob: null }, heroTimer: null, mobTimer: null, impactTimers: [], respawnTimer: null, visibilityObserver: null, visibilityHandler: null,

  // Chữ nổi (position:absolute trong #stage) ngay trên nhân vật kích hoạt hiệu ứng: who = 'hero' | 'mob'; kind = crit | ambush | shield | heal (màu theo CSS .fx-<kind>).
  // Nhiều chữ cùng lúc ở một nhân vật được xếp chồng lên trên nhau và tự xóa sau khi hết hoạt ảnh.
  popups: { hero: 0, mob: 0 },
  popup(who, text, kind) {
    const stage = document.getElementById('stage'), target = document.getElementById(who === 'hero' ? 'hero' : 'mob');
    if (!stage || !target) return;
    const s = stage.getBoundingClientRect(), r = target.getBoundingClientRect();
    if (!r.width) return;
    const n = this.popups[who]++, p = document.createElement('span');
    p.className = `fx-pop fx-${kind}`; p.textContent = text;
    p.style.left = (r.left - s.left + r.width * (who === 'mob' ? 0.3 : 0.5)) + 'px';   // quái: lệch trái vì phần phải sprite nằm dưới thẻ câu hỏi
    p.style.top = Math.max(4, r.top - s.top + r.height * 0.18 - n * 28) + 'px';
    stage.append(p);
    let gone = false;
    const done = () => { if (gone) return; gone = true; p.remove(); this.popups[who] = Math.max(0, this.popups[who] - 1); };
    p.addEventListener('animationend', done); setTimeout(done, 1600);
  },
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
    const mode = this.mob.mode === 'idle' ? 'idle' : 'attack', m = this.mob;
    return (this.useMadness(mode) && m.monster.madness && m.monster.madness[mode]) || m.monster.sprites[mode];   // sprite Điên loạn mặc định cùng bố cục khung với sprite thường
  },
  // Quái Điên loạn đang hiện bằng ảnh riêng (đã nạp xong)?
  useMadness(mode) {
    const m = this.mob, key = mode === 'idle' ? 'idle' : 'attack';
    return Boolean(m && m.madness && m.madImages && this.ready(m.madImages[key]));
  },
  mobImage(mode) {
    const m = this.mob, key = mode === 'idle' ? 'idle' : 'attack';
    return this.useMadness(key) ? m.madImages[key] : m.images[key];
  },
  // Điên loạn: nạp <key>_madness_idle.png / _animation.png (hoặc monster.madness.<mode>.src trong JSON); lỗi nạp → dùng ảnh thường.
  loadMadness() {
    const m = this.mob, mon = m.monster;
    if (m.madImages || !mon.key) return;
    m.madImages = {};
    const names = { idle: 'idle', attack: 'animation' };
    for (const mode of ['idle', 'attack']) {
      const src = (mon.madness && mon.madness[mode] && mon.madness[mode].src) || `assets/monsters/${mon.key}/${mon.key}_madness_${names[mode]}.png`;
      const im = new Image();
      im.onload = () => { this.drawMob(); this.applyMadnessClass(); };
      im.onerror = () => { m.madFailed = true; this.applyMadnessClass(); };
      im.src = src; m.madImages[mode] = im;
    }
  },
  setMadness(on) {
    const m = this.mob; if (!m) return;
    m.madness = Boolean(on);
    if (m.madness) this.loadMadness();
    document.getElementById('screen-game').classList.toggle('is-madness', m.madness);
    this.applyMadnessClass();
  },
  applyMadnessClass() {
    const m = this.mob; if (!m) return;
    document.getElementById('mob').classList.toggle('madness-tint', Boolean(m.madness));
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
    document.getElementById('hero').classList.toggle('is-attacking', h.mode === 'attack');   // đang tấn công → sprite nằm trên (z-index)
    this.drawFrame('hero', h.images[h.mode], sheet, sheet.frames[h.i % sheet.frames.length]);
  },
  drawMob() {
    const m = this.mob; if (!m) return;
    const sheet = this.mobSheet();
    document.getElementById('mob').classList.toggle('is-attacking', m.mode === 'attack');
    document.getElementById('mob').classList.toggle('madness-tint', Boolean(m.madness));
    const image = this.mobImage(m.mode);
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
    const h = this.hero, frames = h.def.attack.frames;
    const endedFrame = h.mode === 'attack' ? frames[h.i] : null;
    const attack = h.attackState; h.i++;
    if (h.mode === 'attack' && h.i >= frames.length) {
      h.mode = 'idle'; h.i = 0;
      this.drawHero();
      if (this.isRanged('hero') && h.def.castSkill && endedFrame === h.def.castSkill.frame) this.fireSkill('hero', attack);
      this.finishAttack('hero', attack);
    } else {
      this.drawHero();
      if (this.isRanged('hero') && h.def.castSkill && endedFrame === h.def.castSkill.frame) this.fireSkill('hero', attack);
    }
    this.sync();
  },
  tickMob() {
    this.mobTimer = null; if (!this.visible() || !this.mob) return;
    const m = this.mob, sheet = this.mobSheet();
    const endedFrame = m.mode === 'attack' ? sheet.frames[m.i] : null;
    const attack = m.attackState; m.i++;
    if (m.mode === 'attack' && m.i >= sheet.frames.length) {
      m.mode = 'idle'; m.i = 0;
      this.drawMob();
      if (this.isRanged('mob') && m.monster.castSkill && endedFrame === m.monster.castSkill.frame) this.fireSkill('mob', attack);
      this.finishAttack('mob', attack);
    } else {
      this.drawMob();
      if (this.isRanged('mob') && m.monster.castSkill && endedFrame === m.monster.castSkill.frame) this.fireSkill('mob', attack);
    }
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

  // opts: { background: 'assets/maps/worldn/stage_i.jpg', monster: {…<key>.json…}, character: 'Archer_F' }
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
    this.setMadness(Boolean(opts.madness));
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
  setMonster(monster, madness = false) {
    this.stopTimers();
    if (!this.mob || this.mob.monster.key !== monster.key) this.createMob(monster);
    else this.mob.monster = monster;
    this.setMadness(madness);
    this.updateMobName();
    this.respawn();
  },
  reset() {
    this.stopTimers();
    this.impactTimers.forEach(clearTimeout); this.impactTimers = [];
    clearTimeout(this.respawnTimer); this.respawnTimer = null;
    document.getElementById('hero').classList.remove('atk', 'hurt', 'lunge', 'lunge-go', 'lunge-back', 'dead');
    document.getElementById('mob').classList.remove('atk', 'hurt', 'lunge', 'lunge-go', 'lunge-back', 'dead');
    this.lungeDone = { hero: null, mob: null };
    const projectile = document.getElementById('skill-projectile');
    projectile.classList.remove('is-flying');
    projectile.style.removeProperty('--skill-scale');
    if (this.hero) { this.hero.mode = 'idle'; this.hero.i = 0; this.hero.attackState = null; }
    if (this.mob) { this.mob.mode = 'idle'; this.mob.i = 0; this.mob.attackState = null; }
    this.drawHero(); this.drawMob(); this.sync();
    this.updateMobName();
    const hp = this.mob && Number(this.mob.monster.stats && this.mob.monster.stats.HP);
    this.hp(1, hp > 0 ? hp : 1, hp > 0 ? hp : 1);
  },
  updateMobName() {
    const nameEl = document.getElementById('mob-name');
    if (nameEl) nameEl.textContent = this.mob
      ? (this.mob.madness ? CONFIG.GAME.DUNGEON.MADNESS.NAME_PREFIX : '') + this.mob.monster.name
      : '';
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
  play(who, mode, onImpact, onAnimationEnd) {  // chuyển sang hoạt ảnh tấn công từ khung đầu
    const o = this[who];
    if (!o) {
      if (onImpact) onImpact();
      if (onAnimationEnd) onAnimationEnd();
      return;
    }
    const continuing = mode === 'attack' && o.mode === 'attack' && o.attackState;
    let attack = continuing ? o.attackState : null;
    if (mode === 'attack') {
      if (!attack) attack = o.attackState = {
        impactCallbacks: [], animationCallbacks: [],
        skillFired: false, projectileArrived: false, animationDone: false, impactDone: false
      };
      if (onImpact) {
        if (attack.impactDone) {
          this.anim(who === 'hero' ? 'mob' : 'hero', 'hurt');
          onImpact();
        } else attack.impactCallbacks.push(onImpact);
      }
      if (onAnimationEnd) attack.animationCallbacks.push(onAnimationEnd);
    }
    if (this.reduced()) {
      o.mode = 'idle'; o.i = 0;
      who === 'hero' ? this.drawHero() : this.drawMob();
      if (mode === 'attack') this.finishAttack(who, attack);
      return;
    }
    if (continuing) return;
    clearTimeout(who === 'hero' ? this.heroTimer : this.mobTimer);
    if (who === 'hero') this.heroTimer = null; else this.mobTimer = null;
    o.mode = mode; o.i = 0;
    who === 'hero' ? this.drawHero() : this.drawMob();
    this.sync();
  },
  finishAttack(who, attack) {
    const actor = this[who];
    attack = attack || (actor && actor.attackState);
    if (!actor || !attack) return;
    if (this.isRanged(who)) {
      attack.animationDone = true;
      if (!attack.skillFired) this.fireSkill(who, attack);
      this.maybeDispatchImpact(who, attack);
    } else {
      attack.animationDone = true;
      this.dispatchImpact(who, attack);
    }
    const callbacks = attack.animationCallbacks.splice(0);
    callbacks.forEach(callback => callback());
    if (actor.attackState === attack) actor.attackState = null;
  },
  fireSkill(who, attack) {
    const actor = this[who];
    attack = attack || (actor && actor.attackState);
    if (!actor || !attack || attack.skillFired) return;
    attack.skillFired = true;
    if (this.castSkill(who)) {
      const timer = setTimeout(() => {
        this.impactTimers = this.impactTimers.filter(id => id !== timer);
        attack.projectileArrived = true;
        this.maybeDispatchImpact(who, attack);
      }, 240);
      this.impactTimers.push(timer);
    } else {
      attack.projectileArrived = true;
      this.maybeDispatchImpact(who, attack);
    }
  },
  maybeDispatchImpact(who, attack) {
    if (!attack.projectileArrived || (this.isRanged(who) && !attack.animationDone)) return;
    this.dispatchImpact(who, attack);
  },
  dispatchImpact(who, attack) {
    if (!attack || attack.impactDone) return;
    attack.impactDone = true;
    this.anim(who === 'hero' ? 'mob' : 'hero', 'hurt');
    const callbacks = attack.impactCallbacks.splice(0);
    callbacks.forEach(callback => callback());
  },
  isRanged(who) {
    const actor = who === 'hero' ? this.hero : this.mob;
    if (!actor) return false;
    if (who === 'hero') return actor.def.ranged;
    const monster = actor.monster;
    if (monster instanceof Monster) return monster.ranged;   // lớp Monster quyết định kiểu đánh
    const classKey = String(monster.Class || monster.class || '').split('_')[0].toLowerCase();   // đối thủ Ranked (object thường)
    return monster.attackStyle === 'ranged' || classKey === 'mage' || classKey === 'archer';
  },
  fx(correct, soFar, total, onImpact) {
    const who = correct ? 'hero' : 'mob';
    const melee = !this.reduced() && !this.isRanged(who);
    return new Promise(resolve => {
      let impacted = false, animationEnded = false;
      const complete = () => { if (impacted && animationEnded) resolve(); };
      this.play(who, 'attack', () => {
        try {
          if (onImpact) onImpact();
        } finally {
          impacted = true; complete();
        }
      }, () => {
        animationEnded = true; complete();
        const back = this.lungeDone[who]; this.lungeDone[who] = null; if (back) back();
      });
      if (melee) this.meleeLunge(who, done => { this.lungeDone[who] = done; });
    });
  },
  // Nhân vật/quái cận chiến (class Warrior): lao tới trong lúc chạy các khung tấn công, GIỮ vị trí tới khung cuối, rồi mới lướt về.
  // `register` nhận hàm lướt-về để gọi khi hoạt ảnh kết thúc (class lunge-go → lunge-back; hero sang phải, mob sang trái).
  meleeLunge(who, register) {
    const actor = who === 'hero' ? this.hero : this.mob;
    if (!actor) return;
    const e = document.getElementById(who);
    const frames = (who === 'hero' ? actor.def.attack : actor.monster.sprites.attack).frames.length;
    e.classList.remove('lunge-back'); void e.offsetWidth;
    e.style.setProperty('--lunge-ms', frames * 80 + 'ms');
    e.classList.add('lunge-go');
    register(() => {
      e.classList.remove('lunge-go'); void e.offsetWidth;
      e.classList.add('lunge-back');
      e.addEventListener('animationend', () => e.classList.remove('lunge-back'), { once: true });
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
    const endY = startY;
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
