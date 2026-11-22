// CÀI ĐẶT (nút btn_setting cạnh Đăng xuất trên màn bản đồ): hộp thoại dùng chung kiểu .sheet-* của ItemSheet.
// Hiện có: ĐỔI MẬT KHẨU (Firebase Auth). Phải xác thực lại bằng mật khẩu hiện tại rồi mới đặt mật khẩu mới; không gửi mật khẩu lên Firestore.
const Settings = {
  node: null,
  close() {
    if (!this.node) return;
    document.removeEventListener('keydown', this.onKey);
    this.node.remove(); this.node = null;
  },
  onKey(e) { if (e.key === 'Escape') Settings.close(); },
  field(label, id, autocomplete) {
    const wrap = el('label', 'sheet-field'), input = el('input');
    input.type = 'password'; input.id = id; input.autocomplete = autocomplete; input.maxLength = 64; input.required = true;
    wrap.append(el('span', '', label), input);
    return { wrap, input };
  },
  errorText(error) {
    switch (error && error.code) {
      case 'auth/wrong-password':
      case 'auth/invalid-credential': return 'Mật khẩu hiện tại không đúng.';
      case 'auth/weak-password': return 'Mật khẩu mới cần có ít nhất 6 ký tự.';
      case 'auth/too-many-requests': return 'Bạn thử quá nhiều lần. Hãy chờ một lúc rồi thử lại.';
      case 'auth/requires-recent-login': return 'Phiên đăng nhập đã cũ. Hãy đăng xuất, đăng nhập lại rồi đổi mật khẩu.';
      case 'auth/network-request-failed': return 'Không có kết nối mạng. Vui lòng thử lại.';
      default: return (error && error.message) || 'Không đổi được mật khẩu. Vui lòng thử lại.';
    }
  },
  async changePassword(current, next) {
    if (!FirebaseService.configured) throw new Error(FirebaseService.errorMessage);
    const user = FirebaseService.auth.currentUser;
    if (!user || !user.email) throw new Error('Bạn chưa đăng nhập.');
    await user.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(user.email, current));
    await user.updatePassword(next);
  },
  open() {
    this.close();
    const back = el('div', 'sheet-backdrop'), card = el('form', 'sheet-card settings-card');
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-label', 'Cài đặt');
    card.noValidate = true;
    back.onclick = e => { if (e.target === back) this.close(); };
    const cur = this.field('Mật khẩu hiện tại', 'set-current', 'current-password');
    const nxt = this.field('Mật khẩu mới (ít nhất 6 ký tự)', 'set-new', 'new-password');
    const rep = this.field('Nhập lại mật khẩu mới', 'set-repeat', 'new-password');
    const msg = el('p', 'sheet-msg'); msg.setAttribute('role', 'status');
    const close = el('button', 'btn ghost', 'Đóng'), save = el('button', 'btn', 'Đổi mật khẩu');
    close.type = 'button'; save.type = 'submit';
    close.onclick = () => this.close();
    const say = (text, bad) => { msg.textContent = text; msg.classList.toggle('is-error', Boolean(bad)); msg.classList.toggle('is-ok', Boolean(text) && !bad); };
    card.onsubmit = async e => {
      e.preventDefault();
      if (!cur.input.value) return say('Hãy nhập mật khẩu hiện tại.', true);
      if (nxt.input.value.length < 6) return say('Mật khẩu mới cần có ít nhất 6 ký tự.', true);
      if (nxt.input.value === cur.input.value) return say('Mật khẩu mới phải khác mật khẩu hiện tại.', true);
      if (nxt.input.value !== rep.input.value) return say('Hai lần nhập mật khẩu mới không khớp.', true);
      save.disabled = close.disabled = true; say('Đang xử lý…');
      try {
        await this.changePassword(cur.input.value, nxt.input.value);
        cur.input.value = nxt.input.value = rep.input.value = '';
        say('Đã đổi mật khẩu. Hãy dùng mật khẩu mới ở lần đăng nhập sau.');
      } catch (error) { say(this.errorText(error), true); }
      finally { save.disabled = close.disabled = false; }
    };
    const actions = el('div', 'sheet-actions'); actions.append(close, save);
    card.append(el('b', 'sheet-name', 'Cài đặt'), el('p', 'sheet-have', typeof PlayTime !== 'undefined' ? PlayTime.summary() : ''), el('p', 'sheet-sub', 'Đổi mật khẩu'), cur.wrap, nxt.wrap, rep.wrap, msg, actions);
    back.append(card); document.body.append(back);
    this.node = back; document.addEventListener('keydown', this.onKey);
    cur.input.focus();
  }
};
