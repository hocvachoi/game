// RỚT VẬT PHẨM / VÀNG / CRYSTAL (v5.27) — một quy tắc chung cho ẢI và HẦM NGỤC: mỗi quái bị hạ → duyệt TẤT CẢ mục trong `reward.drops`, MỖI MỤC ROLL RIÊNG
// (không có tỉ lệ chung, không dừng ở mục đầu tiên trúng) nên một quái có thể rớt nhiều thứ. Mỗi ải/hầm ngục khai báo tỉ lệ riêng trong world.json:
//   { "itemId": "brave_sword", "chance": 0.02 }                         trang bị: chance 0..1 mỗi quái (khuyến nghị 3–4 món mỗi ải/hầm ngục)
//   { "itemId": "gold",        "chance": 0.30, "min": 20, "max": 40 }   Vàng: rớt một số nguyên ngẫu nhiên min..max
//   { "itemId": "crystal",     "chance": 0.01, "amount": 1 }            Crystal: rớt `amount`
// ("gold" và "crystal" là id dành riêng; có thể khai báo nhiều mục gold/crystal trong cùng một ải, mỗi mục roll riêng. Cách cũ `reward.gold` / `reward.crystal` vẫn chạy.)
// Hầm ngục nhân thêm hệ số tầng (CONFIG.dungeonScale) cho tỉ lệ TRANG BỊ (không nhân Vàng/Crystal). Kết quả chỉ gom trong lượt; Player.runSave ghi MỘT lần.
const Drops = {
  MAX_ITEMS_WARN: 4,
  CURRENCY: ['gold', 'crystal'],
  entries(reward) {   // danh sách mục rớt: drops[] + (tương thích) reward.gold / reward.crystal
    const list = Array.isArray(reward && reward.drops) ? [...reward.drops] : [];
    if (reward && reward.gold) list.push({ itemId: 'gold', ...reward.gold });
    if (reward && reward.crystal) list.push({ itemId: 'crystal', ...reward.crystal });
    return list;
  },
  // owned(id) = số bản đang có + đã nhặt trong lượt (để loại món đã đạt CONFIG.STACK_MAX). Trả về { items: [id…], gold, crystals }.
  roll(reward, { scale = 1, owned = () => 0, hasItem = () => true } = {}) {
    const out = { items: [], gold: 0, crystals: 0 };
    if (!reward) return out;
    const extra = {};
    for (const d of this.entries(reward)) {
      const chance = Number(d.chance) || 0;
      if (d.itemId === 'gold') {
        if (Math.random() < Math.min(1, Math.max(0, chance))) {
          const lo = Math.max(0, Math.floor(Number(d.min) || 0)), hi = Math.max(lo, Math.floor(Number(d.max) || lo));
          out.gold += lo + Math.floor(Math.random() * (hi - lo + 1));
        }
      } else if (d.itemId === 'crystal') {
        if (Math.random() < Math.min(1, Math.max(0, chance))) out.crystals += Math.max(0, Math.floor(Number(d.amount) || 1));
      } else {
        const p = Math.min(1, Math.max(0, chance * scale));
        if (!p || !hasItem(d.itemId) || owned(d.itemId) + (extra[d.itemId] || 0) >= CONFIG.STACK_MAX) continue;
        if (Math.random() < p) { out.items.push(d.itemId); extra[d.itemId] = (extra[d.itemId] || 0) + 1; }   // mỗi món một lần roll riêng
      }
    }
    return out;
  },
  // Kiểm tra dữ liệu ở Console (không chặn game): gọi khi nạp world.json. label = vd "world2 Ải 7".
  validate(reward, label) {
    if (!reward) return;
    const warn = msg => console.warn(`Rớt vật phẩm — ${label}: ${msg}`), list = this.entries(reward), ids = new Set();
    const items = list.filter(d => !this.CURRENCY.includes(d.itemId));
    if (items.length > this.MAX_ITEMS_WARN) warn(`có ${items.length} trang bị (khuyến nghị tối đa ${this.MAX_ITEMS_WARN}).`);
    list.forEach(d => {
      if (!(Number(d.chance) >= 0 && Number(d.chance) <= 1)) warn(`chance của "${d.itemId}" phải từ 0 đến 1.`);
      if (d.itemId === 'gold' && !(Number(d.min) >= 0 && Number(d.max) >= Number(d.min))) warn('mục gold cần min ≥ 0 và max ≥ min.');
      if (d.itemId === 'crystal' && !(Number(d.amount) >= 1)) warn('mục crystal cần amount ≥ 1.');
      if (!this.CURRENCY.includes(d.itemId)) { if (ids.has(d.itemId)) warn(`món "${d.itemId}" bị khai báo trùng.`); ids.add(d.itemId); }
    });
  },
  // Tóm tắt tỉ lệ để người soạn dữ liệu đối chiếu: "brave_sword 2% · Gold 30% (20–40) · Crystal 1% (+1)".
  describe(reward, scale = 1) {
    const pct = p => `${Math.round(p * 10000) / 100}%`;
    return this.entries(reward).map(d => d.itemId === 'gold' ? `Gold ${pct(d.chance || 0)} (${d.min}–${d.max})`
      : d.itemId === 'crystal' ? `Crystal ${pct(d.chance || 0)} (+${d.amount || 1})` : `${d.itemId} ${pct((Number(d.chance) || 0) * scale)}`).join(' · ');
  }
};
