/**
 * ============================================================================
 * CONFIRM DIALOG — module
 * ============================================================================
 * Confirm dialog đồng bộ style với toast & modal của hệ thống.
 * Thay thế window.confirm() mặc định của trình duyệt.
 *
 *   await showConfirm({
 *       title:   'Xóa môn học?',
 *       message: 'Hành động này không thể hoàn tác.',
 *       type:    'danger',           // 'danger' | 'warning' | 'info' | 'success'
 *       confirmLabel: 'Xóa',
 *       cancelLabel:  'Hủy',
 *   })
 *   // -> true nếu user xác nhận, false nếu hủy
 *
 * Shortcuts:
 *   confirmDanger(title, message) — nút confirm đỏ
 *   confirmWarning(title, message)
 *   confirmInfo(title, message)
 * ============================================================================
 */
(function () {
  'use strict';

  /* ============================================================
     1. ICONS (SVG inline - giống toast.js)
     ============================================================ */
  var ICONS = {
    danger:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="3 6 5 6 21 6"></polyline>' +
      '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>' +
      '<path d="M10 11v6M14 11v6"></path>' +
      '<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>',
    warning:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>' +
      '<line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    info:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="10"></circle>' +
      '<line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
    success:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="20 6 9 17 4 12"></polyline></svg>',
  };

  /* ============================================================
     2. STATE
     ============================================================ */
  var activeOverlay = null;

  /**
   * Escape HTML.
   */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Hiển thị confirm dialog.
   * Trả về Promise<boolean>: true = xác nhận, false = hủy/ESC/click overlay.
   */
  function showConfirm(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var type = ['danger', 'warning', 'info', 'success'].indexOf(opts.type) >= 0
        ? opts.type
        : 'info';

      var title = opts.title || 'Xác nhận?';
      var message = opts.message || '';
      var detail = opts.detail || '';
      var confirmLabel = opts.confirmLabel || 'Xác nhận';
      var cancelLabel = opts.cancelLabel || 'Hủy';

      // Nếu có confirm khác đang mở → đóng confirm cũ, reject nó với false
      if (activeOverlay) {
        activeOverlay._resolve(false);
        activeOverlay._cleanup();
      }

      var overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      overlay.setAttribute('role', 'presentation');
      overlay.innerHTML =
        '<div class="confirm-dialog confirm--' + type + '" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title-' + Date.now() + '">' +
          '<div class="confirm__icon-wrap" aria-hidden="true">' + (ICONS[type] || ICONS.info) + '</div>' +
          '<div class="confirm__content">' +
            '<h3 class="confirm__title">' + escapeHtml(title) + '</h3>' +
            (message ? '<p class="confirm__message">' + escapeHtml(message) + '</p>' : '') +
            (detail ? '<p class="confirm__detail">' + escapeHtml(detail) + '</p>' : '') +
          '</div>' +
          '<div class="confirm__actions">' +
            '<button type="button" class="confirm__btn confirm__btn--cancel">' + escapeHtml(cancelLabel) + '</button>' +
            '<button type="button" class="confirm__btn confirm__btn--confirm" autofocus>' + escapeHtml(confirmLabel) + '</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);
      activeOverlay = overlay;

      requestAnimationFrame(function () {
        overlay.classList.add('is-visible');
      });

      var confirmBtn = overlay.querySelector('.confirm__btn--confirm');
      var cancelBtn = overlay.querySelector('.confirm__btn--cancel');

      function cleanup() {
        overlay.classList.remove('is-visible');
        var t = setTimeout(function () {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 220);
        document.removeEventListener('keydown', onKey, true);
        if (activeOverlay === overlay) activeOverlay = null;
      }

      function resolveAndClose(value) {
        overlay._resolve = function () {};
        cleanup();
        resolve(value);
      }

      function onKey(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          resolveAndClose(false);
        } else if (e.key === 'Enter' && document.activeElement === confirmBtn) {
          e.preventDefault();
          resolveAndClose(true);
        } else if (e.key === 'Tab') {
          // focus trap giữa 2 nút
          e.preventDefault();
          if (document.activeElement === confirmBtn) {
            cancelBtn.focus();
          } else {
            confirmBtn.focus();
          }
        }
      }

      overlay._resolve = resolveAndClose;
      overlay._cleanup = cleanup;

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) resolveAndClose(false);
      });
      cancelBtn.addEventListener('click', function () { resolveAndClose(false); });
      confirmBtn.addEventListener('click', function () { resolveAndClose(true); });

      document.addEventListener('keydown', onKey, true);

      // Focus confirm btn
      setTimeout(function () { confirmBtn.focus(); }, 50);
    });
  }

  // Shortcuts
  function makeShortcut(type) {
    return function (title, message, opts) {
      opts = opts || {};
      return showConfirm(Object.assign({}, opts, {
        type: type,
        title: title || '',
        message: message || '',
        confirmLabel: opts.confirmLabel || (type === 'danger' ? 'Xóa' : 'Xác nhận'),
      }));
    };
  }

  window.showConfirm = showConfirm;
  window.confirmDanger = makeShortcut('danger');
  window.confirmWarning = makeShortcut('warning');
  window.confirmInfo = makeShortcut('info');
})();