document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  document.documentElement.classList.remove('tq-popover-open');
  document.body.classList.remove('tq-popover-open');
  document.documentElement.style.overflowY = 'auto';
  document.body.style.overflowY = 'auto';

  const csrfToken = document
    .querySelector('meta[name="csrf-token"]')
    ?.getAttribute('content') || '';

  const $ = (id) => document.getElementById(id);

  const subjectSelect = $('tq-subject-select');
  const weekSelect = $('tq-week-select');
  const weekHint = $('tq-week-hint');
  const dropzone = $('tq-dropzone');
  const fileInput = $('tq-file-input');
  const fileInfo = $('tq-file-info');
  const fileNameEl = $('tq-file-name');
  const fileRemove = $('tq-file-remove');
  const btnParse = $('tq-btn-parse');
  const btnClear = $('tq-btn-clear');
  const btnShare = $('tq-btn-share');
  const btnAddQuestion = $('tq-btn-add-question');
  let shareQuizCode = '';
  const listEl = $('tq-list');
  const emptyState = $('tq-empty');
  const countNum = $('tq-count-num');
  const toolbarStat = $('tq-toolbar-stat');
  const statOk = $('tq-stat-ok');
  const statWarnWrap = $('tq-stat-warn-wrap');
  const statWarn = $('tq-stat-warn');
  const warningsPanel = $('tq-warnings');
  const statSingle = $('tq-stat-single');
  const statMultiple = $('tq-stat-multiple');
  const statUnknown = $('tq-stat-unknown');
  const statDuplicate = $('tq-stat-duplicate');
  const statDuplicateWrap = $('tq-stat-duplicate-wrap');
  const statTf = $('tq-stat-tf');
  const statFill = $('tq-stat-fill');
  const statOrder = $('tq-stat-order');
  const statDrag = $('tq-stat-drag');
  const statGroup = $('tq-stat-group');
  const statSingleWrap = $('tq-stat-single-wrap');
  const statMultipleWrap = $('tq-stat-multiple-wrap');
  const statTfWrap = $('tq-stat-tf-wrap');
  const statFillWrap = $('tq-stat-fill-wrap');
  const statOrderWrap = $('tq-stat-order-wrap');
  const statDragWrap = $('tq-stat-drag-wrap');
  const statGroupWrap = $('tq-stat-group-wrap');

  if (!subjectSelect || !weekSelect || !dropzone) return;

  // ── Cập nhật các badge loại câu hỏi trong header ──
  function updateTypeCounters(s) {
    // s là object { single, multiple, tf, fill, order, drag, unknown, duplicate }
    if (statSingle) statSingle.textContent = s.single || 0;
    if (statMultiple) statMultiple.textContent = s.multiple || 0;
    if (statTf) statTf.textContent = s.tf || 0;
    if (statFill) statFill.textContent = s.fill || 0;
    if (statOrder) statOrder.textContent = s.order || 0;
    if (statDrag) statDrag.textContent = s.drag || 0;
    if (statGroup) statGroup.textContent = s.group || 0;
    if (statUnknown) statUnknown.textContent = s.unknown || 0;
    if (statDuplicate) statDuplicate.textContent = s.duplicate || 0;
    if (statSingleWrap) statSingleWrap.hidden = !(s.single);
    if (statMultipleWrap) statMultipleWrap.hidden = !(s.multiple);
    if (statTfWrap) statTfWrap.hidden = !(s.tf);
    if (statFillWrap) statFillWrap.hidden = !(s.fill);
    if (statOrderWrap) statOrderWrap.hidden = !(s.order);
    if (statDragWrap) statDragWrap.hidden = !(s.drag);
    if (statGroupWrap) statGroupWrap.hidden = !(s.group);
    if (statDuplicateWrap) statDuplicateWrap.hidden = !(s.duplicate);
  }

  let currentFile = null;
  let parseController = null;
  let questions = [];
  let databaseSubjects = [];
  let databaseWeeks = {};
  const initialSubjects = Array.isArray(window.__INITIAL_SUBJECTS__) ? window.__INITIAL_SUBJECTS__ : [];
  databaseSubjects = initialSubjects.map((subject) => subject.name);
  databaseWeeks = Object.fromEntries(initialSubjects.map((subject) => [
    subject.name,
    (subject.weeks || []).map((week) => ({
      ...week,
      quizCode: week.quiz_code || null,
      active: week.active !== false,
    })),
  ]));
  let editingQuizCode = new URLSearchParams(window.location.search).get('quiz');
  shareQuizCode = editingQuizCode || '';
  let editingSubject = '';
  let editingWeekIndex = null;
  let weekSelectionTouched = false;

  // ── Storage helpers (đồng bộ với tao-mon-hoc.js) ──
  function loadSubjects() {
    return databaseSubjects;
  }

  function loadWeeklyMap() {
    return databaseWeeks;
  }

  async function loadDatabaseSubjects() {
    try {
      const response = await fetch('/api/subjects', { credentials: 'same-origin' });
      if (!response.ok) {
        if (window.errorToast) window.errorToast('Không tải được môn học', 'Vui lòng đăng nhập lại hoặc tải lại trang.');
        return;
      }
      const data = await response.json();
      databaseSubjects = (data.subjects || []).map((subject) => subject.name);
      databaseWeeks = {};
      populateSubjects();
      const weeklyMap = { ...databaseWeeks };
      for (const subject of data.subjects || []) {
        try {
          const weeksResponse = await fetch(`/api/subject/${subject.id}/weeks`, { credentials: 'same-origin' });
          if (weeksResponse.ok) {
            const weeksData = await weeksResponse.json();
            weeklyMap[subject.name] = (weeksData.weeks || []).map((week) => ({
              ...week,
              quizCode: week.quiz_code || null,
              active: week.active !== false,
            }));
          }
        } catch {
          // Giữ dữ liệu tuần đã được render từ server nếu API lỗi.
        }
      }
      databaseWeeks = weeklyMap;
      populateSubjects();
    } catch {
      // Dùng cache local nếu API không truy cập được.
    }
  }

  async function syncExistingQuizLinks() {
    try {
      const response = await fetch('/api/quiz-links', {
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (!response.ok) return;
      const data = await response.json();
      const weeklyMap = loadWeeklyMap();
      (data.links || []).forEach((quiz) => {
        const weeks = weeklyMap[quiz.subject] || [];
        const week = weeks[Number(quiz.week_index)];
        if (week) {
          week.link = quiz.link;
          week.quizCode = quiz.code;
          week.active = quiz.is_active;
        }
      });
      if (subjectSelect.value) {
        const selectedWeekIndex = weekSelect.value;
        updateWeeks();
        if (selectedWeekIndex !== '' && Array.from(weekSelect.options).some((option) => option.value === selectedWeekIndex)) {
          weekSelect.value = selectedWeekIndex;
          updateParseButton();
        }
      }
    } catch {
      // Giữ dữ liệu local nếu API không truy cập được.
    }
  }

  // ── Render subject select ──
  function populateSubjects() {
    const subjects = loadSubjects();
    const weeklyMap = loadWeeklyMap();

    const previous = subjectSelect.value;
    subjectSelect.innerHTML = '<option value="">-- Chọn môn học --</option>';
    if (!subjects.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '(Chưa có môn học nào)';
      opt.disabled = true;
      subjectSelect.appendChild(opt);
      weekSelect.disabled = true;
      weekSelect.innerHTML = '<option value="">-- Chọn Tuần Học --</option>';
      weekHint.hidden = false;
      return;
    }

    subjects.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      subjectSelect.appendChild(opt);
    });

    if (previous && subjects.includes(previous)) {
      subjectSelect.value = previous;
    }
    updateWeeks();
  }

  function updateWeeks() {
    const subject = subjectSelect.value;
    const weeklyMap = loadWeeklyMap();
    const weeks = subject ? weeklyMap[subject] || [] : [];

    weekSelect.innerHTML = '<option value="">-- Chọn Tuần Học --</option>';
    if (!subject) {
      weekSelect.disabled = true;
      weekHint.hidden = false;
      weekHint.textContent = 'Chọn môn học trước.';
      return;
    }

    if (!weeks.length) {
      weekSelect.disabled = true;
      weekHint.hidden = false;
      weekHint.innerHTML = `Môn "${subject}" chưa có tuần học. Vào <a href="/tao-mon-hoc/">Tạo Môn Học</a> để thêm.`;
      return;
    }

    weekSelect.disabled = false;
    weekHint.hidden = true;
    weeks.forEach((w, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `${i + 1}. ${w.name}`;
      weekSelect.appendChild(opt);
    });
    weekSelect.value = '';
  }

  // ── File handling ──
  function updateParseButton() {
    btnParse.disabled = !currentFile || !subjectSelect.value || weekSelect.disabled || !weekSelect.value;
  }

  function setFile(file) {
    if (!file) {
      currentFile = null;
      fileInfo.hidden = true;
      updateParseButton();
      return;
    }

    const name = (file.name || '').toLowerCase();
    if (!name.endsWith('.docx')) {
      if (window.errorToast) {
        window.errorToast('Sai định dạng', 'Chỉ chấp nhận file .docx');
      }
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      if (window.errorToast) {
        window.errorToast('File quá lớn', 'Tối đa 20MB');
      }
      return;
    }

    currentFile = file;
    fileNameEl.textContent = file.name;
    fileInfo.hidden = false;
    updateParseButton();
  }

  function clearFile() {
    parseController?.abort();
    parseController = null;
    currentFile = null;
    fileInput.value = '';
    fileInfo.hidden = true;
    fileNameEl.textContent = '';
    dropzone.classList.remove('is-loading', 'is-dragover');
    updateParseButton();
  }

  // ── Drag & drop ──
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('is-dragover');
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('is-dragover');
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-dragover');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) setFile(file);
  });
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) setFile(file);
  });
  fileRemove.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    clearFile();
  });

  // ── Selects ──
  subjectSelect.addEventListener('change', () => {
    updateWeeks();
    updateParseButton();

    // Khởi tạo icon có sẵn trong HTML, bao gồm empty state.
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }
  });
  weekSelect.addEventListener('change', () => {
    weekSelectionTouched = true;
    updateParseButton();

    const weeks = loadWeeklyMap()[subjectSelect.value] || [];
    const selectedWeek = weeks[Number(weekSelect.value)];
    if (!selectedWeek) return;
    if (!selectedWeek.quizCode) {
      editingQuizCode = null;
      shareQuizCode = '';
      editingSubject = subjectSelect.value;
      editingWeekIndex = Number(weekSelect.value);
      questions = [];
      clearFile();
      renderQuestions([], []);
      if (btnShare) {
        btnShare.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M10 13a5 5 0 0 1 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 1-7.54-.54l-3-3a5 5 0 0 1 7.07 7.07l1.71-1.71"/></svg> Tạo link làm bài';
      }
      return;
    }
    if (editingQuizCode && selectedWeek.quizCode === editingQuizCode) return;

    const weekName = selectedWeek.name || `Tuần ${Number(weekSelect.value) + 1}`;
    const subjectName = subjectSelect.value;
    const message = `Môn học "${subjectName}" - tuần "${weekName}" đã được tạo link. Bạn có muốn chỉnh sửa đề hiện tại không?`;
    const openEditor = (confirmed) => {
      if (confirmed) {
        window.location.href = `/tao-de/?quiz=${encodeURIComponent(selectedWeek.quizCode)}`;
      } else if (window.infoToast) {
        window.infoToast(
          'Đã từ chối chỉnh sửa',
          `Bạn đã từ chối chỉnh sửa môn học "${subjectName}" - tuần "${weekName}"`,
        );
        if (editingSubject === subjectName && editingWeekIndex != null) {
          weekSelect.value = String(editingWeekIndex);
          updateParseButton();
        }
      }
    };

    if (window.confirmInfo) {
      window.confirmInfo('Tuần học đã có đề', message, {
        confirmLabel: 'Có, chỉnh sửa',
        cancelLabel: 'Không',
      }).then(openEditor);
    } else if (window.showConfirm) {
      window.showConfirm({
        title: 'Tuần học đã có đề',
        message,
        confirmLabel: 'Có, chỉnh sửa',
        cancelLabel: 'Không',
        type: 'info',
      }).then(openEditor);
    } else {
      openEditor(window.confirm(message));
    }
  });

  // ── Parse ──
  btnParse.addEventListener('click', async () => {
    if (!currentFile) {
      if (window.warningToast) window.warningToast('Chưa có file', 'Vui lòng chọn file Word');
      return;
    }
    if (!subjectSelect.value) {
      if (window.warningToast) window.warningToast('Chưa chọn môn', 'Vui lòng chọn môn học');
      return;
    }

    const fileToParse = currentFile;
    parseController?.abort();
    const controller = new AbortController();
    parseController = controller;
    dropzone.classList.add('is-loading');
    btnParse.disabled = true;
    btnClear.disabled = false;

    const formData = new FormData();
    formData.append('file', fileToParse);
    formData.append('subject', subjectSelect.value);
    formData.append('week_index', weekSelect.value || '');

    try {
      const res = await fetch('/api/parse-word', {
        method: 'POST',
        headers: {
          'X-CSRFToken': csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: formData,
        credentials: 'same-origin',
        signal: controller.signal,
      });
      const data = await res.json();

      if (!res.ok || data.success === false) {
        const msg = data.error || 'Không thể parse file Word.';
        if (window.errorToast) window.errorToast('Lỗi parse', msg);
        renderQuestions([], []);
        return;
      }

      questions = Array.isArray(data.questions) ? data.questions : [];
      // Gán id tạm để popover tham chiếu
      questions.forEach((q, i) => {
        if (!q.id) q.id = `q-${Date.now()}-${i}`;
      });
      // Phát hiện câu trùng
      detectDuplicates();
      renderQuestions(questions, data.warnings || []);
      if (window.successToast) {
        window.successToast(
          'Đã parse',
          `${questions.length} câu hỏi từ "${fileToParse.name}"`,
        );
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (window.errorToast) {
        window.errorToast('Lỗi mạng', String(err && err.message ? err.message : err));
      }
      renderQuestions([], []);
    } finally {
      if (parseController === controller) {
        parseController = null;
        dropzone.classList.remove('is-loading');
        updateParseButton();
      }
    }
  });

  btnClear.addEventListener('click', async () => {
    if (!editingQuizCode && !currentFile && questions.length === 0) {
      if (window.infoToast) window.infoToast('Không có dữ liệu', 'Hiện chưa có file hoặc câu hỏi để xóa');
      return;
    }

    let confirmed = false;
    if (window.confirmDanger) {
      confirmed = await window.confirmDanger(
        'Xóa toàn bộ dữ liệu?',
        'File đã chọn và toàn bộ câu hỏi hiện tại sẽ bị xóa.',
        { confirmLabel: 'Xóa hết', cancelLabel: 'Hủy', detail: 'Hành động này không thể hoàn tác.' },
      );
    } else if (window.showConfirm) {
      confirmed = await window.showConfirm({
        title: 'Xóa toàn bộ dữ liệu?',
        message: 'File đã chọn và toàn bộ câu hỏi hiện tại sẽ bị xóa.',
        detail: 'Hành động này không thể hoàn tác.',
        confirmLabel: 'Xóa hết',
        cancelLabel: 'Hủy',
        type: 'danger',
      });
    } else {
      confirmed = window.confirm('Bạn có chắc muốn xóa toàn bộ file và câu hỏi hiện tại không?');
    }

    if (!confirmed) return;

    if (editingQuizCode) {
      try {
        const response = await fetch(`/api/quiz/${encodeURIComponent(editingQuizCode)}/delete`, {
          method: 'POST',
          headers: { 'X-CSRFToken': csrfToken },
          credentials: 'same-origin',
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Không thể xóa đề');
      } catch (error) {
        if (window.errorToast) window.errorToast('Lỗi xóa đề', error.message);
        return;
      }

      const weeks = loadWeeklyMap()[subjectSelect.value] || [];
      const selectedWeek = weeks[Number(weekSelect.value)];
      if (selectedWeek) {
        selectedWeek.quizCode = null;
        selectedWeek.link = '';
      }
      editingQuizCode = null;
      shareQuizCode = '';
      editingSubject = subjectSelect.value;
      editingWeekIndex = Number(weekSelect.value);
    }

    clearFile();
    questions = [];
    renderQuestions([], []);
    if (btnShare) btnShare.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M10 13a5 5 0 0 1 7.54.54l3-3a2 2 0 0 1 0-2.83"/><path d="M14 11a5 5 0 0 1-7.54-.54l-3-3a2 2 0 0 1 0-2.83"/></svg> Tạo link làm bài';
    if (window.infoToast) window.infoToast('Đã xóa', 'Danh sách câu hỏi đã được làm mới');
  });

  btnAddQuestion?.addEventListener('click', () => {
    const question = {
      id: `manual-${Date.now()}`,
      _isDraft: true,
      number: questions.length + 1,
      text: '',
      type: 'single_choice',
      type_label: '1 đáp án đúng',
      options: [
        { label: 'A', text: '', correct: false },
        { label: 'B', text: '', correct: false },
      ],
      correct_options: [],
      answer: null,
    };
    questions.push(question);
    renderQuestions(questions, []);
    openQuestionSettings(question.id);
  });

  // ── Share / Chuyển tiếp ──
  btnShare?.addEventListener('click', async () => {
    if (!questions || questions.length === 0) {
      if (window.errorToast) window.errorToast('Chưa có câu hỏi', 'Vui lòng parse câu hỏi trước.');
      return;
    }
    btnShare.disabled = true;
    btnShare.textContent = 'Đang xử lý...';
    try {
      const subjectName = subjectSelect?.value || '';
      const weekIndex = weekSelect?.value || '';
      const endpoint = editingQuizCode
        ? `/api/quiz/${encodeURIComponent(editingQuizCode)}/update`
        : '/api/save-quiz';
      const payload = {
        questions,
        subject: subjectName,
        week_index: weekIndex,
        title: subjectName || 'Bài thi',
      };
      if (!editingQuizCode) payload.duration_seconds = 1800;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        const quizCode = data.code || editingQuizCode;
        // Chuyển sang trang cấu hình
        window.history.replaceState({}, '', `/tao-de/?quiz=${encodeURIComponent(quizCode)}`);
        window.location.href = `/tao-de-cau-hinh/?quiz=${encodeURIComponent(quizCode)}`;
      } else {
        if (window.errorToast) window.errorToast('Lỗi', data.message || 'Không thể lưu đề.');
        btnShare.disabled = false;
        btnShare.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Chuyển tiếp';
      }
    } catch (err) {
      if (window.errorToast) window.errorToast('Lỗi kết nối', 'Không thể kết nối server.');
      btnShare.disabled = false;
      btnShare.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Chuyển tiếp';
    }
  });

  // ── Render ──
  // ╔══════════════════════════════════════════════════════════════╗
  // ║  Render phần chỉnh sửa cho 3 dạng đặc biệt                    ║
  // ╚══════════════════════════════════════════════════════════════╝
  function renderEditSpecial(q) {
    if (q.type === 'true_false') {
      if (Array.isArray(q.statements) && q.statements.length) {
        return `
          <div class="tq-edit-row tq-edit-grouped-statements-row">
            <span class="tq-edit-label">Toàn bộ mệnh đề (${q.statements.length})</span>
            <div class="tq-special tq-special--tf tq-special--tf-grouped">
              <p class="tq-tf-grouped-title">Các mệnh đề và đáp án</p>
            ${q.statements.map((statement, index) => `
              <div class="tq-tf-statement tq-tf-statement--editable" data-statement-index="${index}">
                <span class="tq-tf-statement__num">${index + 1}</span>
                <textarea class="tq-tf-statement__input" data-statement-text="${index}" rows="2">${escapeHtml(statement.text)}</textarea>
                <button type="button" class="tq-tf-option tq-tf-edit-option ${statement.answer === 'true' ? 'is-correct' : ''}" data-tf-value="true" data-statement-index="${index}">
                  <i data-lucide="check" class="tq-icon tq-icon--sm"></i> Đúng
                </button>
                <button type="button" class="tq-tf-option tq-tf-edit-option ${statement.answer === 'false' ? 'is-correct' : ''}" data-tf-value="false" data-statement-index="${index}">
                  <i data-lucide="x" class="tq-icon tq-icon--sm"></i> Sai
                </button>
              </div>
            `).join('')}
            <button type="button" class="tq-add-statement" data-action="add-statement">
              + Thêm mệnh đề Đúng/Sai
            </button>
            </div>
          </div>
        `;
      }
      const correct = (q.correct_options || [])[0];
      const tf = correct
        ? /sai|false/.test(correct.text.toLowerCase())
          ? 'false'
          : 'true'
        : '';
      return `
        <div class="tq-edit-row">
          <span class="tq-edit-label">Chọn đáp án đúng</span>
          <div class="tq-edit-tf">
            <label class="tq-edit-tf-item ${tf === 'true' ? 'is-active' : ''}">
              <input type="radio" name="tq-edit-tf" value="true" ${tf === 'true' ? 'checked' : ''} />
              <i data-lucide="check" class="tq-icon"></i> Đúng
            </label>
            <label class="tq-edit-tf-item ${tf === 'false' ? 'is-active' : ''}">
              <input type="radio" name="tq-edit-tf" value="false" ${tf === 'false' ? 'checked' : ''} />
              <i data-lucide="x" class="tq-icon"></i> Sai
            </label>
          </div>
        </div>
      `;
    }
    if (q.type === 'fill_in_blank') {
      return `
        <div class="tq-edit-row">
          <label class="tq-edit-label" for="tq-edit-fill-answer">Đáp án điền vào chỗ trống</label>
          <input
            type="text"
            id="tq-edit-fill-answer"
            class="tq-edit-input"
            value="${escapeHtml(q.fill_blank_answer || '')}"
            placeholder="VD: Việt Nam"
          />
          <p class="tq-edit-hint">
            <i data-lucide="info" class="tq-icon tq-icon--sm"></i>
            Trong nội dung câu hỏi, dùng <code>___</code>, <code>[ ]</code>, hoặc <code>( )</code> để đánh dấu chỗ trống.
          </p>
        </div>
      `;
    }
    if (q.type === 'ordering') {
      if (Array.isArray(q.statements) && q.statements.length) {
        return `
          <div class="tq-edit-row tq-edit-grouped-statements-row">
            <span class="tq-edit-label">Toàn bộ mệnh đề sắp xếp (${q.statements.length})</span>
            <div class="tq-edit-order-grouped">
              ${q.statements.map((statement, index) => `
                <div class="tq-edit-order-statement" data-order-statement="${index}">
                  <span class="tq-tf-statement__num">${index + 1}</span>
                  <label class="tq-edit-label">Từ lộn xộn</label>
                  <input type="text" class="tq-edit-input" data-order-words="${index}" value="${escapeHtml((statement.ordering_words || []).join('|'))}" placeholder="VD: Huy|name|is|My" />
                  <label class="tq-edit-label">Thứ tự đúng</label>
                  <input type="text" class="tq-edit-input" data-order-sequence="${index}" value="${escapeHtml((statement.ordering_sequence || []).join('|'))}" placeholder="VD: My|name|is|Huy" />
                </div>
              `).join('')}
              <button type="button" class="tq-add-statement" data-action="add-order-statement">
                + Thêm mệnh đề sắp xếp
              </button>
            </div>
          </div>
        `;
      }
      const words = (q.ordering_words || []).join('|');
      const seq = (q.ordering_sequence || []).join('|');
      return `
        <div class="tq-edit-row">
          <label class="tq-edit-label" for="tq-edit-order-words">Từ lộn xộn (các từ, phân cách bằng <code>|</code>)</label>
          <input
            type="text"
            id="tq-edit-order-words"
            class="tq-edit-input"
            value="${escapeHtml(words)}"
            placeholder="VD: Huy|name|is|My"
          />
        </div>
        <div class="tq-edit-row">
          <label class="tq-edit-label" for="tq-edit-order-seq">Thứ tự đúng (các từ, phân cách bằng <code>|</code>)</label>
          <input
            type="text"
            id="tq-edit-order-seq"
            class="tq-edit-input"
            value="${escapeHtml(seq)}"
            placeholder="VD: My|name|is|Huy"
          />
          <p class="tq-edit-hint">
            <i data-lucide="info" class="tq-icon tq-icon--sm"></i>
            Có thể kéo-thả các thẻ từ để thay đổi thứ tự sau khi lưu.
          </p>
        </div>
      `;
    }
    if (q.type === 'drag_into_groups') {
      const groups = q.drag_groups?.length ? q.drag_groups : [{ label: '', answers: [] }];
      return `
        <div class="tq-edit-row tq-edit-grouped-statements-row">
          <span class="tq-edit-label">Các nhóm phân loại (${groups.length})</span>
          <div class="tq-edit-order-grouped">
            ${groups.map((group, index) => `
              <div class="tq-edit-order-statement" data-drag-group="${index}">
                <span class="tq-tf-statement__num">${index + 1}</span>
                <label class="tq-edit-label">Tên nhóm</label>
                <input type="text" class="tq-edit-input" data-drag-group-label="${index}" value="${escapeHtml(group.label || '')}" placeholder="VD: Nguyên nhân chủ quan" />
                <label class="tq-edit-label">Đáp án trong nhóm (mỗi dòng 1 đáp án)</label>
                <textarea class="tq-edit-textarea tq-edit-textarea--sm" data-drag-group-answers="${index}" placeholder="VD: Nhân tố A">${escapeHtml((group.answers || []).join('\n'))}</textarea>
              </div>
            `).join('')}
            <button type="button" class="tq-add-statement" data-action="add-drag-group">
              + Thêm nhóm
            </button>
          </div>
        </div>
      `;
    }
    if (q.type === 'drag_into_text') {
      const answers = (q.drag_answers || []).join('\n');
      const sentences = (q.drag_sentences || []).map((s) => s.text).join('\n');
      return `
        <div class="tq-edit-drag-panel">
          <div class="tq-edit-drag-panel__header">
            <span class="tq-edit-drag-panel__icon"><i data-lucide="grip" class="tq-icon"></i></span>
            <div>
              <strong>Nội dung kéo thả</strong>
              <p>Nhập mỗi câu hoặc đáp án trên một dòng riêng.</p>
            </div>
          </div>
          <div class="tq-edit-drag-fields">
            <div class="tq-edit-drag-field">
              <label class="tq-edit-label" for="tq-edit-drag-sentences">Câu có chỗ trống <code>___</code></label>
              <textarea
                id="tq-edit-drag-sentences"
                class="tq-edit-textarea tq-edit-drag-textarea"
                rows="5"
                placeholder="VD: Đảng Cộng sản là ___ quan trọng nhất."
              >${escapeHtml(sentences)}</textarea>
              <span class="tq-edit-drag-field__hint">Mỗi dòng là một câu cần điền.</span>
            </div>
            <div class="tq-edit-drag-field">
              <label class="tq-edit-label" for="tq-edit-drag-answers">Đáp án kéo thả</label>
              <textarea
                id="tq-edit-drag-answers"
                class="tq-edit-textarea tq-edit-drag-textarea"
                rows="5"
                placeholder="VD: nhân tố chủ quan"
              >${escapeHtml(answers)}</textarea>
              <span class="tq-edit-drag-field__hint">Mỗi dòng là một đáp án tương ứng.</span>
            </div>
          </div>
          <p class="tq-edit-hint tq-edit-drag-tip">
            <i data-lucide="info" class="tq-icon tq-icon--sm"></i>
            Các đáp án sẽ hiển thị thành thẻ để kéo vào vị trí <code>___</code>.
          </p>
        </div>
      `;
    }
    // single_choice / multiple_response / unknown → render options A/B/C/D
    const optionsHtml = (q.options || [])
      .map(
        (o, i) => `
        <li class="tq-edit-option" data-idx="${i}">
          <span class="tq-edit-option-label">${escapeHtml(o.label)}</span>
          <input
            type="text"
            class="tq-edit-option-input"
            value="${escapeHtml(o.text)}"
            placeholder="Nội dung đáp án ${escapeHtml(o.label)}"
          />
          <label class="tq-edit-correct" title="Đánh dấu đáp án đúng">
            <input
              type="checkbox"
              class="tq-edit-correct-cb"
              ${o.correct ? 'checked' : ''}
            />
            <span><i data-lucide="check" class="tq-icon tq-icon--sm"></i></span>
          </label>
        </li>
      `,
      )
      .join('');
    return `
      <div class="tq-edit-row">
        <span class="tq-edit-label">Các đáp án</span>
        <ul class="tq-edit-options">${optionsHtml}</ul>
        <button type="button" class="tq-edit-add-option" data-action="add-option">
          + Thêm đáp án
        </button>
      </div>
    `;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  Render đặc biệt cho true_false / ordering / fill_in_blank    ║
  // ╚══════════════════════════════════════════════════════════════╝
  function renderSpecial(q) {
    if (q.type === 'true_false') {
      if (Array.isArray(q.statements) && q.statements.length) {
        return `
          <div class="tq-special tq-special--tf tq-special--tf-grouped tq-preview-grouped">
            <p class="tq-tf-grouped-title">Các mệnh đề và đáp án</p>
            ${q.statements.map((statement, index) => `
              <div class="tq-tf-statement tq-tf-statement--preview">
                <span class="tq-tf-statement__num">${index + 1}</span>
                <span class="tq-tf-statement__text">${escapeHtml(statement.text)}</span>
                <span class="tq-tf-option ${statement.answer === 'true' ? 'is-correct' : ''}">
                  <i data-lucide="check" class="tq-icon tq-icon--sm"></i> Đúng
                </span>
                <span class="tq-tf-option ${statement.answer === 'false' ? 'is-correct' : ''}">
                  <i data-lucide="x" class="tq-icon tq-icon--sm"></i> Sai
                </span>
              </div>
            `).join('')}
          </div>
        `;
      }
      const correct = (q.correct_options || [])[0];
      const ver = correct ? correct.text.replace(/[.。]/g, '').toLowerCase() : '';
      const isTrue = /đúng|true/.test(ver);
      return `
        <div class="tq-special tq-special--tf">
          <span class="tq-tf-option ${isTrue ? 'is-correct' : ''}">
            <i data-lucide="check" class="tq-icon tq-icon--sm"></i> Đúng
          </span>
          <span class="tq-tf-option ${!isTrue && correct ? 'is-correct' : ''}">
            <i data-lucide="x" class="tq-icon tq-icon--sm"></i> Sai
          </span>
        </div>
      `;
    }
    if (q.type === 'fill_in_blank') {
      const ans = q.fill_blank_answer;
      // Highlight chỗ trống ___ hoặc [ ] trong body
      const body = q.text || '';
      let htmlBody = escapeHtml(body);
      htmlBody = htmlBody.replace(
        /(_{3,}|\[\s*\]|\(\s*\)|…+|\.\.\.+)/g,
        '<span class="tq-fill-blank">______</span>',
      );
      const markerBlock = q.marker
        ? `<p class="tq-fill-marker"><i data-lucide="edit-3" class="tq-icon tq-icon--sm"></i>${escapeHtml(q.marker)}</p>`
        : '';
      const answerBlock = ans
        ? `<p class="tq-fill-answer">
            <i data-lucide="edit-3" class="tq-icon tq-icon--sm"></i>
            Đáp án điền: <strong>${escapeHtml(ans)}</strong>
          </p>`
        : `<p class="tq-fill-answer tq-fill-answer--missing">
            <i data-lucide="alert-triangle" class="tq-icon tq-icon--sm"></i>
            <span>Chưa xác định được đáp án điền</span>
            <em class="tq-fill-hint">
              Trong Word, đáp án cần nằm trên một dòng riêng có dấu
              <code>*</code>, <code>•</code>, hoặc <code>-</code>
              ở đầu (VD: <code>*Việt Nam</code>).
            </em>
          </p>`;
      return `
        <div class="tq-special tq-special--fill">
          ${markerBlock}
          <p class="tq-fill-sentence">${htmlBody}</p>
          ${answerBlock}
        </div>
      `;
    }
    if (q.type === 'ordering') {
      if (Array.isArray(q.statements) && q.statements.length) {
        return `<div class="tq-special tq-special--order tq-special--order-grouped">
          <p class="tq-order-grouped-title">Các mệnh đề sắp xếp</p>
          ${q.statements.map((statement, index) => `
            <div class="tq-order-statement">
              <span class="tq-tf-statement__num">${index + 1}</span>
              <div class="tq-order-row"><span class="tq-order-label">Từ lộn xộn</span><div class="tq-order-tiles">${statement.ordering_words.map((word) => `<span class="tq-order-tile">${escapeHtml(word)}</span>`).join('')}</div></div>
              <div class="tq-order-row"><span class="tq-order-label">Thứ tự đúng</span><div class="tq-order-tiles">${statement.ordering_sequence.map((word) => `<span class="tq-order-tile tq-order-tile--correct">${escapeHtml(word)}</span>`).join('')}</div></div>
            </div>
          `).join('')}
        </div>`;
      }
      const words = q.ordering_words || [];
      const seq = q.ordering_sequence || [];
      const markerBlock = q.marker
        ? `<p class="tq-fill-marker"><i data-lucide="align-vertical-justify-center" class="tq-icon tq-icon--sm"></i>${escapeHtml(q.marker)}</p>`
        : '';
      const missingHint = (words.length === 0 || seq.length === 0)
        ? `<p class="tq-fill-answer tq-fill-answer--missing">
            <i data-lucide="alert-triangle" class="tq-icon tq-icon--sm"></i>
            <span>${words.length === 0 && seq.length === 0
              ? 'Thiếu cả dãy từ lộn xộn (*) lẫn đáp án (**)'
              : words.length === 0
                ? 'Thiếu dãy từ lộn xộn (*)'
                : 'Thiếu đáp án thứ tự (**)'}</span>
            <em class="tq-fill-hint">
              Cần 2 dòng: <code>*word1|word2|...</code> (từ lộn xộn)
              và <code>**word1|word2|...</code> (thứ tự đúng).
            </em>
          </p>`
        : '';
      return `
        <div class="tq-special tq-special--order">
          ${markerBlock}
          <div class="tq-order-row">
            <span class="tq-order-label">Từ lộn xộn</span>
            <div class="tq-order-tiles">
              ${words.length
                ? words.map((w) => `<span class="tq-order-tile">${escapeHtml(w)}</span>`).join('')
                : '<span class="tq-order-tile tq-order-tile--muted">(chưa có)</span>'
              }
            </div>
          </div>
          <div class="tq-order-row">
            <span class="tq-order-label">Thứ tự đúng</span>
            <div class="tq-order-tiles">
              ${seq.length
                ? seq.map((w) => `<span class="tq-order-tile tq-order-tile--correct">${escapeHtml(w)}</span>`).join('')
                : '<span class="tq-order-tile tq-order-tile--muted">(chưa có)</span>'
              }
            </div>
          </div>
          ${missingHint}
        </div>
      `;
    }
    if (q.type === 'drag_into_text' || q.type === 'drag_into_groups') {
      const answers = q.drag_answers || [];
      const groups = q.drag_groups || [];
      if (q.type === 'drag_into_groups' || groups.length) {
        const groupHtml = groups.map((group, index) => `
          <div class="tq-drag-group">
            <div class="tq-drag-group-title"><span class="tq-tf-statement__num">${index + 1}</span>${escapeHtml(group.label)}</div>
            <div class="tq-drag-group-answers">${(group.answers || []).map((answer) => `<span class="tq-drag-tile tq-drag-tile--placed">${escapeHtml(answer)}</span>`).join('')}</div>
          </div>
        `).join('');
        const groupedAnswers = groups.flatMap((group) => group.answers || []);
        return `<div class="tq-special tq-special--drag tq-special--drag-groups">
          <div class="tq-drag-pool"><span class="tq-drag-pool-label">Đáp án kéo thả:</span><div class="tq-drag-tiles">${groupedAnswers.map((answer) => `<span class="tq-drag-tile">${escapeHtml(answer)}</span>`).join('')}</div></div>
          <div class="tq-drag-groups">${groupHtml}</div>
        </div>`;
      }
      const rawSentences = q.drag_sentences || [];
      // Đảo ngược: parser đọc câu từ dưới lên, để hiển thị đúng thứ tự thì cần đảo
      const sentences = rawSentences.slice().reverse();
      const missingHint = (sentences.length === 0 && answers.length === 0)
        ? `<p class="tq-drag-missing">
            <i data-lucide="alert-triangle" class="tq-icon tq-icon--sm"></i>
            <span>Thiếu cả câu có ___ lẫn đáp án (*)</span>
            <em class="tq-fill-hint">
              Cần dòng <code>*đáp án</code> cho mỗi chỗ trống ___ trong câu.
            </em>
          </p>`
        : (sentences.length === 0
          ? `<p class="tq-drag-missing">
              <i data-lucide="alert-triangle" class="tq-icon tq-icon--sm"></i>
              <span>Thiếu câu có ___ (chỗ trống)</span>
            </p>`
          : (answers.length === 0
            ? `<p class="tq-drag-missing">
                <i data-lucide="alert-triangle" class="tq-icon tq-icon--sm"></i>
                <span>Thiếu đáp án (*)</span>
              </p>`
            : ''));

      // Pool answers (reversed để khớp sentences đã đảo)
      const answersHtml = answers.length
        ? answers.slice().reverse().map((a) => `<span class="tq-drag-tile" draggable="true" data-answer="${escapeHtml(a)}">${escapeHtml(a)}</span>`).join('')
        : '<span class="tq-drag-tile tq-drag-tile--muted">(chưa có đáp án)</span>';

      // Sentences với slot ___ đã thay bằng đáp án (filled)
      const sentencesHtml = sentences.length
        ? sentences.map((s) => {
            const answer = s.answer || '';
            const filled = s.text.replace(
              /___+/,
              `<span class="tq-drag-slot" data-answer="${escapeHtml(answer)}">${escapeHtml(answer) || '___'}</span>`,
            );
            // filled đã chứa HTML span, KHÔNG escape lại
            return `<p class="tq-drag-sentence">${filled}</p>`;
          }).join('')
        : '<p class="tq-drag-sentence tq-drag-sentence--muted">(chưa có câu)</p>';

      return `
        <div class="tq-special tq-special--drag">
          <div class="tq-drag-pool">
            <span class="tq-drag-pool-label">Đáp án kéo thả:</span>
            <div class="tq-drag-tiles">${answersHtml}</div>
          </div>
          <div class="tq-drag-sentences">${sentencesHtml}</div>
          ${missingHint}
        </div>
      `;
    }
    return '';
  }

  function renderQuestions(items, warnings) {
    questions = items;

    // Stats — câu hợp lệ:
    //   - choice: ≥2 options + có answer
    //   - ordering: có ordering_words + ordering_sequence
    //   - fill_in_blank: có fill_blank_answer
    //   - true_false: có answer
    const validCount = items.filter((q) => {
      if (q.type === 'ordering') {
        if (Array.isArray(q.statements) && q.statements.length) {
          return q.statements.every((statement) =>
            (statement.ordering_words || []).length > 0
            && (statement.ordering_sequence || []).length > 0,
          );
        }
        return (q.ordering_words || []).length > 0
          && (q.ordering_sequence || []).length > 0;
      }
      if (q.type === 'fill_in_blank') {
        return !!q.fill_blank_answer;
      }
      if (q.type === 'true_false') {
        if (Array.isArray(q.statements) && q.statements.length) {
          return q.statements.length > 0
            && q.statements.every((statement) => statement.answer === 'true' || statement.answer === 'false');
        }
        return !!q.answer;
      }
      if (q.type === 'drag_into_groups') {
        return (q.drag_groups || []).length > 0
          && q.drag_groups.every((group) => group.label && (group.answers || []).length > 0);
      }
      if (q.type === 'drag_into_text') {
        return (q.drag_sentences || []).length > 0
          && (q.drag_answers || []).length > 0;
      }
      return q.options && q.options.length >= 2 && q.answer;
    }).length;
    const warnCount = items.length - validCount;

    // Đếm theo loại câu hỏi
    const counts = {
      single: items.filter((q) => q.type === 'single_choice').length,
      multiple: items.filter((q) => q.type === 'multiple_response').length,
      tf: items.filter((q) => q.type === 'true_false').length,
      fill: items.filter((q) => q.type === 'fill_in_blank').length,
      order: items.filter((q) => q.type === 'ordering').length,
      drag: items.filter((q) => q.type === 'drag_into_text').length,
      group: items.filter((q) => q.type === 'drag_into_groups').length,
      unknown: items.filter((q) => q.type === 'unknown').length,
      duplicate: items.filter((q) => q.isDuplicate).length,
    };

    countNum.textContent = items.length;
    toolbarStat.hidden = items.length === 0;
    statOk.textContent = validCount;
    statWarn.textContent = warnCount;
    statWarnWrap.hidden = warnCount === 0;

    // Cập nhật các badge thống kê loại câu hỏi (nếu có trong DOM)
    updateTypeCounters(counts);

    // Warnings panel
    warningsPanel.hidden = !warnings || warnings.length === 0;
    if (warnings && warnings.length) {
      warningsPanel.innerHTML = `
        <p class="tq-warnings-title">
          <i data-lucide="alert-triangle" class="tq-icon"></i>
          ${warnings.length} cảnh báo từ parser
        </p>
        <ul class="tq-warnings-list">
          ${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}
        </ul>
      `;
    }

    // List
    if (!items.length) {
      listEl.innerHTML = '';
      emptyState.hidden = false;
      btnClear.disabled = true;
      btnShare.disabled = true;
      return;
    }
    emptyState.hidden = true;
    btnClear.disabled = false;
    btnShare.disabled = false;

    listEl.innerHTML = items.map((q, idx) => {
      const opts = (q.options || []).map((o) => `
        <li class="tq-option ${o.correct ? 'is-correct' : ''}">
          <span class="tq-option-label">${escapeHtml(o.label)}</span>
          <span class="tq-option-text">${escapeHtml(o.text)}</span>
          ${o.correct ? `<span class="tq-option-correct-badge" aria-label="Đáp án đúng"><i data-lucide="check" class="tq-icon tq-icon--sm"></i><span>Đúng</span></span>` : ''}
        </li>
      `).join('');

      // ── Loại câu hỏi + đáp án đúng ──
      const typeClass = `tq-type--${q.type || 'unknown'}`;
      const typeLabel = q.type_label || 'Chưa xác định';
      const correctLabels = (q.correct_options || []).map((o) => o.label).join(', ');
      const isSpecial = q.type === 'ordering' || q.type === 'fill_in_blank' || q.type === 'drag_into_text' || q.type === 'drag_into_groups';

      // STT hiển thị = thứ tự thật trong danh sách (liên tục 1, 2, 3...)
      const displayNum = idx + 1;
      const showOriginal =
        q.number != null && q.number !== displayNum;

      // Hiển thị text câu hỏi. Nếu text rỗng, ưu tiên marker; nếu cả 2 rỗng → placeholder.
      const displayText = q.type === 'ordering'
        ? (q.text || 'Sắp xếp lại câu sau sao cho đúng cấu trúc.')
        : q.type === 'true_false' && q.statements?.length
          ? 'Chọn đáp án Đúng Sai phù hợp.'
          : q.type === 'drag_into_text'
            ? (q.text || 'Kéo thả các từ vào vị trí thích hợp.')
          : (q.text || q.marker || '');
      const textHtml = displayText
        ? escapeHtml(displayText)
        : '<em class="tq-text-empty">(Không có nội dung)</em>';
      const groupedTextHtml = Array.isArray(q.statements) && q.statements.length && q.type !== 'ordering' && q.type !== 'true_false'
        ? ''
        : textHtml;

      return `
        <li class="tq-question ${q.isDuplicate ? 'is-duplicate' : ''}" data-qid="${q.id}">
          <div class="tq-question-header">
            <span class="tq-question-num">${displayNum}</span>
            ${groupedTextHtml ? `<p class="tq-question-text">${groupedTextHtml}</p>` : ''}
            <div class="tq-question-actions">
              <button
                type="button"
                class="tq-question-settings"
                data-qid="${q.id}"
                title="Cài đặt câu hỏi"
                aria-label="Mở cài đặt câu hỏi"
              >
                <i data-lucide="settings-2" class="tq-icon"></i>
              </button>
              <button
                type="button"
                class="tq-question-delete"
                data-qid="${q.id}"
                title="Xóa câu hỏi"
                aria-label="Xóa câu hỏi"
              >
                <i data-lucide="trash-2" class="tq-icon"></i>
              </button>
            </div>
          </div>
          ${q.isDuplicate ? `
            <div class="tq-question-warning">
              <i data-lucide="copy-x" class="tq-icon"></i>
              <span>Câu hỏi trùng với ${escapeHtml(q.duplicateWith || 'câu khác')}</span>
            </div>
          ` : ''}
          <div class="tq-question-meta">
            <span class="tq-type ${typeClass}">
              ${escapeHtml(typeLabel)}
            </span>
            ${showOriginal
              ? `<span class="tq-original-num" title="STT gốc trong file Word">#${q.number}</span>`
              : ''}
            ${isSpecial
              ? ''  // ordering/fill đã hiển thị đáp án trong renderSpecial
              : q.type === 'true_false' && q.statements?.length
                ? ''
              : (correctLabels
                ? `<span class="tq-answer">Đáp án đúng: <strong>${escapeHtml(correctLabels)}</strong></span>`
                : `<span class="tq-answer tq-answer--missing">Chưa xác định đáp án đúng</span>`)
            }
          </div>

          ${renderSpecial(q)}

          ${q.type === 'true_false' ? '' : `<ul class="tq-options">${opts}</ul>`}
        </li>
      `;
    }).join('');

    // Gắn handler cho nút bánh răng
    listEl.querySelectorAll('.tq-question-settings').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const qid = btn.getAttribute('data-qid');
        openQuestionSettings(qid);
      });
    });

    // Gắn handler cho nút thùng rác
    listEl.querySelectorAll('.tq-question-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const qid = btn.getAttribute('data-qid');
        deleteQuestion(qid);
      });
    });

    // Khởi tạo Lucide icons trong DOM vừa render
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  POPOVER CÀI ĐẶT CÂU HỎI                                  ║
  // ║  Mở box nổi giữa màn hình cho phép:                        ║
  // ║  - Đổi loại câu hỏi (single ↔ multiple)                    ║
  // ║  - Sửa text câu hỏi                                         ║
  // ║  - Sửa nội dung + đánh dấu đáp án đúng cho từng option     ║
  // ╚══════════════════════════════════════════════════════════════╝

  function ensurePopover() {
    let overlay = document.getElementById('tq-settings-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'tq-settings-overlay';
    overlay.className = 'tq-settings-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="tq-settings-popover" role="dialog" aria-modal="true" aria-labelledby="tq-settings-title">
        <div class="tq-settings-header">
          <h3 class="tq-settings-title" id="tq-settings-title">
            <i data-lucide="settings-2" class="tq-icon"></i>
            <span>Cài đặt câu hỏi</span>
          </h3>
          <button type="button" class="tq-settings-close" aria-label="Đóng" data-action="close">
            <i data-lucide="x" class="tq-icon"></i>
          </button>
        </div>
        <div class="tq-settings-body" id="tq-settings-body"></div>
        <div class="tq-settings-footer">
          <button type="button" class="smh-btn smh-btn--ghost" data-action="close">Hủy</button>
          <button type="button" class="smh-btn smh-btn--primary" data-action="save">
            <i data-lucide="check" class="tq-icon"></i>
            <span>Lưu thay đổi</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Click overlay ngoài popover → đóng
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeQuestionSettings();
    });
    // Nút close / hủy
    overlay.querySelectorAll('[data-action="close"]').forEach((el) => {
      el.addEventListener('click', closeQuestionSettings);
    });
    // Nút lưu
    overlay.querySelector('[data-action="save"]').addEventListener(
      'click',
      saveQuestionSettings,
    );
    // ESC để đóng
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay.hidden) closeQuestionSettings();
    });

    return overlay;
  }

  let currentEditingQid = null;
  let questionEditSnapshot = null;
  let questionEditSaved = false;

  function openQuestionSettings(qid) {
    const overlay = ensurePopover();
    const q = questions.find((x) => x.id === qid);
    if (!q) return;

    if (currentEditingQid !== qid) {
      questionEditSnapshot = JSON.stringify(q);
      questionEditSaved = false;
    }
    currentEditingQid = qid;
    const body = overlay.querySelector('#tq-settings-body');

    // STT hiển thị = index + 1
    const idx = questions.findIndex((x) => x.id === qid);
    const displayNum = idx >= 0 ? idx + 1 : q.number;
    const isGroupedQuestion = (q.type === 'true_false' || q.type === 'ordering') && Array.isArray(q.statements) && q.statements.length;

    body.innerHTML = `
      <div class="tq-edit-row">
        <span class="tq-edit-label">Câu số</span>
        <span class="tq-edit-stt">${displayNum}</span>
        ${q.number != null && q.number !== displayNum
          ? `<span class="tq-edit-original">(gốc: #${q.number})</span>`
          : ''}
      </div>

      <div class="tq-edit-row">
        <span class="tq-edit-label">Loại câu hỏi</span>
        <div class="tq-edit-type tq-edit-type--seven" role="radiogroup">
          <button
            type="button"
            class="tq-edit-type-btn ${q.type === 'single_choice' ? 'is-active' : ''}"
            data-type="single_choice"
            role="radio"
            aria-checked="${q.type === 'single_choice'}"
            title="1 đáp án đúng"
          >
            <i data-lucide="circle-dot" class="tq-icon tq-icon--sm"></i>
            <span>1 đáp án</span>
          </button>
          <button
            type="button"
            class="tq-edit-type-btn ${q.type === 'multiple_response' ? 'is-active' : ''}"
            data-type="multiple_response"
            role="radio"
            aria-checked="${q.type === 'multiple_response'}"
            title="Nhiều đáp án đúng"
          >
            <i data-lucide="check-square" class="tq-icon tq-icon--sm"></i>
            <span>Nhiều</span>
          </button>
          <button
            type="button"
            class="tq-edit-type-btn ${q.type === 'true_false' ? 'is-active' : ''}"
            data-type="true_false"
            role="radio"
            aria-checked="${q.type === 'true_false'}"
            title="Đúng / Sai"
          >
            <i data-lucide="toggle-left" class="tq-icon tq-icon--sm"></i>
            <span>Đúng/Sai</span>
          </button>
          <button
            type="button"
            class="tq-edit-type-btn ${q.type === 'fill_in_blank' ? 'is-active' : ''}"
            data-type="fill_in_blank"
            role="radio"
            aria-checked="${q.type === 'fill_in_blank'}"
            title="Điền vào chỗ trống"
          >
            <i data-lucide="edit-3" class="tq-icon tq-icon--sm"></i>
            <span>Điền</span>
          </button>
          <button
            type="button"
            class="tq-edit-type-btn ${q.type === 'ordering' ? 'is-active' : ''}"
            data-type="ordering"
            role="radio"
            aria-checked="${q.type === 'ordering'}"
            title="Sắp xếp từ"
          >
            <i data-lucide="align-vertical-justify-center" class="tq-icon tq-icon--sm"></i>
            <span>Sắp xếp</span>
          </button>
          <button
            type="button"
            class="tq-edit-type-btn ${q.type === 'drag_into_text' ? 'is-active' : ''}"
            data-type="drag_into_text"
            role="radio"
            aria-checked="${q.type === 'drag_into_text'}"
            title="Kéo thả đáp án"
          >
            <i data-lucide="grip" class="tq-icon tq-icon--sm"></i>
            <span>Kéo thả</span>
          </button>
          <button
            type="button"
            class="tq-edit-type-btn ${q.type === 'drag_into_groups' ? 'is-active' : ''}"
            data-type="drag_into_groups"
            role="radio"
            aria-checked="${q.type === 'drag_into_groups'}"
            title="Phân loại đáp án vào từng nhóm"
          >
            <i data-lucide="rows-3" class="tq-icon tq-icon--sm"></i>
            <span>Phân nhóm</span>
          </button>
        </div>
      </div>

      ${isGroupedQuestion ? '' : `
        <div class="tq-edit-row">
          <label class="tq-edit-label" for="tq-edit-text">Nội dung câu hỏi</label>
          <textarea
            id="tq-edit-text"
            class="tq-edit-textarea"
            rows="3"
            placeholder="Nhập nội dung câu hỏi..."
          >${escapeHtml(q.text || '')}</textarea>
        </div>
      `}

      ${renderEditSpecial(q)}
    `;

    // Toggle type buttons
    body.querySelectorAll('.tq-edit-type-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        body.querySelectorAll('.tq-edit-type-btn').forEach((b) => {
          b.classList.remove('is-active');
          b.setAttribute('aria-checked', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-checked', 'true');

        if (btn.dataset.type === 'single_choice') {
          const checkedOptions = [...body.querySelectorAll('.tq-edit-correct-cb:checked')];
          checkedOptions.slice(1).forEach((checkbox) => {
            checkbox.checked = false;
          });
        }

        q.type = btn.dataset.type;
        openQuestionSettings(qid);
      });
    });

    body.querySelectorAll('.tq-tf-edit-option').forEach((button) => {
      button.addEventListener('click', () => {
        const statementIndex = Number(button.dataset.statementIndex);
        const statement = q.statements?.[statementIndex];
        if (!statement) return;
        statement.answer = button.dataset.tfValue;
        body.querySelectorAll(`.tq-tf-edit-option[data-statement-index="${statementIndex}"]`).forEach((option) => {
          option.classList.toggle('is-correct', option === button);
        });
      });
    });

    body.querySelectorAll('[data-statement-text]').forEach((input) => {
      input.addEventListener('input', () => {
        const statement = q.statements?.[Number(input.dataset.statementText)];
        if (statement) statement.text = input.value;
      });
    });

    body.querySelector('[data-action="add-statement"]')?.addEventListener('click', () => {
      q.statements.forEach((statement, index) => {
        const input = body.querySelector(`[data-statement-text="${index}"]`);
        if (input) statement.text = input.value;
      });
      q.statements.push({ text: '', answer: null });
      openQuestionSettings(qid);
      setTimeout(() => body.querySelector(`[data-statement-text="${q.statements.length - 1}"]`)?.focus(), 0);
    });

    body.querySelector('[data-action="add-order-statement"]')?.addEventListener('click', () => {
      q.statements.forEach((statement, index) => {
        const wordsInput = body.querySelector(`[data-order-words="${index}"]`);
        const sequenceInput = body.querySelector(`[data-order-sequence="${index}"]`);
        if (wordsInput) statement.ordering_words = wordsInput.value.split('|').map((word) => word.trim()).filter(Boolean);
        if (sequenceInput) statement.ordering_sequence = sequenceInput.value.split('|').map((word) => word.trim()).filter(Boolean);
      });
      q.statements.push({ ordering_words: [], ordering_sequence: [] });
      openQuestionSettings(qid);
      setTimeout(() => body.querySelector(`[data-order-words="${q.statements.length - 1}"]`)?.focus(), 0);
    });

    body.querySelector('[data-action="add-drag-group"]')?.addEventListener('click', () => {
      q.drag_groups = q.drag_groups || [];
      body.querySelectorAll('[data-drag-group]').forEach((groupEl, index) => {
        const labelInput = groupEl.querySelector(`[data-drag-group-label="${index}"]`);
        const answersInput = groupEl.querySelector(`[data-drag-group-answers="${index}"]`);
        q.drag_groups[index] = {
          label: labelInput?.value.trim() || '',
          answers: answersInput?.value.split('\n').map((answer) => answer.trim()).filter(Boolean) || [],
        };
      });
      q.drag_groups.push({ label: '', answers: [] });
      openQuestionSettings(qid);
    });

    body.querySelector('[data-action="add-option"]')?.addEventListener('click', () => {
      if (!Array.isArray(q.options)) q.options = [];
      const activeType = body.querySelector('.tq-edit-type-btn.is-active')?.dataset.type;
      if (activeType) q.type = activeType;

      const textInput = body.querySelector('#tq-edit-text');
      if (textInput) q.text = textInput.value;
      body.querySelectorAll('.tq-edit-option').forEach((row, index) => {
        if (!q.options[index]) return;
        const optionInput = row.querySelector('.tq-edit-option-input');
        const correctInput = row.querySelector('.tq-edit-correct-cb');
        if (optionInput) q.options[index].text = optionInput.value;
        if (correctInput) q.options[index].correct = correctInput.checked;
      });
      const nextLabel = String.fromCharCode('A'.charCodeAt(0) + q.options.length);
      q.options.push({ label: nextLabel, text: '', correct: false });
      openQuestionSettings(qid);
    });

    body.addEventListener('change', (event) => {
      const tfRadio = event.target.closest('input[name="tq-edit-tf"]');
      if (tfRadio) {
        body.querySelectorAll('.tq-edit-tf-item').forEach((item) => {
          item.classList.toggle('is-active', item.querySelector('input') === tfRadio);
        });
        return;
      }
      const checkbox = event.target.closest('.tq-edit-correct-cb');
      const activeType = body.querySelector('.tq-edit-type-btn.is-active')?.dataset.type;
      if (!checkbox || activeType !== 'single_choice' || !checkbox.checked) return;
      body.querySelectorAll('.tq-edit-correct-cb').forEach((other) => {
        if (other !== checkbox) other.checked = false;
      });
    });

    // Toggle single-choice: nếu user chọn single_choice mà có >1 đáp án đúng
    // → giữ nguyên và cảnh báo trong footer? Ở đây để user tự bỏ tick.
    // (UX an toàn: không tự động bỏ đáp án đúng.)

    overlay.hidden = false;
    document.body.classList.add('tq-popover-open');

    // Khởi tạo Lucide icons trong popover
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }

    // focus vào textarea
    setTimeout(() => {
      const ta = body.querySelector('#tq-edit-text');
      if (ta) ta.focus();
    }, 50);
  }

  function deleteQuestion(qid) {
    const q = questions.find((x) => x.id === qid);
    if (!q) return;
    const idx = questions.findIndex((x) => x.id === qid);
    const displayNum = idx >= 0 ? idx + 1 : q.number;

    // Xác nhận bằng confirm.js (dùng confirmDanger cho style đỏ)
    if (window.confirmDanger) {
      window.confirmDanger(
        'Xóa câu hỏi?',
        `Câu ${displayNum} sẽ bị xóa khỏi danh sách. Bạn có chắc chắn?`,
      ).then((ok) => {
        if (ok) performDelete(qid);
      });
    } else if (window.showConfirm) {
      window
        .showConfirm({
          title: 'Xóa câu hỏi?',
          message: `Câu ${displayNum} sẽ bị xóa khỏi danh sách. Bạn có chắc chắn?`,
          confirmLabel: 'Xóa',
          cancelLabel: 'Hủy',
          type: 'danger',
        })
        .then((ok) => {
          if (ok) performDelete(qid);
        });
    } else if (window.confirm(`Xóa câu ${displayNum}?`)) {
      performDelete(qid);
    }
  }

  function performDelete(qid) {
    const before = questions.length;
    questions = questions.filter((x) => x.id !== qid);
    if (questions.length === before) return;

    // Tính lại duplicate sau khi xóa
    detectDuplicates();

    renderQuestions(questions, []);
    saveCurrentQuiz();
    if (window.successToast) {
      window.successToast('Đã xóa', `Còn lại ${questions.length} câu hỏi`);
    }
  }

  // ╔══════════════════════════════════════════════════════════════╗
  // ║  PHÁT HIỆN CÂU HỎI TRÙNG                                  ║
  // ║  So sánh theo: (text chuẩn hóa) + (đáp án đúng)             ║
  // ╚══════════════════════════════════════════════════════════════╝
  function normalizeText(s) {
    if (!s) return '';
    return s
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỷỹđ]/g, '')
      .trim();
  }

  function detectDuplicates() {
    // Reset
    questions.forEach((q) => {
      q.isDuplicate = false;
      q.duplicateWith = null;
    });

    const seen = new Map(); // key → first index
    questions.forEach((q, idx) => {
      // Cùng đề nhưng khác đáp án vẫn là hai câu hợp lệ.
      let questionKey = normalizeText(q.text || q.marker || '');
      let answerKey = '';
      if (q.type === 'true_false' && Array.isArray(q.statements) && q.statements.length) {
        questionKey = q.statements.map((statement) => normalizeText(statement.text || '')).join('|');
        answerKey = q.statements.map((statement) => normalizeText(statement.answer || '')).join('|');
      } else if (q.type === 'ordering' && Array.isArray(q.statements) && q.statements.length) {
        questionKey = q.statements
          .map((statement) => (statement.ordering_words || []).map(normalizeText).join('|'))
          .join('||');
        answerKey = q.statements
          .map((statement) => (statement.ordering_sequence || []).map(normalizeText).join('|'))
          .join('||');
      } else if (q.type === 'drag_into_text' && Array.isArray(q.drag_sentences) && q.drag_sentences.length) {
        questionKey = q.drag_sentences.map((sentence) => normalizeText(sentence.text || '')).join('|');
        answerKey = q.drag_sentences.map((sentence) => normalizeText(sentence.answer || '')).join('|');
      } else if (q.type === 'drag_into_groups' && Array.isArray(q.drag_groups)) {
        questionKey = q.drag_groups
          .map((group) => normalizeText(group.label || ''))
          .join('|');
        answerKey = q.drag_groups
          .map((group) => (group.answers || []).map(normalizeText).sort().join('|'))
          .join('||');
      } else if (q.type === 'fill_in_blank') {
        answerKey = normalizeText(q.fill_blank_answer || q.answer || '');
      } else {
        answerKey = (q.correct_options || q.options || [])
          .filter((option) => option.correct)
          .map((option) => String(option.label || '').toUpperCase())
          .sort()
          .join('|');
      }

      // Câu kéo thả chỉ có prompt mặc định thì không đủ dữ liệu để kết luận trùng.
      const genericDragPrompt = (q.type === 'drag_into_text'
        && questionKey === normalizeText('Kéo thả các từ vào vị trí thích hợp.'))
        || (q.type === 'drag_into_groups'
          && questionKey === normalizeText('Phân chia đáp án vào nhóm phù hợp.'));
      if (!questionKey || genericDragPrompt) return;

      const key = `${q.type || 'unknown'}::${questionKey}::${answerKey}`;

      if (seen.has(key)) {
        const firstIdx = seen.get(key);
        const firstNum = firstIdx + 1;
        q.isDuplicate = true;
        q.duplicateWith = `câu ${firstNum}`;
        // Đánh dấu luôn câu đầu tiên
        if (!questions[firstIdx].isDuplicate) {
          questions[firstIdx].isDuplicate = true;
          questions[firstIdx].duplicateWith = `câu ${idx + 1}`;
        }
      } else {
        seen.set(key, idx);
      }
    });
  }

  function closeQuestionSettings() {
    const overlay = document.getElementById('tq-settings-overlay');
    if (overlay) overlay.hidden = true;
    document.body.classList.remove('tq-popover-open');
    const draftIndex = questions.findIndex((question) => question._isDraft);
    if (draftIndex !== -1) {
      questions.splice(draftIndex, 1);
      renderQuestions(questions, []);
    } else if (currentEditingQid && questionEditSnapshot && !questionEditSaved) {
      const question = questions.find((item) => item.id === currentEditingQid);
      if (question) {
        Object.assign(question, JSON.parse(questionEditSnapshot));
        renderQuestions(questions, []);
      }
    }
    currentEditingQid = null;
    questionEditSnapshot = null;
    questionEditSaved = false;
  }

  async function loadExistingQuiz() {
    if (!editingQuizCode) return;
    try {
      const response = await fetch(`/api/quiz/${encodeURIComponent(editingQuizCode)}`, {
        credentials: 'same-origin',
      });
      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          response.ok
            ? 'Máy chủ trả về dữ liệu không hợp lệ.'
            : `Máy chủ đang lỗi (${response.status}). Hãy chạy cpanel_migrate.py rồi thử lại.`,
        );
      }
      if (!response.ok || !data.success) throw new Error(data.message || 'Không thể tải đề');
      questions = Array.isArray(data.questions) ? data.questions : [];
      questions.forEach((question, index) => {
        if (!question.id) question.id = `saved-${editingQuizCode}-${index}`;
      });
      if (data.subject && Array.from(subjectSelect.options).some((option) => option.value === data.subject)) {
        subjectSelect.value = data.subject;
        updateWeeks();
        if (data.week_index != null) {
          editingSubject = data.subject;
          editingWeekIndex = Number(data.week_index);
          if (!weekSelectionTouched) weekSelect.value = String(data.week_index);
          updateParseButton();
        }
      }
      detectDuplicates();
      renderQuestions(questions, []);
      if (btnShare) btnShare.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Chuyển tiếp';
      const weeks = loadWeeklyMap()[data.subject] || [];
      const weekName = data.week_index != null
        ? (weeks[Number(data.week_index)]?.name || `Tuần ${Number(data.week_index) + 1}`)
        : 'tuần chưa xác định';
      if (window.infoToast) {
        window.infoToast(
          'Đang chỉnh sửa',
          `Bạn đang chỉnh sửa môn học "${data.subject || 'chưa xác định'}" - tuần "${weekName}"`,
        );
      }
    } catch (error) {
      editingQuizCode = null;
      if (window.errorToast) window.errorToast('Lỗi', error.message);
    }
  }

  async function saveCurrentQuiz() {
    if (!editingQuizCode) return true;
    try {
      const response = await fetch(`/api/quiz/${encodeURIComponent(editingQuizCode)}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
        credentials: 'same-origin',
        body: JSON.stringify({ questions }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Không thể lưu đề');
      return true;
    } catch (error) {
      if (window.errorToast) window.errorToast('Lỗi lưu đề', error.message);
      return false;
    }
  }

  function parseDuration(value) {
    const match = String(value || '').trim().match(/^(\d{1,3}):([0-5]\d)$/);
    if (!match) return 0;
    const seconds = Number(match[1]) * 60 + Number(match[2]);
    return seconds >= 60 && seconds <= 86400 ? seconds : 0;
  }

  function formatDuration(seconds) {
    const total = Math.max(60, Number(seconds) || 1800);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  function saveQuestionSettings() {
    if (!currentEditingQid) return;
    const overlay = document.getElementById('tq-settings-overlay');
    const body = overlay.querySelector('#tq-settings-body');

    const q = questions.find((x) => x.id === currentEditingQid);
    if (!q) return closeQuestionSettings();

    // 1. Lấy text câu hỏi
    const textInput = body.querySelector('#tq-edit-text');
    const text = textInput ? textInput.value.trim() : q.text;
    // 2. Lấy loại
    const activeTypeBtn = body.querySelector('.tq-edit-type-btn.is-active');
    const newType = activeTypeBtn ? activeTypeBtn.dataset.type : q.type;

    q.text = text;
    q.type = newType;
    q._isDraft = false;
    questionEditSaved = true;

    // 3. Lưu theo từng loại
    if (newType === 'true_false') {
      if (Array.isArray(q.statements) && q.statements.length) {
        body.querySelectorAll('[data-statement-text]').forEach((input) => {
          const statement = q.statements[Number(input.dataset.statementText)];
          if (statement) statement.text = input.value.trim();
        });
        q.correct_options = [];
        q.answer = null;
        q.type_label = 'Đúng / Sai';
        q.is_true_false = true;
        q.options = [];
        q._isDraft = false;
        detectDuplicates();
        renderQuestions(questions, []);
        saveCurrentQuiz();
        closeQuestionSettings();
        if (window.successToast) window.successToast('Đã lưu', 'Các đáp án Đúng/Sai đã được cập nhật');
        return;
      }
      const tfRadio = body.querySelector('input[name="tq-edit-tf"]:checked');
      const tfValue = tfRadio ? tfRadio.value : '';
      q.options = [
        { label: 'A', text: 'Đúng', correct: tfValue === 'true' },
        { label: 'B', text: 'Sai', correct: tfValue === 'false' },
      ];
      q.correct_options = q.options.filter((o) => o.correct);
      q.is_true_false = true;
      q.is_ordering = false;
      q.is_fill_in_blank = false;
      q.is_drag_into_text = false;
      q.type_label = 'Đúng / Sai';
      q.answer = tfValue ? (tfValue === 'true' ? 'A' : 'B') : null;
    } else if (newType === 'fill_in_blank') {
      const ansInput = body.querySelector('#tq-edit-fill-answer');
      const ans = ansInput ? ansInput.value.trim() : '';
      q.fill_blank_answer = ans;
      q.options = [];
      q.correct_options = [];
      q.is_fill_in_blank = true;
      q.is_true_false = false;
      q.is_ordering = false;
      q.is_drag_into_text = false;
      q.type_label = 'Điền từ vào chỗ trống';
      q.answer = ans;
    } else if (newType === 'ordering') {
      if (Array.isArray(q.statements) && q.statements.length) {
        q.statements.forEach((statement, index) => {
          const wordsInput = body.querySelector(`[data-order-words="${index}"]`);
          const sequenceInput = body.querySelector(`[data-order-sequence="${index}"]`);
          statement.ordering_words = wordsInput.value.split('|').map((word) => word.trim()).filter(Boolean);
          statement.ordering_sequence = sequenceInput.value.split('|').map((word) => word.trim()).filter(Boolean);
        });
        q.ordering_words = null;
        q.ordering_sequence = null;
        q.options = [];
        q.correct_options = [];
        q.is_ordering = true;
        q.is_true_false = false;
        q.is_fill_in_blank = false;
        q.is_drag_into_text = false;
        q.type_label = 'Sắp xếp từ';
        q.answer = null;
        detectDuplicates();
        renderQuestions(questions, []);
        saveCurrentQuiz();
        closeQuestionSettings();
        if (window.successToast) window.successToast('Đã lưu', 'Các mệnh đề sắp xếp đã được cập nhật');
        return;
      }
      const wordsInput = body.querySelector('#tq-edit-order-words');
      const seqInput = body.querySelector('#tq-edit-order-seq');
      const words = (wordsInput ? wordsInput.value : '').split('|').map((s) => s.trim()).filter(Boolean);
      const seq = (seqInput ? seqInput.value : '').split('|').map((s) => s.trim()).filter(Boolean);
      q.ordering_words = words;
      q.ordering_sequence = seq;
      q.options = [];
      q.correct_options = [];
      q.is_ordering = true;
      q.is_true_false = false;
      q.is_fill_in_blank = false;
      q.is_drag_into_text = false;
      q.type_label = 'Sắp xếp từ';
      q.answer = seq.join('|');
    } else if (newType === 'drag_into_groups') {
      const groups = [];
      body.querySelectorAll('[data-drag-group]').forEach((groupEl, index) => {
        const labelInput = groupEl.querySelector(`[data-drag-group-label="${index}"]`);
        const answersInput = groupEl.querySelector(`[data-drag-group-answers="${index}"]`);
        const answers = answersInput
          ? answersInput.value.split('\n').map((answer) => answer.trim()).filter(Boolean)
          : [];
        if (labelInput?.value.trim() || answers.length) {
          groups.push({ label: labelInput?.value.trim() || '', answers });
        }
      });
      q.drag_groups = groups;
      q.drag_answers = groups.flatMap((group) => group.answers);
      q.drag_sentences = null;
      q.options = [];
      q.correct_options = [];
      q.is_drag_into_text = true;
      q.is_true_false = false;
      q.is_ordering = false;
      q.is_fill_in_blank = false;
      q.type_label = 'Kéo thả theo nhóm';
      q.answer = null;
    } else if (newType === 'drag_into_text') {
      // Đáp án: mỗi dòng là 1 answer, phân cách bằng newline
      const answersInput = body.querySelector('#tq-edit-drag-answers');
      const answers = answersInput
        ? answersInput.value.split('\n').map((s) => s.trim()).filter(Boolean)
        : [];
      q.drag_answers = answers;
      // Câu có ___: mỗi dòng là 1 câu với ___ ở trong
      const sentencesInput = body.querySelector('#tq-edit-drag-sentences');
      const sentences = sentencesInput
        ? sentencesInput.value.split('\n').map((s) => s.trim()).filter(Boolean)
        : [];
      q.drag_sentences = sentences.map((text) => ({ text }));
      // Match answers → sentences
      for (let i = 0; i < q.drag_sentences.length; i++) {
        q.drag_sentences[i].answer = answers[i] || null;
      }
      q.options = [];
      q.correct_options = [];
      q.is_drag_into_text = true;
      q.drag_groups = [];
      q.is_true_false = false;
      q.is_ordering = false;
      q.is_fill_in_blank = false;
      q.type_label = 'Kéo thả đáp án';
      q.answer = null;
    } else if (newType === 'true_false' && Array.isArray(q.statements)) {
      q.correct_options = [];
      q.answer = null;
    } else {
      // single_choice / multiple_response / unknown
      const newOptions = [];
      body.querySelectorAll('.tq-edit-option').forEach((li) => {
        const idx = parseInt(li.dataset.idx, 10);
        const orig = q.options[idx] || { label: 'A' };
        const input = li.querySelector('.tq-edit-option-input');
        const cb = li.querySelector('.tq-edit-correct-cb');
        newOptions.push({
          label: orig.label,
          text: input ? input.value.trim() : '',
          correct: cb ? cb.checked : false,
        });
      });
      q.options = newOptions;
      q.correct_options = newOptions.filter((o) => o.correct);
      q.is_true_false = false;
      q.is_ordering = false;
      q.is_fill_in_blank = false;
      q.is_drag_into_text = false;
      q.drag_answers = null;
      q.drag_sentences = null;

      const correctCount = q.correct_options.length;
      if (newType === 'single_choice') {
        q.type_label = '1 đáp án đúng';
        q.answer = correctCount ? q.correct_options[0].label : null;
      } else if (newType === 'multiple_response') {
        q.type_label = 'Nhiều đáp án đúng';
        q.answer = q.correct_options.map((o) => o.label).join(', ');
      } else {
        q.type_label = 'Chưa xác định';
        q.answer = null;
      }
    }

    // Re-render (tính lại duplicate vì text/answer có thể đã đổi)
    detectDuplicates();
    renderQuestions(questions, []);
    saveCurrentQuiz();
    closeQuestionSettings();

    if (window.successToast) {
      window.successToast('Đã lưu', 'Câu hỏi đã được cập nhật');
    }
  }

  // ── Init ──
  renderQuestions([], []);
  populateSubjects();
  loadDatabaseSubjects().finally(() => {
    populateSubjects();
    loadExistingQuiz();
    syncExistingQuizLinks();
  });
});