document.addEventListener('DOMContentLoaded', () => {
  // 1. CẤU HÌNH CÁC PHẦN TỬ VÀ THÔNG SỐ (CONFIG)
  const config = {
    navbarId: 'navbar_component',
    menuToggleAttr: 'fs-scrolldisable-element="toggle"',
    overlayClass: 'navbar_overlay-wrapper',
    closeBtnClass: 'navbar_menu-close',
    menuContentClass: 'navbar_menu',
    hideThreshold: 5,           // Khoảng cách cuộn tối thiểu để ẩn Navbar
    showThreshold: 5,           // Khoảng cách cuộn tối thiểu để hiện Navbar
    scrollThreshold: 50,        // Khoảng cách cuộn bắt đầu hiện nền trắng
    bgColorScrolled: '#ffffff', // Màu nền Navbar khi cuộn xuống
  };

  const navbar = document.getElementById(config.navbarId);
  const menuToggles = document.querySelectorAll('[data-menu-role]');
  const overlay = document.querySelector(`.${config.overlayClass}`);
  const closeBtn = document.querySelector(`.${config.closeBtnClass}`);
  const menuContent = document.querySelector(`.${config.menuContentClass}`);

  if (!navbar) return;

  // ==========================================
  // A. XỬ LÝ ẨN/HIỆN NAVBAR KHI CUỘN TRANG
  // ==========================================
  let lastScrollY = window.scrollY;
  let ticking = false;

  navbar.style.transition = 'transform 0.3s ease-in-out, background-color 0.3s ease-in-out';

  function updateNavbar() {
    const currentScrollY = window.scrollY;
    const scrollDiff = currentScrollY - lastScrollY;

    // Đang ở đỉnh trang -> Hiện Navbar trong suốt
    if (currentScrollY <= 0) {
      navbar.style.transform = 'translateY(0)';
      navbar.style.backgroundColor = 'transparent';
    } 
    // Đã cuộn qua ngưỡng scrollThreshold (50px)
    else if (currentScrollY > config.scrollThreshold) {
      navbar.style.backgroundColor = config.bgColorScrolled;

      // Cuộn xuống -> Ẩn Navbar
      if (scrollDiff > config.hideThreshold) {
        navbar.style.transform = 'translateY(-100%)';
      } 
      // Cuộn lên -> Hiện Navbar
      else if (scrollDiff < -config.showThreshold) {
        navbar.style.transform = 'translateY(0)';
      }
    } 
    // Khoảng giữa 0px và threshold
    else {
      navbar.style.transform = 'translateY(0)';
      navbar.style.backgroundColor = 'transparent';
    }

    lastScrollY = currentScrollY;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(updateNavbar);
      ticking = true;
    }
  }, { passive: true });

  // ==========================================
  // B. XỬ LÝ BẬT/TẮT MENU OVERLAY & HIỆU ỨNG
  // ==========================================
  let isMenuOpen = false;

  function toggleMenu(forceState) {
    isMenuOpen = typeof forceState === 'boolean' ? forceState : !isMenuOpen;

    // Bật/tắt class .is-open trên Overlay để chạy hiệu ứng CSS mượt (Fade In + Slide Down)
    if (overlay) {
      overlay.classList.toggle('is-open', isMenuOpen);
    }

    // Bật/tắt class .is-active để xoay icon Hamburger thành dấu X
    menuToggles.forEach((toggle) => {
      toggle.classList.toggle('is-active', isMenuOpen);
    });

    // Khóa hoặc mở lại cuộn trang
    document.body.style.overflow = isMenuOpen ? 'hidden' : '';
  }

  // 1. Click nút Hamburger để Toggle (Mở / Đóng)
  menuToggles.forEach((toggle) => {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });
  });

  // 2. Click nút Close (X) nếu có
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu(false);
    });
  }

  // 3. Click ra ngoài bảng trắng (Overlay background) để tắt Menu
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (menuContent && !menuContent.contains(e.target)) {
        toggleMenu(false);
      }
    });
  }

  // 4. Nhấn phím ESC trên bàn phím để đóng Menu
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMenuOpen) {
      toggleMenu(false);
    }
  });

  // ==========================================
  // C. ĐÓNG MENU KHI CLICK VÀO LINK ĐIỀU HƯỚNG
  // ==========================================
  // Khi user bấm vào bất kỳ link nào trong menu mobile, đóng menu ngay
  // để tránh cảm giác "khựng" do phải đợi trang load xong.
  if (menuContent) {
    menuContent.addEventListener('click', (e) => {
      const link = e.target.closest('.js-mobile-nav-link');
      if (link) {
        // Đóng menu ngay lập tức (không đợi animation) để cảm giác phản hồi nhanh
        toggleMenu(false);
        // Reset tất cả <details> đang mở về đóng
        menuContent.querySelectorAll('details[open]').forEach((d) => {
          d.removeAttribute('open');
        });
      }
    });
  }
});