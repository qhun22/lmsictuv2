document.addEventListener('DOMContentLoaded', () => {
  
  // 1. Kích hoạt Lottie Animation (Vẽ chữ Hola đúng 1 lần)
  function initLottie() {
    const lottieContainer = document.querySelector('.hero_lottie');
    if (lottieContainer && typeof lottie !== 'undefined') {
      lottie.loadAnimation({
        container: lottieContainer,
        renderer: 'svg',
        loop: false, // Chạy 1 lần rồi dừng hẳn
        autoplay: true,
        path: 'https://cdn.prod.website-files.com/662fb92f905585b61b12afd8/6663119e52bd5d7d95969d71_hola-pocoyo.json'
      });
    } else if (lottieContainer) {
      setTimeout(initLottie, 100);
    }
  }

  // 2. Kích hoạt Swiper Sliders (Hero Slider & Meet the Gang)
  function initSwipers() {
    if (typeof Swiper === 'undefined') {
      setTimeout(initSwipers, 100);
      return;
    }

    // Hero Main Slider
    new Swiper('.hero_component', {
      loop: true,
      autoplay: {
        delay: 5000,
        disableOnInteraction: false,
      },
      pagination: {
        el: '.about_slider-dots',
        clickable: true,
      },
    });

    // Meet the Gang Slider
    new Swiper('[data-slider="slider-gang"]', {
      loop: false,
      keyboard: true,
      slidesPerView: 'auto',
      spaceBetween: 16,
      navigation: {
        nextEl: '.swiper-button-next-gang',
        prevEl: '.swiper-button-prev-gang',
      },
    });
  }

  initLottie();
  initSwipers();

  // 3. Toast "Sắp ra mắt" khi click vào 5 box bento (chưa hoàn thiện chức năng)
  document.querySelectorAll('.bento_episodes-wrapper, .bento_songs-wrapper, .bento_apps-wrapper, .bento_tales-wrapper, .bento_crafts-wrapper').forEach(function (box) {
    box.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var titleEl = box.querySelector('[class*="bento_"][class*="-title"]');
      var name = titleEl ? titleEl.textContent.trim() : 'Tính năng';
      if (typeof window.showToast === 'function') {
        window.showToast({
          type: 'info',
          title: 'Comingsoon',
          message: name + ' đang được phát triển. Vui lòng quay lại sau nhé!',
          duration: 3000
        });
      }
    });
  });
});