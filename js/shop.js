// Màn Cửa hàng (UI mô tả trong Shop_UI.png): TRÁI = danh mục vật phẩm theo ô trang bị (có thẻ lọc/Tag), PHẢI = túi đồ + tiền.
// Mỗi thẻ vật phẩm (170×170) hiển thị: khung icon theo phẩm chất (trái), tên và nút giá (phải); chỉ số, hiệu ứng, nghề dùng được xem ở tooltip khi rê chuột. Mua hàng kiểm tra số dư/giá
// trong transaction (Plan mục 10.3); Rules là chốt cuối.
const Shop = {
  tag: 'all',          // 'all' hoặc id ô trang bị
  onlyUsable: true,    // chỉ hiện đồ dùng được với nghề đang chọn

  open() { this.render(); show('screen-shop'); },
  msg(text, err) { Ui.msg('shop-msg', text, err); },

  // Thẻ gọn: icon (khung theo phẩm chất) + tên + nút giá. Chỉ số/hiệu ứng/nghề xem bằng tooltip khi rê chuột (Tip, js/inventory.js).
  card(it) {
    const d = Player.data, q = CONFIG.quality(it.quality);
    const owned = d.inventory.includes(it.id), usable = Player.usable(it);
    const poor = d.gold < it.price || d.crystals < it.gemPrice;
    const card = el('article', 'shop-item' + (owned ? ' is-owned' : '') + (usable ? '' : ' is-dim'));
    card.style.setProperty('--q', q.color);
    card.tabIndex = 0;
    Tip.attach(card, it);
    // Nút mua hiển thị SỐ TIỀN (không ghi chữ "Mua"); đã sở hữu thì ghi "Đã sở hữu".
    const buy = el('button', 'btn buy' + (poor && !owned ? ' is-poor' : ''));
    buy.type = 'button'; buy.disabled = owned || poor;
    if (owned) buy.textContent = 'Đã sở hữu';
    else {
      buy.append(el('span', 'coin gold', it.price.toLocaleString('vi-VN')));
      if (it.gemPrice > 0) buy.append(el('span', 'coin gem', String(it.gemPrice)));
    }
    buy.setAttribute('aria-label', owned ? `${it.name}: đã sở hữu` : `Mua ${it.name} giá ${it.price} Gold${it.gemPrice > 0 ? ` và ${it.gemPrice} Crystal` : ''}${poor ? ' (không đủ tiền)' : ''}`);
    buy.onclick = () => Ui.act('shop-msg', () => Player.buy(it.id), `Đã mua ${it.name}.`, () => this.render());
    // Bố cục 170×170: khung item-icon q-<phẩm chất> bên trái; tên + giá bên phải (phẩm chất đã thể hiện bằng khung nên không có q-badge)
    const info = el('div', 'shop-item-info');
    info.append(el('h3', '', it.name), buy);
    card.append(Inventory.icon(it), info);
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
    bag.replaceChildren(...(owned.length ? owned.map(it => Inventory.tile(it, { worn: d.equip[it.slot] === it.id })) : [el('p', 'bag-empty', 'Túi đồ trống.')]));
    $('#shop-count').textContent = `${owned.length} vật phẩm`;
  }
};
