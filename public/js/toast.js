/**
 * ============================================================================
 * TOAST NOTIFICATION - module
 * ============================================================================
 * Cung cấp:
 *
 *   showToast({
 *       title: 'Lỗi',
 *       message: 'Hiện tại đang bị lỗi',
 *       type: 'error',           // 'success' | 'error' | 'warning' | 'info'
 *       duration: 4000           // ms; 0 = mặc định theo type; -1 = không tự đóng
 *   });
 *
 * Đặc tính:
 *   - Vị trí: top-right (xem CSS).
 *   - Nhiều toast chồng dọc.
 *   - Hover → pause countdown + progress bar; rời chuột → tiếp tục.
 *   - Click [x] → đóng ngay.
 *   - Tự đọc `window.__TOAST_FLASH__` (do PHP partial render) sau khi redirect.
 * ============================================================================
 */
(function () {
    'use strict';

    /* ============================================================
       1. CONFIG
       ============================================================ */
    var DEFAULT_DURATION = {
        success: 5000,
        error:   5000,
        warning: 5000,
        info:    5000,
        general: 5000
    };
    var ALLOWED_TYPES = ['success', 'error', 'warning', 'info', 'general'];

    /* ============================================================
       2. ICONS (SVG inline - không phụ thuộc icon font)
       ============================================================ */
    var ICONS = {
        success:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<polyline points="20 6 9 17 4 12"></polyline></svg>',
        error:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
        warning:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>' +
            '<line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
        info:
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
    };

    /* ============================================================
       3. STATE
       ============================================================ */
    var stack = null;   // DOM container
    var counter = 0;    // để tạo id duy nhất

    /**
     * Escape HTML an toàn trước khi chèn vào DOM (title/message có thể từ PHP).
     */
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getStack() {
        if (stack) return stack;
        stack = document.getElementById('toast-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'toast-stack';
            stack.className = 'toast-stack';
            stack.setAttribute('role', 'region');
            stack.setAttribute('aria-label', 'Thông báo');
            document.body.appendChild(stack);
        }
        return stack;
    }

    /**
     * Tạo 1 element toast, set countdown + progress, return ref.
     */
    function createToast(opts) {
        var type = (ALLOWED_TYPES.indexOf(opts.type) >= 0) ? opts.type : 'general';
        var title = opts.title || 'Thông báo';
        var message = opts.message || '';

        // duration: -1 = không tự đóng; 0 = mặc định; >0 = custom
        var duration;
        if (opts.duration === -1) {
            duration = -1;
        } else if (typeof opts.duration === 'number' && opts.duration > 0) {
            duration = opts.duration;
        } else {
            duration = DEFAULT_DURATION[type] || DEFAULT_DURATION.general || 5000;
        }

        var el = document.createElement('div');
        el.className = 'toast toast--' + type;
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.dataset.toastId = String(++counter);

        // Header
        var header = document.createElement('div');
        header.className = 'toast__header';

        var titleEl = document.createElement('h6');
        titleEl.className = 'toast__title';

        var iconWrap = document.createElement('span');
        iconWrap.className = 'toast__icon';
        iconWrap.innerHTML = ICONS[type] || ICONS.info;
        iconWrap.setAttribute('aria-hidden', 'true');

        var titleText = document.createElement('span');
        titleText.textContent = title;

        titleEl.appendChild(iconWrap);
        titleEl.appendChild(titleText);

        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'toast__close';
        closeBtn.setAttribute('aria-label', 'Đóng thông báo');
        closeBtn.innerHTML = '&times;';

        header.appendChild(titleEl);
        header.appendChild(closeBtn);

        // Body
        var body = document.createElement('p');
        body.className = 'toast__message';
        body.textContent = message;

        // Progress bar
        var progress = document.createElement('div');
        progress.className = 'toast__progress';
        progress.setAttribute('aria-hidden', 'true');

        el.appendChild(header);
        el.appendChild(body);
        el.appendChild(progress);

        getStack().appendChild(el);

        // ---- Countdown & progress ----------------------------------
        var remaining = duration;
        var total = duration;
        var pausedAt = null;
        var rafId = null;
        var closed = false;

        function close() {
            if (closed) return;
            closed = true;
            if (rafId) cancelAnimationFrame(rafId);
            el.classList.remove('is-visible');
            el.classList.add('is-leaving');
            var doneTimer = setTimeout(function () {
                if (el.parentNode) el.parentNode.removeChild(el);
            }, 350);
            setTimeout(function () { clearTimeout(doneTimer); el.parentNode && el.parentNode.removeChild(el); }, 400);
        }

        function tick(now) {
            if (closed || duration === -1) return;

            if (pausedAt !== null) {
                rafId = requestAnimationFrame(tick);
                return;
            }

            if (!tick.lastTime) {
                tick.lastTime = now;
            }

            var delta = now - tick.lastTime;
            tick.lastTime = now;
            remaining = Math.max(0, remaining - delta);

            if (total > 0) {
                var pct = Math.max(0, Math.min(1, remaining / total));
                progress.style.transform = 'scaleX(' + pct + ')';
            }

            if (remaining <= 0) {
                close();
                return;
            }

            rafId = requestAnimationFrame(tick);
        }

        function onMouseEnter() {
            if (closed || duration === -1) return;
            if (pausedAt !== null) return;
            pausedAt = performance.now();
            el.classList.add('is-paused');
            if (rafId) cancelAnimationFrame(rafId);
        }

        function onMouseLeave() {
            if (closed || duration === -1) return;
            if (pausedAt === null) return;
            var pauseMs = performance.now() - pausedAt;
            pausedAt = null;
            tick.lastTime = performance.now() - pauseMs;
            el.classList.remove('is-paused');
            rafId = requestAnimationFrame(tick);
        }

        el.addEventListener('mouseenter', onMouseEnter);
        el.addEventListener('mouseleave', onMouseLeave);
        closeBtn.addEventListener('click', function () { close(); });

        requestAnimationFrame(function () {
            el.classList.add('is-visible');
        });

        if (duration !== -1) {
            tick.lastTime = performance.now();
            rafId = requestAnimationFrame(tick);
        }

        return { element: el, close: close };
    }

    /* ============================================================
       4. PUBLIC API
       ============================================================ */
    function showToast(opts) {
        opts = opts || {};
        return createToast(opts);
    }

    // Alias tiện: successToast, errorToast, ...
    function makeShortcut(type) {
        return function (title, message, duration) {
            return showToast({
                type: type,
                title: title || '',
                message: message || '',
                duration: typeof duration === 'number' ? duration : 0
            });
        };
    }
    window.successToast = makeShortcut('success');
    window.errorToast   = makeShortcut('error');
    window.warningToast = makeShortcut('warning');
    window.infoToast    = makeShortcut('info');

    window.showToast = showToast;

    /* ============================================================
       5. FLASH FROM PHP (tự chạy sau khi DOM sẵn sàng)
       ------------------------------------------------------------
       Khi 1 trang PHP render xong, file include partial đặt 1 biến:
           window.__TOAST_FLASH__ = [{type, title, message, duration_ms}, ...]
       Module sẽ tự đọc + hiển thị từng toast theo thứ tự, cách nhau 200ms.
       ============================================================ */
    function consumeFlash() {
        var flash = window.__TOAST_FLASH__;
        if (!Array.isArray(flash) || flash.length === 0) return;
        // Reset để F5 không hiện lại
        try { window.__TOAST_FLASH__ = []; } catch (e) {}

        flash.forEach(function (item, idx) {
            setTimeout(function () {
                showToast({
                    type:        item.type        || 'info',
                    title:       item.title       || '',
                    message:     item.message     || '',
                    duration:    typeof item.duration_ms === 'number' ? item.duration_ms : 0
                });
            }, idx * 220);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', consumeFlash);
    } else {
        // Đợi 1 tick để CSS kịp apply (không bị flash do thiếu style)
        setTimeout(consumeFlash, 0);
    }
})();