// THẺ MUA / BÁN vật phẩm (thay cho hộp thoại confirm): lớp phủ + thẻ giữa màn hình (máy tính) hoặc trượt từ đáy màn hình (điện thoại).
// ItemSheet.open({ mode: 'buy' | 'sell', item, price: { gold, gem }, onConfirm: async () => {...}, onDone }): hiện icon + tên + chỉ số + hiệu ứng,
// số lượng đang có, giá (mua) hoặc tiền nhận được (bán), số dư; nút Hủy / Xác nhận. Lỗi trả về từ onConfirm hiện ngay trong thẻ.
const ItemSheet = {
  node: null,
  close() {
    if (!this.node) return;
    document.removeEventListener('keydown', this.onKey);
    this.node.remove(); this.node = null;
  },
  onKey(e) { if (e.key === 'Escape') ItemSheet.close(); },
  money(p) {
    const parts = [];
    if (p.gold > 0 || p.gem <= 0) parts.push(`${p.gold.toLocaleString('vi-VN')} Gold`);
    if (p.gem > 0) parts.push(`${p.gem} Crystal`);
    return parts.join(' + ');
  },
  open({ mode, item, price, onConfirm, onDone }) {
    this.close();
    const buy = mode === 'buy', d = Player.data, q = CONFIG.quality(item.quality), have = Player.count(item.id);
    const back = el('div', 'sheet-backdrop'), card = el('div', 'sheet-card');
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-label', `${buy ? 'Mua' : 'Bán'} ${item.name}`);
    card.style.setProperty('--q', q.color);
    back.onclick = e => { if (e.target === back) this.close(); };

    const head = el('div', 'sheet-head'), names = el('div', 'sheet-names');
    names.append(el('b', 'sheet-name', item.name), Inventory.qualityBadge(item),
      el('p', 'sheet-sub', `${Inventory.slotName(item.slot)} · ${Player.classLabel(item)}`));
    head.append(Inventory.icon(item), names);
    const rows = [head, el('p', 'sheet-stats', Inventory.bonusText(item))];
    const effect = Inventory.effectText(item);
    if (effect) rows.push(el('p', 'sheet-effect', `Hiệu ứng: ${effect}`));
    rows.push(el('p', 'sheet-have', `Đang có: ${have}/${CONFIG.STACK_MAX}`));
    const priceRow = el('div', 'sheet-price');
    priceRow.append(el('span', '', buy ? 'Giá mua' : 'Bạn nhận'), el('b', '', this.money(price)));
    rows.push(priceRow);
    rows.push(el('p', 'sheet-balance', `Số dư: ${d.gold.toLocaleString('vi-VN')} Gold · ${d.crystals} Crystal`));
    const msg = el('p', 'sheet-msg'); msg.setAttribute('role', 'status');
    const cancel = el('button', 'btn ghost', 'Hủy'), ok = el('button', 'btn', buy ? 'Mua' : 'Bán');
    cancel.type = ok.type = 'button';
    cancel.onclick = () => this.close();
    const poor = buy && (d.gold < price.gold || d.crystals < price.gem);
    if (poor) { msg.textContent = `Không đủ tiền: cần ${this.money(price)}.`; msg.classList.add('is-error'); ok.disabled = true; }
    ok.onclick = async () => {
      if (Ui.busy) return;
      Ui.busy = true; ok.disabled = cancel.disabled = true; msg.className = 'sheet-msg'; msg.textContent = 'Đang xử lý…';
      try { await onConfirm(); this.close(); if (onDone) onDone(); }
      catch (e) { msg.textContent = e.message || 'Không thực hiện được. Vui lòng thử lại.'; msg.classList.add('is-error'); ok.disabled = poor; cancel.disabled = false; }
      finally { Ui.busy = false; }
    };
    const actions = el('div', 'sheet-actions'); actions.append(cancel, ok);
    card.append(...rows, msg, actions);
    back.append(card); document.body.append(back);
    this.node = back; document.addEventListener('keydown', this.onKey);
    (poor ? cancel : ok).focus();
  }
};
