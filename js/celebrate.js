// HIỆU ỨNG CHÚC MỪNG khi đạt mốc cấp 100: pháo hoa giấy toàn màn hình + biểu ngữ.
const Celebrate = {
  levelMilestone(reward) {
    if (document.getElementById('celebrate')) return;
    const box = el('div', 'celebrate');
    box.id = 'celebrate'; box.setAttribute('role', 'alert');
    const card = el('div', 'celebrate-card');
    card.append(el('p', 'celebrate-kicker', '🎉 CHÚC MỪNG! 🎉'), el('h2', '', `Bạn đã đạt CẤP ${reward.levelMilestone}!`),
      el('p', '', 'Bạn đã chinh phục thêm một mốc cấp độ!'), el('p', 'celebrate-gift', `Quà tặng: +${reward.levelBonusCrystals.toLocaleString('vi-VN')} Crystal`), el('p', 'celebrate-hint', 'Chạm để đóng'));
    const close = () => { cancelAnimationFrame(this.raf); clearTimeout(this.timer); box.remove(); };
    box.onclick = close;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) box.append(this.confetti());
    box.append(card); document.body.append(box);
    this.timer = setTimeout(close, 12000);
  },
  confetti() {
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    canvas.className = 'celebrate-canvas';
    const fit = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    fit(); window.addEventListener('resize', fit);
    const colors = ['#F5D68C', '#D8B65D', '#ff6b6b', '#6bd6ff', '#9dff8a', '#d79bff'];
    const bits = Array.from({ length: 180 }, () => ({
      x: Math.random() * canvas.width, y: -Math.random() * canvas.height, w: 6 + Math.random() * 8, h: 8 + Math.random() * 10,
      vx: -1.5 + Math.random() * 3, vy: 2 + Math.random() * 4, rot: Math.random() * 6.28, vr: -0.2 + Math.random() * 0.4, color: colors[Math.floor(Math.random() * colors.length)]
    }));
    const start = performance.now();
    const frame = now => {
      if (!canvas.isConnected) { window.removeEventListener('resize', fit); return; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      bits.forEach(b => {
        b.x += b.vx; b.y += b.vy; b.rot += b.vr; b.vy += 0.03;
        if (b.y > canvas.height + 20 && now - start < 6000) { b.y = -20; b.x = Math.random() * canvas.width; b.vy = 2 + Math.random() * 3; }
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot); ctx.fillStyle = b.color; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.restore();
      });
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
    return canvas;
  }
};
