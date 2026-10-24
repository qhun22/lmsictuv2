document.addEventListener('DOMContentLoaded', () => {
  const accessReason = new URLSearchParams(window.location.search).get('access');
  if (accessReason === 'revoked' && typeof window.warningToast === 'function') {
    window.warningToast(
      'Quyền làm bài đã bị thu hồi',
      'Bạn không còn nằm trong danh sách KeyUsername của bài thi này.',
    );
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  const noticeKey = 'qhun22_home_setup_notice_dismissed_at_v1';
  const oneHour = 60 * 60 * 1000;
  const dismissedAt = Number(localStorage.getItem(noticeKey) || 0);
  const overlay = document.getElementById('home-notice-overlay');
  const notice = document.getElementById('home-notice');
  const closeButton = document.getElementById('home-notice-close');
  const okButton = document.getElementById('home-notice-ok');
  const snoozeButton = document.getElementById('home-notice-snooze');

  if (!notice || !overlay) return;

  // Mỗi lần vào home: chưa đóng HOẶC đã quá 1h kể từ lần đóng trước → hiện
  if (Date.now() - dismissedAt >= oneHour) {
    notice.hidden = false;
    overlay.hidden = false;
    requestAnimationFrame(() => {
      overlay.classList.add('is-visible');
      notice.classList.add('is-visible');
    });
  }

  const hideNotice = () => {
    overlay.classList.remove('is-visible');
    notice.classList.remove('is-visible');
    setTimeout(() => {
      overlay.hidden = true;
      notice.hidden = true;
    }, 250);
  };

  // Đóng vĩnh viễn (xóa localStorage)
  const dismissForever = () => {
    localStorage.removeItem(noticeKey);
    hideNotice();
  };

  // Đóng 1 giờ
  const snoozeOneHour = () => {
    localStorage.setItem(noticeKey, String(Date.now()));
    hideNotice();
  };

  closeButton?.addEventListener('click', dismissForever, { once: true });
  okButton?.addEventListener('click', dismissForever, { once: true });
  snoozeButton?.addEventListener('click', snoozeOneHour, { once: true });
});
