document.addEventListener('DOMContentLoaded', () => {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';

  // Elements
  const durationInput = document.getElementById('cauhinh-duration');
  const activeToggle = document.getElementById('cauhinh-active-toggle');
  const activeLabel = document.getElementById('cauhinh-active-label');
  const keyUsernameToggle = document.getElementById('cauhinh-keyusername-toggle');
  const keyUsernameLabel = document.getElementById('cauhinh-keyusername-label');
  const keyUsernameHint = document.getElementById('cauhinh-keyusername-hint');
  const keyUsernameSection = document.getElementById('cauhinh-keyusername-section');
  const shuffleToggle = document.getElementById('cauhinh-shuffle-toggle');
  const shuffleLabel = document.getElementById('cauhinh-shuffle-label');
  const feedbackToggle = document.getElementById('cauhinh-feedback-toggle');
  const feedbackLabel = document.getElementById('cauhinh-feedback-label');
  const usernameInput = document.getElementById('cauhinh-username-input');
  const addUserBtn = document.getElementById('cauhinh-add-user-btn');
  const userList = document.getElementById('cauhinh-user-list');
  const userEmpty = document.getElementById('cauhinh-user-empty');
  const linkInput = document.getElementById('cauhinh-link-input');
  const copyBtn = document.getElementById('cauhinh-copy-btn');
  const saveBtn = document.getElementById('cauhinh-save-btn');
  const countQues = document.getElementById('cauhinh-count-ques');
  const subjectInfo = document.getElementById('cauhinh-subject');
  const weekInfo = document.getElementById('cauhinh-week');

  // State
  let quizCode = new URLSearchParams(window.location.search).get('quiz') || '';
  let quizData = null;
  let keyUsernames = [];
  let isActive = true;
  let hasKeyUsername = false;
  let autoShuffle = true;
  let showAnswersImmediately = false;

  // Load quiz data
  loadQuizData();

  async function loadQuizData() {
    if (!quizCode) {
      if (window.errorToast) window.errorToast('Lỗi', 'Không tìm thấy mã bài thi');
      return;
    }

    try {
      const response = await fetch(`/api/quiz/${encodeURIComponent(quizCode)}`, {
        credentials: 'same-origin',
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Không thể tải thông tin bài thi');
      }

      quizData = data;
      keyUsernames = data.key_usernames || [];
      isActive = data.is_active !== false;
      hasKeyUsername = data.has_key_username === true;
      autoShuffle = data.auto_shuffle !== false;
      showAnswersImmediately = data.show_answers_immediately === true;

      // Update UI
      countQues.textContent = (data.questions || []).length;
      subjectInfo.textContent = data.subject || 'Chưa xác định';
      weekInfo.textContent = data.week_index != null ? `Tuần ${Number(data.week_index) + 1}` : '-';

      // Duration
      if (data.duration_seconds) {
        durationInput.value = formatDuration(data.duration_seconds);
      }

      // Link
      linkInput.value = `${window.location.origin}/e/${quizCode}`;

      // Active toggle
      activeToggle.setAttribute('aria-checked', isActive);
      activeLabel.textContent = isActive ? 'Hoạt động' : 'Tạm ngưng';

      // KeyUsername toggle
      keyUsernameToggle.setAttribute('aria-checked', hasKeyUsername);
      keyUsernameLabel.textContent = hasKeyUsername ? 'Bật' : 'Tắt';
      keyUsernameHint.innerHTML = hasKeyUsername
        ? 'Bật: Chỉ người được thêm vào danh sách mới được làm bài.'
        : 'Tắt: Ai cũng có thể làm bài sau khi đăng nhập.<br>Bật: Chỉ người được thêm vào danh sách mới được làm.';

      // Show/hide KeyUsername section
      keyUsernameSection.style.display = hasKeyUsername ? 'block' : 'none';
      updateShuffleToggle();
      updateFeedbackToggle();

      // Render user list
      renderUserList();

    } catch (error) {
      if (window.errorToast) window.errorToast('Lỗi', error.message);
    }
  }

  function formatDuration(seconds) {
    const total = Math.max(60, Number(seconds) || 1800);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function parseDuration(value) {
    const match = String(value || '').trim().match(/^(\d{1,3}):([0-5]\d)$/);
    if (!match) return 0;
    const seconds = Number(match[1]) * 60 + Number(match[2]);
    return seconds >= 60 && seconds <= 86400 ? seconds : 0;
  }

  // Toggle: Active
  activeToggle.addEventListener('click', () => {
    isActive = !isActive;
    activeToggle.setAttribute('aria-checked', isActive);
    activeLabel.textContent = isActive ? 'Hoạt động' : 'Tạm ngưng';
  });

  // Toggle: KeyUsername
  keyUsernameToggle.addEventListener('click', () => {
    hasKeyUsername = !hasKeyUsername;
    keyUsernameToggle.setAttribute('aria-checked', hasKeyUsername);
    keyUsernameLabel.textContent = hasKeyUsername ? 'Bật' : 'Tắt';
    keyUsernameHint.innerHTML = hasKeyUsername
      ? 'Bật: Chỉ người được thêm vào danh sách mới được làm bài.'
      : 'Tắt: Ai cũng có thể làm bài sau khi đăng nhập.<br>Bật: Chỉ người được thêm vào danh sách mới được làm.';
    keyUsernameSection.style.display = hasKeyUsername ? 'block' : 'none';
  });

  function updateShuffleToggle() {
    shuffleToggle.setAttribute('aria-checked', autoShuffle);
    shuffleLabel.textContent = autoShuffle ? 'Bật' : 'Tắt';
  }

  function updateFeedbackToggle() {
    feedbackToggle.setAttribute('aria-checked', showAnswersImmediately);
    feedbackLabel.textContent = showAnswersImmediately ? 'Ngay khi chọn' : 'Sau khi nộp bài';
  }

  shuffleToggle.addEventListener('click', () => {
    autoShuffle = !autoShuffle;
    updateShuffleToggle();
  });

  feedbackToggle.addEventListener('click', () => {
    showAnswersImmediately = !showAnswersImmediately;
    updateFeedbackToggle();
  });

  // Add user
  function addUser() {
    const username = usernameInput.value.trim();
    if (!username) {
      if (window.warningToast) window.warningToast('Chưa nhập', 'Vui lòng nhập username');
      usernameInput.focus();
      return;
    }
    if (keyUsernames.includes(username)) {
      if (window.warningToast) window.warningToast('Trùng tên', `Username "${username}" đã tồn tại`);
      return;
    }
    keyUsernames.push(username);
    usernameInput.value = '';
    renderUserList();
    if (window.successToast) window.successToast('Đã thêm', username);
  }

  addUserBtn.addEventListener('click', addUser);
  usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addUser();
  });

  // Render user list
  function renderUserList() {
    if (!keyUsernames.length) {
      userEmpty.style.display = 'block';
      // Remove all items except empty placeholder
      Array.from(userList.children).forEach((child) => {
        if (child !== userEmpty) child.remove();
      });
      return;
    }

    userEmpty.style.display = 'none';
    
    // Clear and re-render
    Array.from(userList.children).forEach((child) => {
      if (child !== userEmpty) child.remove();
    });

    keyUsernames.forEach((username, index) => {
      const li = document.createElement('li');
      li.className = 'cauhinh-user-item';
      li.innerHTML = `
        <span class="cauhinh-user-name">${escapeHtml(username)}</span>
        <button type="button" class="cauhinh-user-del" data-index="${index}" aria-label="Xóa ${escapeHtml(username)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      `;
      userList.appendChild(li);
    });
  }

  // Delete user
  userList.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('.cauhinh-user-del');
    if (!delBtn) return;

    const index = Number(delBtn.dataset.index);
    const username = keyUsernames[index];

    const ok = await window.confirmDanger(
      'Xóa người dùng?',
      `Xóa "${username}" khỏi danh sách?`,
      { confirmLabel: 'Xóa' }
    );
    if (!ok) return;

    keyUsernames.splice(index, 1);
    renderUserList();
    if (window.successToast) window.successToast('Đã xóa', username);
  });

  // Copy link
  copyBtn.addEventListener('click', () => {
    if (!linkInput.value) return;
    navigator.clipboard.writeText(linkInput.value).then(() => {
      copyBtn.classList.add('is-copied');
      copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg> Đã copy!';
      setTimeout(() => {
        copyBtn.classList.remove('is-copied');
        copyBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy';
      }, 2000);
    });
  });

  // Save
  saveBtn.addEventListener('click', async () => {
    const durationSeconds = parseDuration(durationInput.value);
    if (!durationSeconds) {
      if (window.errorToast) window.errorToast('Lỗi', 'Thời gian không hợp lệ. Nhập mm:ss (tối thiểu 01:00)');
      durationInput.focus();
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Đang lưu...';

    try {
      const response = await fetch(`/api/quiz/${encodeURIComponent(quizCode)}/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken,
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          duration_seconds: durationSeconds,
          is_active: isActive,
          has_key_username: hasKeyUsername,
          key_usernames: hasKeyUsername ? keyUsernames : [],
          auto_shuffle: autoShuffle,
          show_answers_immediately: showAnswersImmediately,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Không thể lưu cấu hình');
      }

      if (window.successToast) window.successToast('Đã lưu', 'Cấu hình bài thi đã được cập nhật');

    } catch (error) {
      if (window.errorToast) window.errorToast('Lỗi', error.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Lưu thay đổi';
    }
  });

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }
});
