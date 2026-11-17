// Lớp cơ sở của mọi nhân vật chơi được (OOP, Plan V3).
// Dữ liệu cụ thể (chỉ số gốc, EXP_scale, sprite, skill) nằm trong assets/characters/<key>/character.json;
// mỗi lớp nghề (Warrior / Archer / Mage) ở một file riêng, quy định kiểu đánh mặc định và dữ liệu bắt buộc.
class Character {
  constructor(key, name) {
    this.key = key;                       // tên thư mục, ví dụ 'Archer_F'
    this.name = name;                     // tên hiển thị tạm, được thay bằng "name" trong JSON khi nạp
    this.configUrl = `assets/characters/${key}/character.json`;
    this.baseStats = { HP: 100, ATK: 10, DEF: 5, CRIT: 0 };
    // EXP_scale trong JSON = [HP, ATK, DEF, CRIT] cộng thêm cho MỖI cấp từ cấp 2 trở đi.
    this.expScale = { HP: 0, ATK: 0, DEF: 0, CRIT: 0 };
    this.sprites = {};
    this.castSkill = null;
    this._attackStyle = null;
  }

  // ----- thuộc tính do lớp nghề quy định -----
  get classKey() { return 'character'; }          // khớp với mảng "class" của vật phẩm (không phân biệt hoa/thường)
  get defaultAttackStyle() { return 'melee'; }
  get needsSkill() { return this.defaultAttackStyle === 'ranged'; }

  get attackStyle() { return this._attackStyle || this.defaultAttackStyle; }
  get ranged() { return this.attackStyle === 'ranged'; }
  get idle() { return this.sprites.idle; }
  get attack() { return this.sprites.attack; }
  get skill() { return this.sprites.skill; }

  // ----- nạp & kiểm tra dữ liệu JSON -----
  static validSheet(sheet) {
    return Boolean(sheet) && typeof sheet.src === 'string' && sheet.src.length > 0
      && Number.isFinite(sheet.frameW) && Number.isFinite(sheet.frameH)
      && Array.isArray(sheet.frames) && sheet.frames.length > 0
      && sheet.frames.every(frame => Number.isInteger(frame) && frame >= 0);
  }
  static validPosition(p) {
    return Boolean(p) && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
  }
  // Trả về chuỗi lỗi, hoặc null nếu hợp lệ.
  validate(data) {
    const num = v => Number.isFinite(v) && v >= 0;
    if (!data || typeof data.name !== 'string' || !data.name.trim()) return 'thiếu "name"';
    const s = data.stats;
    if (!s || !['HP', 'ATK', 'DEF', 'CRIT'].every(k => num(s[k]))) return 'thiếu/sai stats HP, ATK, DEF, CRIT';
    if (!Array.isArray(s.EXP_scale) || s.EXP_scale.length !== 4 || !s.EXP_scale.every(num)) return 'EXP_scale phải là mảng 4 số [HP, ATK, DEF, CRIT]';
    if (!data.sprites || !Character.validSheet(data.sprites.idle) || !Character.validSheet(data.sprites.attack)) return 'thiếu/sai sprites.idle hoặc sprites.attack';
    if (this.needsSkill) {
      const cast = data.castSkill;
      if (!data.sprites.skill || typeof data.sprites.skill.src !== 'string') return 'nhân vật tầm xa cần sprites.skill.src';
      if (!cast || !Number.isInteger(cast.frame) || cast.frame < 0 || cast.frame >= data.sprites.attack.frames.length
        || !Character.validPosition(cast.origin) || !Character.validPosition(cast.target)) return 'castSkill không hợp lệ';
    }
    return null;
  }
  configure(data) {
    const error = this.validate(data);
    if (error) throw new Error(`Cấu hình nhân vật ${this.key} không hợp lệ: ${error}.`);
    const s = data.stats, [HP, ATK, DEF, CRIT] = s.EXP_scale;
    this.name = data.name.trim();
    this._attackStyle = data.attackStyle === 'ranged' || data.attackStyle === 'melee' ? data.attackStyle : null;
    this.baseStats = { HP: s.HP, ATK: s.ATK, DEF: s.DEF, CRIT: s.CRIT };
    this.expScale = { HP, ATK, DEF, CRIT };
    this.sprites = data.sprites;
    this.castSkill = this.needsSkill ? data.castSkill : null;
  }
  async load() {
    const response = await fetch(this.configUrl);
    if (!response.ok) throw new Error(`Không tải được ${this.configUrl} (${response.status}).`);
    this.configure(await response.json());
  }
  // Kiểm tra mọi ảnh sprite tồn tại (nhân vật thiếu ảnh sẽ không được đưa vào danh sách chọn).
  verifySprites() {
    const sources = Object.values(this.sprites).map(sheet => sheet && sheet.src).filter(Boolean);
    return Promise.all(sources.map(src => new Promise(resolve => {
      const image = new Image();
      image.onload = () => resolve(true);
      image.onerror = () => { console.warn(`Nhân vật ${this.key}: không tìm thấy ảnh ${src}`); resolve(false); };
      image.src = src;
    }))).then(results => results.every(Boolean));
  }

  // ----- chỉ số theo cấp (không lưu trên Firestore, chỉ lưu LV và EXP) -----
  statsAt(level) {
    const lv = Math.max(0, Math.floor(level) - 1), b = this.baseStats, g = this.expScale;
    return {
      HP: Math.round(b.HP + lv * g.HP),
      ATK: Math.round(b.ATK + lv * g.ATK),
      DEF: Math.round(b.DEF + lv * g.DEF),
      CRIT: Math.round((b.CRIT + lv * g.CRIT) * 10) / 10
    };
  }
}
