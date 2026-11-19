// Màn Cửa hàng (UI mô tả trong Shop_UI.png): TRÁI = danh mục vật phẩm theo ô trang bị (có thẻ lọc/Tag), PHẢI = túi đồ + tiền.
// Mỗi thẻ vật phẩm (100×170, xếp dọc) hiển thị: khung icon theo phẩm chất, tên và nút Mua (bấm → thẻ mua có giá, xem js/item-sheet.js); chỉ số, hiệu ứng, nghề dùng được xem ở tooltip khi rê chuột. Mua hàng kiểm tra số dư/giá
// trong transaction (Plan mục 10.3); Rules là chốt cuối.
const Shop = {
  tag: 'all',          // 'all' hoặc id ô trang bị
  onlyUsable: true,    // chỉ hiện đồ dùng được với nghề đang chọn

  open() { this.render(); show('screen-shop'); },
  msg(text, err) { Ui.msg('shop-msg', text, err); },

  // Giá rút gọn trên nút: Gold dạng 10K / 1.5K / 2M, rồi " / " số Crystal (nếu có). Không dùng icon. Vd 10000G + 15 Crystal → "10K / 15".
  priceLabel(it) {
    const k = n => n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n);
    return it.gemPrice > 0 ? `${k(it.price)} / ${it.gemPrice}` : k(it.price);
  },
  // Thẻ gọn: icon (khung theo phẩm chất) + tên + nút Mua. Chỉ số/hiệu ứng/nghề xem bằng tooltip khi rê chuột (Tip, js/inventory.js).
  card(it) {
    const d = Player.data, q = CONFIG.quality(it.quality);
    const owned = Player.count(it.id) > 0, usable = Player.usable(it), dropOnly = it.dropOnly;
    const poor = d.gold < it.price || d.crystals < it.gemPrice;
    const card = el('article', 'shop-item' + (owned ? ' is-owned' : '') + (usable ? '' : ' is-dim'));
    card.style.setProperty('--q', q.color);
    card.tabIndex = 0;
    Tip.attach(card, it);
    // Thẻ 100×170 xếp DỌC: icon (khung theo phẩm chất) → tên → nút "Mua". Bấm Mua mở THẺ MUA (ItemSheet) có giá + số dư để xác nhận.
    // Đã sở hữu (kể cả khi đang có nhiều bản) thì không mua được nữa: chỉ nhận thêm từ phần thưởng rơi trong game.
    const buy = el('button', 'btn buy' + (poor && !owned ? ' is-poor' : ''), owned ? 'Đã có' : dropOnly ? 'Chỉ rơi' : this.priceLabel(it));
    buy.type = 'button'; buy.disabled = owned || dropOnly;
    buy.title = owned || dropOnly ? '' : `Giá: ${it.price.toLocaleString('vi-VN')} Gold${it.gemPrice > 0 ? ` + ${it.gemPrice} Crystal` : ''}`;
    buy.setAttribute('aria-label', owned ? `${it.name}: đã sở hữu` : `Mua ${it.name}, giá ${it.price} Gold${it.gemPrice > 0 ? ` và ${it.gemPrice} Crystal` : ''}`);
    buy.onclick = () => ItemSheet.open({ mode: 'buy', item: it, price: { gold: it.price, gem: it.gemPrice }, onConfirm: () => Player.buy(it.id),
      onDone: () => { this.render(); this.msg(`Đã mua ${it.name}.`, false); } });
    card.append(Inventory.icon(it), el('h3', '', it.name), buy);
    return card;
  },

  render() {
    Tip.hide();
    const d = Player.data;
    Player.fillTopBar('shop');
    Inventory.tagBar($('#shop-tags'), this.tag, id => { this.tag = id; this.render(); });
    const toggle = el('button', 'tag toggle' + (this.onlyUsable ? ' is-on' : ''), `Chỉ đồ dùng được: ${this.onlyUsable ? 'BẬT' : 'TẮT'}`);
    toggle.type = 'button';
    toggle.onclick = () => { this.onlyUsable = !this.onlyUsable; this.render(); };
    $('#shop-tags').append(toggle);

    const list = $('#shop-list'), sections = [];
    CONFIG.SLOTS.filter(slot => this.tag === 'all' || slot.id === this.tag).forEach(slot => {
      const items = CONFIG.ITEMS.filter(it => it.slot === slot.id && (!this.onlyUsable || Player.usable(it)))
        .sort((a, b) => (a.price - b.price) || (a.gemPrice - b.gemPrice));
      if (!items.length) return;
      const section = el('section', 'shop-section');
      section.append(el('h2', 'ribbon', slot.name));
      const grid = el('div', 'shop-grid');
      grid.append(...items.map(it => this.card(it)));
      section.append(grid);
      sections.push(section);
    });
    list.replaceChildren(...(sections.length ? sections : [el('p', 'bag-empty', 'Không có vật phẩm phù hợp bộ lọc. Thử tắt "Chỉ đồ dùng được".')]));

    // túi đồ bên phải
    const bag = $('#shop-bag'), owned = d.inventory.map(id => Player.item(id)).filter(Boolean);
    bag.replaceChildren(...(owned.length ? owned.map(it => Inventory.tile(it, { worn: d.equip[it.slot] === it.id, onSell: () => Inventory.sell(it, 'shop-msg', () => this.render()) })) : [el('p', 'bag-empty', 'Túi đồ trống.')]));
    $('#shop-count').textContent = `${owned.length} loại · ${Object.values(d.stock).reduce((a, b) => a + b, 0)} vật phẩm`;
  }
};
