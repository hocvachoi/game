// Quái vật của từng ải. Mỗi quái vật nằm trong assets/monsters/<key>/<key>.json (nguồn dữ liệu chuẩn).
// stage_monster.json chỉ ánh xạ Stage_i -> key; quái trong Dungeon do world.json (dungeon_monsters) quy định.
const StageMonster = {
  FALLBACK: Monster.create({ key: 'undead_knight', Class: 'Warrior', name: 'Undead Knight', type: 'Epic',
    stats: { HP: 200, ATK: 20, DEF: 10, CRIT: 0 },
    sprites: {
      idle: { src: 'assets/monsters/undead_knight/undead_knight_idle.png', frameW: 256, frameH: 202, frames: [0, 1, 2, 3, 4, 5] },
      attack: { src: 'assets/monsters/undead_knight/undead_knight_animation.png', frameW: 256, frameH: 202, frames: [4, 5, 6, 7, 8, 9, 10, 11] }
    } }),
  monsters: {}, map: { default: 'undead_knight', worlds: {} }, ready: null,

  validate(data) {
    const num = v => Number.isFinite(v) && v >= 0;
    return Boolean(data) && typeof data.name === 'string' && data.name.trim()
      && data.stats && num(data.stats.HP) && data.stats.HP > 0 && num(data.stats.ATK) && num(data.stats.DEF)
      && (data.stats.CRIT === undefined || num(data.stats.CRIT))
      && (data.ANSWER_TIMEOUT_SEC === undefined || (Number.isFinite(data.ANSWER_TIMEOUT_SEC) && data.ANSWER_TIMEOUT_SEC > 0))
      && data.sprites && Character.validSheet(data.sprites.idle) && Character.validSheet(data.sprites.attack);
  },
  fetchMonster(key) {
    if (!/^[A-Za-z0-9_-]+$/.test(String(key))) return Promise.resolve();
    return fetch(`assets/monsters/${key}/${key}.json`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(data => {
        if (!this.validate(data)) throw new Error('JSON quái vật không hợp lệ');
        this.monsters[key] = Monster.create({ ...data, key, stats: { CRIT: 0, ...data.stats } });
      })
      .catch(e => console.warn(`Không tải được quái vật "${key}" (assets/monsters/${key}/${key}.json):`, e.message || e));
  },
  // Mọi key quái vật cần dùng: mặc định + stage_monster.json + dungeon_monsters trong world.json.
  keys() {
    const set = new Set([this.map.default]);
    Object.values(this.map.worlds).forEach(w => Object.values(w || {}).forEach(k => set.add(k)));
    CONFIG.WORLDS.forEach(w => w.dungeons.forEach(d => (d.monsters || []).forEach(k => set.add(k))));
    return [...set];
  },
  load() {
    if (!this.ready) {
      this.ready = fetch('assets/monsters/stage_monster.json')
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(m => { this.map = { default: m.default || 'undead_knight', worlds: m.worlds || {} }; })
        .catch(e => console.warn('Không tải được stage_monster.json, dùng quái vật mặc định:', e))
        .then(() => Promise.all(this.keys().map(k => this.fetchMonster(k))));
    }
    return this.ready;
  },
  // Tốc độ tấn công của quái = ANSWER_TIMEOUT_SEC trong <monster_key>.json; thiếu thì dùng CONFIG.GAME.ANSWER_TIMEOUT_SEC.
  attackInterval(monster) {
    const v = Number(monster && monster.ANSWER_TIMEOUT_SEC);
    return Number.isFinite(v) && v > 0 ? v : CONFIG.GAME.ANSWER_TIMEOUT_SEC;
  },
  get(key) { return this.monsters[key] || this.monsters[this.map.default] || this.FALLBACK; },
  // world: object trong CONFIG.WORLDS; stage: Stage_i (có stage.key)
  forStage(world, stage) {
    return this.get((this.map.worlds[world.folder] || {})[stage.key] || this.map.default);
  },
  // Quái cho một TẦNG của hầm ngục số `dungeonIndex`: ngẫu nhiên trong pool theo phẩm chất của tầng (CONFIG.dungeonTier); thiếu thì ưu tiên phẩm chất cao hơn nếu ngang khoảng cách.
  forFloor(pool, floor, dungeonIndex) {
    const order = CONFIG.GAME.DUNGEON.ORDER, want = order.indexOf(CONFIG.dungeonTier(floor, dungeonIndex));
    for (let d = 0; d < order.length; d++) {
      for (const i of d ? [want + d, want - d] : [want]) {
        const same = i >= 0 && i < order.length ? pool.filter(m => m.quality === order[i]) : [];
        if (same.length) return same[Math.floor(Math.random() * same.length)];
      }
    }
    return pool[Math.floor(Math.random() * pool.length)];
  },
  // Các quái có thể xuất hiện trong một dungeon (bỏ key chưa có JSON); rỗng thì dùng quái mặc định.
  poolFor(world, dungeon) {
    const pool = (dungeon.monsters || []).filter(k => this.monsters[k]).map(k => this.monsters[k]);
    return pool.length ? pool : [this.get(this.map.default)];
  }
};
