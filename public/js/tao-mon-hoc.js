document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('smh-form');
  const input = document.getElementById('smh-input');
  const list = document.getElementById('smh-list');
  const emptyState = document.getElementById('smh-empty');
  const countNum = document.getElementById('smh-count-num');

  if (!form || !input || !list || !emptyState) return;

  const subjects = [];
  const weeklyMap = {};
  const subjectIds = new Map();

  loadDatabaseData().then(() => {
    renderAll();
  });

  async function loadDatabaseData() {
    try {
      const response = await fetch('/api/subjects/', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Không thể tải môn học');
      const data = await response.json();
      for (const subject of data.subjects || []) {
        subjects.push(subject.name);
        subjectIds.set(subject.name, subject.id);
        const weeksResponse = await fetch(`/api/subject/${subject.id}/weeks/`, { credentials: 'same-origin' });
        const weeksData = weeksResponse.ok ? await weeksResponse.json() : { weeks: [] };
        weeklyMap[subject.name] = (weeksData.weeks || []).map((week) => ({
          ...week,
          _id: week.id,
        }));
      }
    } catch (error) {
      if (window.errorToast) window.errorToast('Lỗi tải dữ liệu', error.message);
    }
  }

  // ── Submit form: thêm môn học mới ──
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) {
      input.focus();
      shake(input);
      if (window.errorToast) window.errorToast('Lỗi', 'Vui lòng nhập tên môn học');
      return;
    }
    if (subjects.some((s) => s.toLowerCase() === name.toLowerCase())) {
      input.focus();
      shake(input);
      if (window.warningToast) window.warningToast('Trùng tên', `Môn "${name}" đã tồn tại`);
      return;
    }

    try {
      const response = await fetch('/api/subject/create/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        credentials: 'same-origin',
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Không thể thêm môn học');
      subjects.push(data.subject.name);
      subjectIds.set(data.subject.name, data.subject.id);
      weeklyMap[data.subject.name] = [];
      renderAll();
      input.value = '';
      input.focus();
      if (window.successToast) window.successToast('Thành công', `Đã thêm môn "${name}"`);
    } catch (error) {
      if (window.errorToast) window.errorToast('Lỗi', error.message);
    }
  });

  // ── Delegated click cho list ──
  list.addEventListener('click', async (e) => {
    const btnSettings = e.target.closest('[data-action="settings"]');
    const btnDelete = e.target.closest('[data-action="delete"]');
    const btnAdd = e.target.closest('[data-action="add"]');

    if (btnSettings) {
      const idx = Number(btnSettings.dataset.idx);
      openSettingsModal(subjects[idx]);
    } else if (btnDelete) {
      // Xóa TẤT CẢ môn học
      const ok = await window.confirmDanger(
        'Xóa tất cả môn học?',
        'Bạn có chắc muốn xóa TẤT CẢ môn học và tuần học không?',
        { confirmLabel: 'Xóa tất cả', detail: 'Hành động này không thể hoàn tác.' }
      );
      if (!ok) return;

      // Xóa từng môn học trong database
      const deletePromises = [];
      for (const [name, subjectId] of subjectIds) {
        deletePromises.push(
          fetch(`/api/subject/${subjectId}/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': getCsrfToken() },
            credentials: 'same-origin',
          }).then(async (response) => {
            const data = await response.json();
            if (!response.ok || !data.success) {
              console.warn(`Không xóa được môn: ${name}`);
            }
          }).catch(() => {})
        );
      }
      await Promise.all(deletePromises);

      // Clear local data
      subjects.length = 0;
      subjectIds.clear();
      for (const key in weeklyMap) delete weeklyMap[key];
      renderAll();
      if (window.successToast) window.successToast('Đã xóa', 'Đã xóa tất cả môn học');
    } else if (btnAdd) {
      const idx = Number(btnAdd.dataset.idx);
      openAddWeekModal(subjects[idx]);
    }
  });

  // ── Render ──
  function renderAll() {
    renderCount(subjects.length);
    renderList(subjects);
  }

  function renderCount(count) {
    countNum.textContent = count;
  }

  function renderList(items) {
    if (!items.length) {
      list.innerHTML = '';
      emptyState.hidden = false;
      return;
    }

    emptyState.hidden = true;
    const reversed = [...items].reverse();

    list.innerHTML = reversed.map((name, i) => {
      const realIndex = items.length - 1 - i;
      const subjectWeeks = weeklyMap[name] || [];
      return `
        <li class="smh-card" style="animation-delay: ${i * 30}ms">
          <div class="smh-card-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
          </div>
          <div class="smh-card-body">
            <span class="smh-card-name">${escapeHtml(name)}</span>
            <span class="smh-card-meta">${subjectWeeks.length} tuần học</span>
          </div>
          <div class="smh-card-actions">
            <button
              type="button"
              class="smh-action smh-action--settings"
              data-action="settings"
              data-idx="${realIndex}"
              aria-label="Cài đặt môn ${escapeHtml(name)}"
              title="Cài đặt"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
            <button
              type="button"
              class="smh-action smh-action--add"
              data-action="add"
              data-idx="${realIndex}"
              aria-label="Thêm tuần học cho ${escapeHtml(name)}"
              title="Thêm tuần"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
            <button
              type="button"
              class="smh-action smh-action--delete"
              data-action="delete"
              data-idx="${realIndex}"
              aria-label="Xóa tất cả môn học"
              title="Xóa"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          </div>
        </li>
      `;
    }).join('');
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  MODAL: Cài đặt môn học (Đơn giản: tên + tên tuần)         ║
  // ╚══════════════════════════════════════════════════════════════╝
  function openSettingsModal(subjectName) {
    const subjectId = subjectIds.get(subjectName);
    const weeks = weeklyMap[subjectName] || [];

    const modal = buildModal({
      modalClass: 'smh-modal--settings',
      title: `Cài đặt: ${escapeHtml(subjectName)}`,
      bodyHTML: `
        <div class="smh-modal-section">
          <label class="smh-modal-label" for="smh-rename-input">Tên môn học</label>
          <input
            type="text"
            id="smh-rename-input"
            class="smh-modal-input"
            value="${escapeHtml(subjectName)}"
            maxlength="80"
          />
        </div>

        <div class="smh-modal-section">
          <span class="smh-modal-label">Danh sách tuần (${weeks.length})</span>
          <ul class="smh-modal-week-list" id="smh-modal-week-list">
            ${renderWeekList(weeks)}
          </ul>
        </div>
      `,
      primaryLabel: 'Lưu',
      onPrimary: async () => {
        const newName = document.getElementById('smh-rename-input').value.trim();
        if (!newName) {
          if (window.errorToast) window.errorToast('Lỗi', 'Tên môn học không được trống');
          return false;
        }

        // Đổi tên môn học nếu thay đổi
        if (newName !== subjectName) {
          if (subjects.some((s, i) => i !== subjects.indexOf(subjectName) && s.toLowerCase() === newName.toLowerCase())) {
            if (window.warningToast) window.warningToast('Trùng tên', `"${newName}" đã tồn tại`);
            return false;
          }
          if (subjectId) {
            try {
              const response = await fetch(`/api/subject/${subjectId}/rename/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                credentials: 'same-origin',
                body: JSON.stringify({ name: newName }),
              });
              const data = await response.json();
              if (!response.ok || !data.success) throw new Error(data.message || 'Không thể đổi tên môn học');
            } catch (error) {
              if (window.errorToast) window.errorToast('Lỗi', error.message);
              return false;
            }
          }
          const idx = subjects.indexOf(subjectName);
          subjects[idx] = newName;
          subjectIds.delete(subjectName);
          subjectIds.set(newName, subjectId);
          weeklyMap[newName] = weeklyMap[subjectName] || [];
          delete weeklyMap[subjectName];
        }

        // Cập nhật tên tuần
        const weekInputs = document.querySelectorAll('.smh-week-name-input');
        for (let i = 0; i < weekInputs.length; i++) {
          const input = weekInputs[i];
          const weekIdx = Number(input.dataset.weekIdx);
          const newWeekName = input.value.trim();
          if (!weeklyMap[newName || subjectName]) continue;
          const week = weeklyMap[newName || subjectName][weekIdx];
          if (week && newWeekName !== week.name && week._id) {
            try {
              await fetch(`/api/week/${week._id}/rename/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                credentials: 'same-origin',
                body: JSON.stringify({ name: newWeekName }),
              });
              week.name = newWeekName;
            } catch (error) {
              console.warn('Không cập nhật được tên tuần');
            }
          } else if (week) {
            week.name = newWeekName;
          }
        }

        renderAll();
        if (window.successToast) window.successToast('Đã lưu', 'Cài đặt đã được cập nhật');
        modal.close();
      },
    });
  }

  function renderWeekList(weeks) {
    if (!weeks.length) {
      return '<li class="smh-modal-week-empty">Chưa có tuần nào. Vào mục "Thêm tuần" để thêm.</li>';
    }
    return weeks.map((w, i) => {
      const desc = w.description || (w.topics && w.topics[0]) || '';
      const descHtml = desc
        ? `<p class="smh-modal-week-desc">${escapeHtml(desc)}</p>`
        : '';
      return `
        <li class="smh-modal-week-item">
          <div class="smh-modal-week-row">
            <span class="smh-modal-week-num">${i + 1}</span>
            <input
              type="text"
              class="smh-week-name-input smh-modal-input"
              value="${escapeHtml(w.name)}"
              data-week-idx="${i}"
              maxlength="80"
              placeholder="Tên tuần"
            />
            <button
              type="button"
              class="smh-modal-week-del"
              data-week-del="${i}"
              aria-label="Xóa tuần"
              title="Xóa"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          </div>
          ${descHtml}
        </li>
      `;
    }).join('');
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  MODAL: Thêm tuần học                                         ║
  // ╚══════════════════════════════════════════════════════════════╝
  function openAddWeekModal(subjectName) {
    const weeks = weeklyMap[subjectName] || [];
    const nextNumber = weeks.length + 1;

    const modal = buildModal({
      title: `Thêm Tuần cho "${escapeHtml(subjectName)}"`,
      bodyHTML: `
        <div class="smh-modal-section">
          <label class="smh-modal-label" for="smh-week-name-input">Tên tuần</label>
          <input
            type="text"
            id="smh-week-name-input"
            class="smh-modal-input"
            placeholder="Tuần ${nextNumber}"
            value="Tuần ${nextNumber}"
            maxlength="80"
          />
        </div>
        <div class="smh-modal-section">
          <label class="smh-modal-label" for="smh-week-desc">Nội dung</label>
          <textarea
            id="smh-week-desc"
            class="smh-modal-input smh-modal-textarea"
            placeholder="Nhập nội dung..."
            maxlength="500"
          ></textarea>
        </div>
      `,
      primaryLabel: 'Thêm tuần',
      onPrimary: () => {
        const nameInput = document.getElementById('smh-week-name-input');
        const descInput = document.getElementById('smh-week-desc');
        const name = (nameInput.value.trim() || `Tuần ${nextNumber}`);
        const desc = descInput.value.trim();
        const subjectId = subjectIds.get(subjectName);
        if (!subjectId) {
          if (window.errorToast) window.errorToast('Lỗi', 'Không tìm thấy môn học');
          return false;
        }
        fetch(`/api/subject/${subjectId}/week/create/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
          credentials: 'same-origin',
          body: JSON.stringify({ name, topics: desc ? [desc] : [] }),
        }).then(async (response) => {
          const data = await response.json();
          if (!response.ok || !data.success) throw new Error(data.message || 'Không thể thêm tuần học');
          const newWeek = { ...data.week, _id: data.week.id };
          if (!weeklyMap[subjectName]) weeklyMap[subjectName] = [];
          weeklyMap[subjectName].push(newWeek);
          renderAll();
          if (window.successToast) window.successToast('Đã thêm', name);
        }).catch((error) => {
          if (window.errorToast) window.errorToast('Lỗi', error.message);
        });
        modal.close();
      },
    });

    setTimeout(() => {
      const ni = document.getElementById('smh-week-name-input');
      if (ni) {
        ni.focus();
        ni.select();
      }
    }, 0);
  }

  // ── Xử lý xóa tuần trong modal Cài đặt ──
  document.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('[data-week-del]');
    if (!delBtn) return;

    // Chỉ xử lý khi modal đang mở
    const modalBody = delBtn.closest('.smh-modal-body');
    if (!modalBody) return;

    const weekIdx = Number(delBtn.dataset.weekDel);
    const modalWeekList = document.getElementById('smh-modal-week-list');
    if (!modalWeekList) return;

    // Tìm subjectName từ title modal
    const modalTitle = document.querySelector('.smh-modal--settings .smh-modal-title');
    if (!modalTitle) return;
    const match = modalTitle.textContent.match(/Cài đặt:\s*(.+)/);
    if (!match) return;
    const subjectName = match[1].trim();

    const weeks = weeklyMap[subjectName];
    if (!weeks || !weeks[weekIdx]) return;

    const weekName = weeks[weekIdx].name;
    const ok = await window.confirmDanger(
      'Xóa tuần?',
      `Xóa "${weekName}" khỏi "${subjectName}"?`,
      { confirmLabel: 'Xóa' }
    );
    if (!ok) return;

    const week = weeks[weekIdx];
    if (week._id) {
      try {
        const response = await fetch(`/api/week/${week._id}/delete/`, {
          method: 'POST',
          headers: { 'X-CSRFToken': getCsrfToken() },
          credentials: 'same-origin',
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Không thể xóa tuần');
      } catch (error) {
        if (window.errorToast) window.errorToast('Lỗi', error.message);
        return;
      }
    }
    weeks.splice(weekIdx, 1);
    modalWeekList.innerHTML = renderWeekList(weeks);
    renderAll();
    if (window.successToast) window.successToast('Đã xóa', weekName);
  });

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  Generic Modal Builder                                        ║
  // ╚══════════════════════════════════════════════════════════════╝
  function buildModal({ title, bodyHTML, primaryLabel, onPrimary, modalClass = '' }) {
    const overlay = document.createElement('div');
    overlay.className = 'smh-modal-overlay';
    const dialogClass = 'smh-modal' + (modalClass ? ' ' + modalClass : '');
    overlay.innerHTML = `
      <div class="${dialogClass}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="smh-modal-header">
          <h3 class="smh-modal-title">${title}</h3>
          <button type="button" class="smh-modal-close" aria-label="Đóng">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="smh-modal-body">${bodyHTML}</div>
        <div class="smh-modal-footer">
          <button type="button" class="smh-modal-btn smh-modal-btn--cancel">Hủy</button>
          <button type="button" class="smh-modal-btn smh-modal-btn--primary">${primaryLabel}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add('is-visible'));

    function close() {
      overlay.classList.remove('is-visible');
      setTimeout(() => overlay.remove(), 220);
      document.removeEventListener('keydown', onKey);
    }

    function onKey(e) {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter' && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        if (e.target.tagName === 'INPUT' && e.target.type === 'text') {
          e.preventDefault();
          primaryBtn.click();
        }
      }
    }

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    const closeBtn = overlay.querySelector('.smh-modal-close');
    const cancelBtn = overlay.querySelector('.smh-modal-btn--cancel');
    const primaryBtn = overlay.querySelector('.smh-modal-btn--primary');
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    primaryBtn.addEventListener('click', () => {
      const result = onPrimary();
      if (result === false) return;
    });
    document.addEventListener('keydown', onKey);

    return { close };
  }

  // ── Shake animation ──
  function shake(el) {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
      document.cookie.split('; ').find((row) => row.startsWith('csrftoken='))?.split('=')[1] || '';
  }
});

// ── Shake animation injected ──
const _shakeStyle = document.createElement('style');
_shakeStyle.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-5px); }
    40% { transform: translateX(5px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
  }
  .shake { animation: shake 0.35s ease; }
  .smh-modal-input.shake { animation: shake 0.35s ease; }
`;
document.head.appendChild(_shakeStyle);
