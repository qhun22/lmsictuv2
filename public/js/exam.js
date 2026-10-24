/* exam.js - Basic Exam Logic */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const $ = id => document.getElementById(id);

  const questions = window.__QUIZ_DATA__ || [];
  const quizCode = window.__QUIZ_CODE__ || '';
  const questionOrder = window.__QUIZ_QUESTION_ORDER__ || questions.map((_, index) => index);
  const showAnswersImmediately = window.__SHOW_ANSWERS_IMMEDIATELY__ === true;

  if (!questions.length) {
    $('question-card').innerHTML = '<p style="text-align:center;color:#888;padding:40px;">Không có câu hỏi nào.</p>';
    return;
  }

  // State
  let currentIdx = 0;
  let answers = {};
  let submitted = false;
  let submitting = false;
  let remainingSeconds = Number(window.__QUIZ_DURATION__) || 1800;
  let accessCheckInProgress = false;

  $('btn-submit').textContent = showAnswersImmediately ? 'Tổng kết' : 'Nộp bài';

  const accessCheck = setInterval(async () => {
    if (submitted || accessCheckInProgress) return;
    accessCheckInProgress = true;
    try {
      const response = await fetch(`/api/exam/${encodeURIComponent(quizCode)}/access`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok || !data.allowed) {
        submitted = true;
        clearInterval(accessCheck);
        clearInterval(timer);
        window.location.replace('/home/?access=revoked');
      }
    } catch {
      // Giữ bài làm khi mạng chập chờn; lần kiểm tra kế tiếp sẽ thử lại.
    } finally {
      accessCheckInProgress = false;
    }
  }, 5000);

  function formatTimer(seconds) {
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  $('exam-timer').textContent = formatTimer(remainingSeconds);

  const timer = setInterval(() => {
    if (submitted) return;
    remainingSeconds = Math.max(0, remainingSeconds - 1);
    $('exam-timer').textContent = formatTimer(remainingSeconds);
    if (remainingSeconds === 0 && !submitting) submitExam(true);
  }, 1000);

  // Helpers
  function esc(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]));
  }

  function openTouchChoice(title, options, onChoose) {
    const overlay = $('touch-choice-overlay');
    const titleEl = $('touch-choice-title');
    const optionsEl = $('touch-choice-options');
    if (!overlay || !optionsEl) return;

    titleEl.textContent = title;
    optionsEl.innerHTML = '';
    options.forEach(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'touch-choice-option';
      button.textContent = option.label;
      button.addEventListener('click', () => {
        closeTouchChoice();
        onChoose(option.value);
      });
      optionsEl.appendChild(button);
    });
    overlay.hidden = false;
  }

  function closeTouchChoice() {
    const overlay = $('touch-choice-overlay');
    if (overlay) overlay.hidden = true;
  }

  // Render question
  function renderQuestion(q, idx) {
    const num = idx + 1;
    const type = q.type || 'single_choice';
    const typeLabel = q.type_label || '1 đáp án đúng';

    $('question-num').textContent = `Câu ${num}`;
    $('question-type').textContent = typeLabel;
    const currentNum = $('current-num');
    if (currentNum) currentNum.textContent = num;

    // Question text
    let text = q.text || '';
    if (type === 'ordering') text = q.text || 'Sắp xếp các từ theo đúng thứ tự.';
    if (type === 'true_false' && q.statements?.length) text = 'Chọn Đúng hoặc Sai cho mỗi mệnh đề.';
    if (type === 'drag_into_text') text = q.text || 'Kéo đáp án vào chỗ trống.';
    $('question-text').textContent = text;

    const list = $('answer-list');
    list.innerHTML = '';
    list.classList.remove('tf-statements', 'is-grid', 'is-stack', 'text-drag-list', 'ordering-list', 'grouping-list', 'is-locked');
    delete list.dataset.answerState;

    if (type === 'single_choice' || type === 'multiple_response') {
      renderChoice(q, idx, list);
    } else if (type === 'true_false') {
      renderTF(q, idx, list);
    } else if (type === 'fill_in_blank') {
      renderFill(q, idx, list);
    } else if (type === 'ordering') {
      renderOrder(q, idx, list);
    } else if (type === 'drag_into_text') {
      renderDragIntoText(q, idx, list);
    } else if (type === 'drag_into_groups') {
      renderDrag(q, idx, list);
    } else {
      list.innerHTML = '<p style="color:#888;">Dạng câu hỏi này chưa được hỗ trợ.</p>';
    }

    updateNav();
  }

  // Single/Multiple choice
  function renderChoice(q, idx, container) {
    const opts = q.options || [];
    const selected = answers[idx] || [];

    opts.forEach(opt => {
      const div = document.createElement('div');
      const displayLabel = opt.display_label || opt.label;
      div.className = 'answer-item' + (selected.includes(opt.label) ? ' selected' : '');
      div.dataset.answerLabel = opt.label;
      div.innerHTML = `<span class="answer-label">${displayLabel}</span><span class="answer-text">${esc(opt.text)}</span>`;
      div.addEventListener('click', () => {
        if (submitted) return;
        if (q.type === 'multiple_response') {
          const cur = answers[idx] || [];
          const i = cur.indexOf(opt.label);
          if (i >= 0) cur.splice(i, 1);
          else cur.push(opt.label);
          answers[idx] = cur;
          div.classList.toggle('selected');
        } else {
          answers[idx] = [opt.label];
          container.querySelectorAll('.answer-item').forEach(el => el.classList.remove('selected'));
          div.classList.add('selected');
        }
        updateNav();
        showImmediateFeedback(q, idx, container);
      });
      container.appendChild(div);
    });
  }

  function showImmediateFeedback(question, idx, container) {
    if (!showAnswersImmediately || submitted) return;
    if (!isFeedbackReady(question, answers[idx])) {
      container.classList.remove('is-locked');
      container.querySelectorAll('.answer-item').forEach(item => item.classList.remove('correct', 'wrong'));
      return;
    }
    const result = { user_answer: answers[idx] };
    const correct = calculateResultCorrect(question, result);
    container.querySelectorAll('.answer-item').forEach(item => {
      const label = item.dataset.answerLabel || item.querySelector('.answer-label')?.textContent || '';
      const expected = getCorrectOptions(question).some(option => String(option.label).toUpperCase() === label.toUpperCase());
      item.classList.toggle('correct', expected);
      item.classList.toggle('wrong', !expected && (answers[idx] || []).includes(label));
    });
    container.dataset.answerState = correct ? 'correct' : 'wrong';
    lockQuestionInput(container);
  }

  // True/False
  function renderTF(q, idx, container) {
    const statements = q.statements || [];
    container.classList.add('tf-statements');
    container.classList.toggle('is-grid', statements.length >= 4);
    container.classList.toggle('is-stack', statements.length < 4);

    if (statements.length) {
      statements.forEach((stmt, si) => {
        const div = document.createElement('div');
        div.className = 'tf-statement';
        div.innerHTML = `<p style="margin-bottom:8px;font-weight:500;">${si + 1}. ${esc(stmt.text)}</p>`;
        const btnGroup = document.createElement('div');
        btnGroup.className = 'tf-buttons';
        const selected = (answers[idx] || {})[si];

        ['Đúng', 'Sai'].forEach((label, i) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'tf-btn' + (selected === (i === 0 ? 'true' : 'false') ? ' selected' : '');
          btn.textContent = label;
          btn.addEventListener('click', () => {
            if (submitted) return;
            if (!answers[idx]) answers[idx] = {};
            answers[idx][si] = i === 0 ? 'true' : 'false';
            btnGroup.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            updateNav();
          });
          btnGroup.appendChild(btn);
        });
        div.appendChild(btnGroup);
        container.appendChild(div);
      });
    } else {
      const btnGroup = document.createElement('div');
      btnGroup.className = 'tf-buttons';
      const selected = answers[idx];
      ['Đúng', 'Sai'].forEach((label, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tf-btn' + (selected === (i === 0 ? 'true' : 'false') ? ' selected' : '');
        btn.textContent = label;
        btn.addEventListener('click', () => {
          if (submitted) return;
          answers[idx] = i === 0 ? 'true' : 'false';
          btnGroup.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          updateNav();
        });
        btnGroup.appendChild(btn);
      });
      container.appendChild(btnGroup);
    }
  }

  // Fill in blank
  function renderFill(q, idx, container) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'fill-input';
    input.placeholder = 'Nhập đáp án...';
    input.value = answers[idx] || '';
    input.addEventListener('input', () => {
      if (submitted) return;
      answers[idx] = input.value.trim();
      updateNav();
    });
    container.appendChild(input);
  }

  // Ordering
  function renderOrder(q, idx, container) {
    container.classList.add('ordering-list');
    const statements = q.statements?.length
      ? q.statements
      : [{ ordering_words: q.ordering_words || [] }];
    if (!statements.some(statement => statement.ordering_words?.length)) {
      container.innerHTML = '<p style="color:#888;">Chưa có dữ liệu sắp xếp.</p>';
      return;
    }
    const saved = answers[idx] && typeof answers[idx] === 'object' ? answers[idx] : {};
    answers[idx] = saved;
    container.classList.add('ordering-statements');
    container.classList.toggle('is-grid', statements.length >= 4);

    statements.forEach((statement, statementIndex) => {
      const words = [...(statement.ordering_words || [])];
      if (!words.length) return;
      const savedOrder = saved[String(statementIndex)]?.split('|').filter(Boolean);
      const ordered = savedOrder?.length ? savedOrder : [];
      const available = words.filter(word => !ordered.includes(word));
      const block = document.createElement('section');
      block.className = 'ordering-statement';
      block.innerHTML = statements.length > 1
        ? `<div class="ordering-statement-title">${statementIndex + 1}.</div>`
        : '';

      const pool = document.createElement('div');
      pool.className = 'ordering-pool';
      const orderZone = document.createElement('div');
      orderZone.className = 'ordering-zone';
      orderZone.innerHTML = '<span class="ordering-placeholder">_ _ _ _</span>';

      const refresh = () => {
        pool.innerHTML = '';
        orderZone.innerHTML = '';
        ordered.forEach((word, position) => orderZone.appendChild(createOrderingChip(word, position, true)));
        available.forEach((word, position) => pool.appendChild(createOrderingChip(word, position, false)));
        if (!ordered.length) orderZone.innerHTML = '<span class="ordering-placeholder">_ _ _ _</span>';
        saved[String(statementIndex)] = ordered.join('|');
        updateNav();
      };
      const createOrderingChip = (word, position, inOrder) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `ordering-chip${inOrder ? ' is-placed' : ''}`;
        chip.textContent = word;
        chip.draggable = true;
        chip.addEventListener('click', () => {
          if (inOrder) {
            available.push(word);
            ordered.splice(position, 1);
            refresh();
          } else {
            ordered.push(word);
            available.splice(position, 1);
            refresh();
          }
        });
        chip.addEventListener('dragstart', event => {
          event.dataTransfer.setData('text/plain', JSON.stringify({ word, inOrder, position }));
        });
        return chip;
      };
      orderZone.addEventListener('dragover', event => event.preventDefault());
      orderZone.addEventListener('drop', event => {
        event.preventDefault();
        const data = JSON.parse(event.dataTransfer.getData('text/plain'));
        if (data.inOrder) ordered.splice(data.position, 1);
        else available.splice(data.position, 1);
        ordered.push(data.word);
        refresh();
      });
      pool.addEventListener('dragover', event => event.preventDefault());
      pool.addEventListener('drop', event => {
        event.preventDefault();
        const data = JSON.parse(event.dataTransfer.getData('text/plain'));
        if (data.inOrder) {
          ordered.splice(data.position, 1);
          available.push(data.word);
          refresh();
        }
      });
      block.append(pool, orderZone);
      container.appendChild(block);
      refresh();
    });
  }

  // Drag into text
  function renderDragIntoText(q, idx, container) {
    container.classList.add('text-drag-list');
    const sentences = q.drag_sentences || [];
    const allAnswers = q.drag_answers || [];
    if (!sentences.length || !allAnswers.length) {
      container.innerHTML = '<p style="color:#888;">Chưa có dữ liệu kéo thả.</p>';
      return;
    }
    const sentenceAnswers = answers[idx] && typeof answers[idx] === 'object' ? answers[idx] : {};
    answers[idx] = sentenceAnswers;
    const pool = document.createElement('div');
    pool.className = 'text-drag-pool';
    const poolTitle = document.createElement('strong');
    poolTitle.textContent = 'Đáp án';
    pool.appendChild(poolTitle);
    const sentenceList = document.createElement('div');
    sentenceList.className = 'text-drag-sentences';

    const render = () => {
      pool.querySelectorAll('.text-drag-chip').forEach(chip => chip.remove());
      const used = new Set(Object.values(sentenceAnswers).filter(Boolean));
      allAnswers.filter(answer => !used.has(answer)).forEach(answer => pool.appendChild(createTextChip(answer)));
      sentenceList.innerHTML = '';
      sentences.forEach((sentence, sentenceIndex) => {
        const row = document.createElement('div');
        row.className = 'text-drag-sentence';
        const parts = String(sentence.text || '').split('___');
        row.appendChild(document.createTextNode(`${sentenceIndex + 1}. ${parts[0] || ''}`));
        const slot = document.createElement('button');
        slot.type = 'button';
        slot.className = `text-drag-slot${sentenceAnswers[String(sentenceIndex)] ? ' is-filled' : ''}`;
        slot.textContent = sentenceAnswers[String(sentenceIndex)] || '';
        slot.setAttribute('aria-label', 'Vị trí thả đáp án');
        slot.addEventListener('click', () => {
          delete sentenceAnswers[String(sentenceIndex)];
          render();
          updateNav();
        });
        slot.addEventListener('dragover', event => event.preventDefault());
        slot.addEventListener('drop', event => {
          event.preventDefault();
          const answer = event.dataTransfer.getData('text/plain');
          if (!answer) return;
          Object.keys(sentenceAnswers).forEach(key => {
            if (sentenceAnswers[key] === answer) delete sentenceAnswers[key];
          });
          sentenceAnswers[String(sentenceIndex)] = answer;
          render();
          updateNav();
        });
        row.appendChild(slot);
        const feedback = document.createElement('span');
        feedback.className = 'text-drag-feedback';
        feedback.hidden = true;
        row.appendChild(feedback);
        row.appendChild(document.createTextNode(parts[1] || ''));
        sentenceList.appendChild(row);
      });
    };
    const createTextChip = answer => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'text-drag-chip';
      chip.textContent = answer;
      chip.draggable = true;
      chip.addEventListener('click', () => {
        if (!window.matchMedia('(max-width: 640px)').matches) return;
        openTouchChoice('Chọn vị trí đặt đáp án', sentences.map((sentence, sentenceIndex) => ({
          label: `${sentenceIndex + 1}. ${sentence.text}`,
          value: sentenceIndex,
        })), sentenceIndex => {
          Object.keys(sentenceAnswers).forEach(key => {
            if (sentenceAnswers[key] === answer) delete sentenceAnswers[key];
          });
          sentenceAnswers[String(sentenceIndex)] = answer;
          render();
          updateNav();
        });
      });
      chip.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', answer));
      return chip;
    };
    pool.addEventListener('dragover', event => event.preventDefault());
    container.append(pool, sentenceList);
    render();
  }

  function renderDrag(q, idx, container) {
    container.classList.add('grouping-list');
    const groups = q.drag_groups || [];
    const answers_list = q.drag_answers || groups.flatMap(group => group.answers || []);
    if (!answers_list.length || !groups.length) {
      container.innerHTML = '<p style="color:#888;">Chưa có đáp án kéo thả.</p>';
      return;
    }
    const grouped = answers[idx] && typeof answers[idx] === 'object' ? answers[idx] : {};
    answers[idx] = grouped;
    const placed = new Set(Object.values(grouped).flat());
    const pool = document.createElement('div');
    pool.className = 'grouping-pool';
    const groupsWrap = document.createElement('div');
    groupsWrap.className = 'grouping-groups';
    const render = () => {
      pool.innerHTML = '<span class="grouping-pool-title">Đáp án</span>';
      answers_list.filter(answer => !placed.has(answer)).forEach(answer => pool.appendChild(createGroupChip(answer)));
      groupsWrap.innerHTML = '';
      groups.forEach((group, groupIndex) => {
        const zone = document.createElement('div');
        zone.className = 'grouping-zone';
        zone.innerHTML = `<h3>${esc(group.label || `Nhóm ${groupIndex + 1}`)}</h3>`;
        (grouped[String(groupIndex)] || []).forEach(answer => zone.appendChild(createGroupChip(answer, groupIndex)));
        zone.addEventListener('dragover', event => event.preventDefault());
        zone.addEventListener('drop', event => {
          event.preventDefault();
          const answer = event.dataTransfer.getData('text/plain');
          if (!answer) return;
          Object.values(grouped).forEach(items => { const at = items.indexOf(answer); if (at >= 0) items.splice(at, 1); });
          grouped[String(groupIndex)] = grouped[String(groupIndex)] || [];
          grouped[String(groupIndex)].push(answer);
          placed.add(answer);
          render();
          updateNav();
        });
        groupsWrap.appendChild(zone);
      });
    };
    const createGroupChip = (answer, groupIndex) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'grouping-chip';
      chip.textContent = answer;
      chip.draggable = true;
      if (groupIndex === undefined) {
        chip.addEventListener('click', () => {
          if (!window.matchMedia('(max-width: 640px)').matches) return;
          openTouchChoice('Chọn nhóm cho đáp án', groups.map((group, index) => ({
            label: group.label || `Nhóm ${index + 1}`,
            value: index,
          })), selectedGroupIndex => {
            Object.values(grouped).forEach(items => {
              const answerIndex = items.indexOf(answer);
              if (answerIndex >= 0) items.splice(answerIndex, 1);
            });
            grouped[String(selectedGroupIndex)] = grouped[String(selectedGroupIndex)] || [];
            grouped[String(selectedGroupIndex)].push(answer);
            placed.add(answer);
            render();
            updateNav();
          });
        });
      }
      chip.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', answer));
      chip.addEventListener('click', () => {
        if (groupIndex === undefined) return;
        grouped[String(groupIndex)] = (grouped[String(groupIndex)] || []).filter(item => item !== answer);
        placed.delete(answer);
        render();
        updateNav();
      });
      return chip;
    };
    pool.addEventListener('dragover', event => event.preventDefault());
    pool.addEventListener('drop', event => {
      event.preventDefault();
      const answer = event.dataTransfer.getData('text/plain');
      Object.values(grouped).forEach(items => { const at = items.indexOf(answer); if (at >= 0) items.splice(at, 1); });
      placed.delete(answer);
      render();
      updateNav();
    });
    container.append(pool, groupsWrap);
    render();
  }

  // Update nav buttons & dots
  function updateNav() {
    const total = questions.length;
    const totalNum = $('total-num');
    if (totalNum) totalNum.textContent = total;
    $('btn-prev').disabled = false;
    $('btn-next').disabled = currentIdx === total - 1;

    const dots = $('nav-dots');
    dots.innerHTML = '';
    let currentDot = null;
    const firstVisible = total > 3
      ? Math.min(Math.max(currentIdx - 1, 0), total - 3)
      : 0;
    const lastVisible = Math.min(firstVisible + 3, total);
    for (let i = firstVisible; i < lastVisible; i++) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'nav-dot';
      dot.dataset.question = i + 1;
      dot.setAttribute('aria-label', `Đi tới câu ${i + 1}`);
      if (i === currentIdx) dot.classList.add('current');
      if (!isAnswerEmpty(questions[i], answers[i])) dot.classList.add('answered');
      dot.addEventListener('click', () => goTo(i));
      dots.appendChild(dot);
      if (i === currentIdx) currentDot = dot;
    }
    currentDot?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    showImmediateQuestionFeedback(questions[currentIdx], currentIdx);

    const drawerList = $('question-drawer-list');
    if (drawerList) {
      drawerList.innerHTML = '';
      for (let i = 0; i < total; i++) {
        const drawerQuestion = document.createElement('button');
        drawerQuestion.type = 'button';
        drawerQuestion.className = 'drawer-question';
        drawerQuestion.textContent = `Câu ${i + 1}`;
        if (i === currentIdx) drawerQuestion.classList.add('is-current');
        if (!isAnswerEmpty(questions[i], answers[i])) drawerQuestion.classList.add('is-answered');
        drawerQuestion.addEventListener('click', () => {
          goTo(i);
          closeQuestionDrawer();
        });
        drawerList.appendChild(drawerQuestion);
      }
    }
  }

  function showImmediateQuestionFeedback(question, idx) {
    if (!showAnswersImmediately || submitted || !question) return;
    const answer = answers[idx];
    if (!isFeedbackReady(question, answer)) return;
    const container = $('answer-list');
    if (!container) return;
    if (question.type === 'drag_into_text') {
      container.querySelector('.question-feedback')?.remove();
      markDragTextFeedback(question, answer, container);
      return;
    }
    let feedback = container.querySelector('.question-feedback');
    if (!feedback) {
      feedback = document.createElement('div');
      feedback.className = 'question-feedback';
      container.appendChild(feedback);
    }
    const correct = calculateResultCorrect(question, { user_answer: answer });
    feedback.className = `question-feedback ${correct ? 'is-correct' : 'is-wrong'}`;
    feedback.textContent = correct
      ? 'Đúng'
      : `Sai · Đáp án đúng: ${formatImmediateCorrectAnswer(question)}`;
    if (question.type === 'single_choice' || question.type === 'multiple_response') {
      showImmediateFeedback(question, idx, container);
    } else if (question.type === 'true_false') {
      markTrueFalseFeedback(question, answer, container);
      lockQuestionInput(container);
    } else {
      lockQuestionInput(container);
    }
  }

  function markDragTextFeedback(question, answer, container) {
    const rows = container.querySelectorAll('.text-drag-sentence');
    rows.forEach((row, index) => {
      const expectedText = String(question.drag_sentences?.[index]?.answer || '').trim();
      const actualText = String(answer[String(index)] || '').trim();
      const expected = expectedText.toLowerCase();
      const actual = actualText.toLowerCase();
      const slot = row.querySelector('.text-drag-slot');
      const feedback = row.querySelector('.text-drag-feedback');
      const isCorrect = actual === expected;
      slot?.classList.toggle('is-correct', isCorrect);
      slot?.classList.toggle('is-wrong', !isCorrect);
      if (feedback) {
        feedback.hidden = false;
        feedback.className = `text-drag-feedback ${isCorrect ? 'is-correct' : 'is-wrong'}`;
        feedback.textContent = isCorrect ? 'Đúng' : `Đáp án đúng: ${expectedText || 'Chưa có'}`;
      }
    });
    lockQuestionInput(container);
  }

  function lockQuestionInput(container) {
    container.classList.add('is-locked');
    container.querySelectorAll('button, input, textarea').forEach(control => {
      control.disabled = true;
    });
    container.querySelectorAll('[draggable="true"]').forEach(control => {
      control.draggable = false;
    });
  }

  function markTrueFalseFeedback(question, answer, container) {
    const values = answer && typeof answer === 'object' ? answer : { 0: answer };
    const statements = question.statements?.length ? question.statements : [{ answer: getTrueFalseAnswer(question) }];
    statements.forEach((statement, index) => {
      const expected = String(statement.answer || '').toLowerCase();
      const buttonGroup = question.statements?.length
        ? container.querySelectorAll('.tf-statement')[index]?.querySelectorAll('.tf-btn')
        : container.querySelectorAll('.tf-buttons')[index]?.querySelectorAll('.tf-btn');
      buttonGroup?.forEach((button, buttonIndex) => {
        const value = buttonIndex === 0 ? 'true' : 'false';
        button.classList.toggle('correct', value === expected);
        button.classList.toggle('wrong', value !== expected && value === String(values[String(index)] || '').toLowerCase());
      });
    });
  }

  function formatImmediateCorrectAnswer(question) {
    if (question.type === 'single_choice' || question.type === 'multiple_response') {
      return getCorrectOptions(question).map(option => `${option.label}. ${option.text}`).join('; ');
    }
    if (question.type === 'true_false') {
      if (question.statements?.length) return question.statements.map(statement => statement.answer === 'true' ? 'Đúng' : 'Sai').join(', ');
      return getTrueFalseAnswer(question) === 'true' ? 'Đúng' : 'Sai';
    }
    if (question.type === 'ordering') {
      const statements = question.statements?.length ? question.statements : [{ ordering_sequence: question.ordering_sequence || [] }];
      return statements.map(statement => (statement.ordering_sequence || []).join(' → ')).join('; ');
    }
    if (question.type === 'fill_in_blank') return question.fill_blank_answer || 'Chưa có đáp án';
    if (question.type === 'drag_into_text') return (question.drag_sentences || []).map(sentence => sentence.answer || '').join('; ');
    return 'Xem đáp án sau khi hoàn thành';
  }

  function goTo(idx) {
    if (idx < 0 || idx >= questions.length) return;
    currentIdx = idx;
    renderQuestion(questions[idx], idx);
  }

  // Event listeners
  $('btn-prev').addEventListener('click', () => {
    toggleQuestionDrawer();
  });
  $('btn-next').addEventListener('click', () => goTo(currentIdx + 1));
  $('btn-submit').addEventListener('click', () => {
    if (submitted) {
      window.location.href = `/e/${quizCode}/`;
      return;
    }
    const unanswered = questions
      .map((question, index) => isAnswerEmpty(question, answers[index]) ? index + 1 : null)
      .filter(Boolean);
    if (unanswered.length) {
      const questionList = unanswered.map(index => `Câu ${index}`).join(', ');
      if (typeof window.showToast === 'function') {
        window.showToast({
          type: 'error',
          title: 'Chưa hoàn thành bài',
          message: `Bạn chưa làm đầy đủ. Vui lòng kiểm tra lại: ${questionList}.`,
          duration: 5500,
        });
      } else {
        alert(`Bạn chưa làm đầy đủ. Vui lòng kiểm tra lại: ${questionList}.`);
      }
      updateNav();
      return;
    }
    submitExam();
  });
  $('modal-cancel').addEventListener('click', () => $('modal-submit').hidden = true);
  $('modal-submit').addEventListener('click', e => {
    if (e.target === $('modal-submit')) $('modal-submit').hidden = true;
  });
  $('modal-confirm').addEventListener('click', submitExam);

  function isAnswerEmpty(question, answer) {
    if (answer === undefined || answer === null) return true;
    if (typeof answer === 'string') return !answer.trim();
    if (Array.isArray(answer)) return answer.length === 0;
    if (typeof answer === 'object') {
      const expectedCount = question.type === 'true_false'
        ? (question.statements?.length || 1)
        : question.type === 'ordering'
          ? (question.statements?.length || 1)
          : question.type === 'drag_into_text'
            ? (question.drag_sentences?.length || 1)
            : question.type === 'drag_into_groups'
              ? (question.drag_groups?.length || 1)
              : 1;
      return Object.values(answer).filter(value => {
        if (Array.isArray(value)) return value.length > 0;
        return value !== undefined && value !== null && String(value).trim() !== '';
      }).length < expectedCount;
    }
    return false;
  }

  function isFeedbackReady(question, answer) {
    if (isAnswerEmpty(question, answer)) return false;
    if (question.type === 'multiple_response') {
      const selected = Array.isArray(answer) ? answer : [];
      const expectedCount = getCorrectOptions(question).length;
      return expectedCount > 0 && selected.length >= expectedCount;
    }
    return true;
  }

  function getCorrectOptions(question) {
    const correctOptions = Array.isArray(question.correct_options) ? question.correct_options : [];
    if (correctOptions.length) return correctOptions;
    return (question.options || []).filter(option => option.correct);
  }

  $('question-drawer-close').addEventListener('click', closeQuestionDrawer);
  $('question-drawer-backdrop').addEventListener('click', closeQuestionDrawer);
  $('touch-choice-cancel')?.addEventListener('click', closeTouchChoice);
  $('touch-choice-overlay')?.addEventListener('click', event => {
    if (event.target.id === 'touch-choice-overlay') closeTouchChoice();
  });

  function toggleQuestionDrawer() {
    const drawer = $('question-drawer');
    const backdrop = $('question-drawer-backdrop');
    const isOpen = drawer.classList.toggle('is-open');
    backdrop.classList.toggle('is-open', isOpen);
    drawer.setAttribute('aria-hidden', String(!isOpen));
  }

  function closeQuestionDrawer() {
    const drawer = $('question-drawer');
    const backdrop = $('question-drawer-backdrop');
    drawer.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
  }

  // Keyboard nav
  document.addEventListener('keydown', e => {
    if (submitted || $('modal-submit').hidden === false) return;
    if (e.key === 'Escape') {
      closeQuestionDrawer();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goTo(currentIdx + 1);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') goTo(currentIdx - 1);
  });

  // Submit
  async function submitExam(forceSubmit = false) {
    if (submitting || submitted) return;
    submitting = true;
    $('modal-submit').hidden = true;
    $('btn-submit').disabled = true;
    if (forceSubmit) $('exam-timer').textContent = '00:00';

    try {
      const res = await fetch(`/api/submit-exam/${quizCode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCSRF() },
        body: JSON.stringify({ answers, question_order: questionOrder }),
      });
      const data = await res.json();

      if (data.success) {
        submitted = true;
        window.location.href = data.result_url;
      } else {
        alert(data.message || 'Lỗi khi nộp bài.');
        submitting = false;
        $('btn-submit').disabled = false;
      }
    } catch {
      alert('Lỗi kết nối. Vui lòng thử lại.');
      submitting = false;
      $('btn-submit').disabled = false;
    }
  }

  // Replace the exam view with a full answer review after submission.
  function showResults(data) {
    const total = questions.length;
    const results = questions.map((question, index) => {
      const savedResult = data.results.find(item => item.index === index) || {};
      const correct = typeof savedResult.correct === 'boolean'
        ? savedResult.correct
        : calculateResultCorrect(question, savedResult);
      return { ...savedResult, correct };
    });
    const correct = results.filter(result => result.correct).length;
    const card = $('question-card');
    card.classList.add('is-result');
    card.innerHTML = '';

    const summary = document.createElement('div');
    summary.className = 'result-summary';
    summary.innerHTML = `<span class="result-summary-title">Kết quả bài làm</span><span class="result-summary-score">${correct}/${total} câu đúng</span>`;
    card.appendChild(summary);

    questions.forEach((question, index) => {
      const result = results.find(item => item.index === index) || {};
      const review = document.createElement('section');
      review.className = 'result-question';

      const title = document.createElement('div');
      title.className = 'result-question-title';
      title.textContent = `Câu ${index + 1} ${result.correct ? '· Đúng' : '· Sai'}`;
      title.style.color = result.correct ? 'var(--ex-success)' : 'var(--ex-error)';
      review.appendChild(title);

      const text = document.createElement('p');
      text.className = 'result-question-text';
      text.textContent = question.text || 'Câu hỏi';
      review.appendChild(text);

      if (question.type === 'single_choice' || question.type === 'multiple_response') {
        renderChoiceReview(question, result, review);
      } else if (question.type === 'true_false') {
        renderTrueFalseReview(question, result, review);
      } else if (question.type === 'ordering') {
        renderOrderingReview(question, result, review);
      } else if (question.type === 'drag_into_text') {
        renderDragTextReview(question, result, review);
      } else if (question.type === 'drag_into_groups') {
        renderDragGroupsReview(question, result, review);
      } else if (question.type === 'fill_in_blank') {
        renderFillReview(question, result, review);
      } else {
        const answer = document.createElement('div');
        answer.className = `result-free-answer ${result.correct ? 'is-correct' : 'is-wrong'}`;
        answer.innerHTML = `<strong>Đáp án bạn chọn:</strong><span>${esc(formatAnswer(result.user_answer))}</span><strong>Đáp án đúng:</strong><span>${esc(formatAnswer(result.correct_answer))}</span>`;
        review.appendChild(answer);
      }
      card.appendChild(review);
    });

    $('exam-timer').textContent = `${correct}/${total} câu đúng`;
    $('btn-submit').textContent = 'Làm lại';
    $('btn-submit').disabled = false;
    $('exam-container')?.classList.add('is-result');
  }

  function calculateResultCorrect(question, result) {
    const answer = result.user_answer;
    const type = question.type;
    if (type === 'single_choice' || type === 'multiple_response') {
      const selected = Array.isArray(answer) ? answer : answer ? [answer] : [];
      const expected = getCorrectOptions(question).map(option => String(option.label).toUpperCase());
      const actual = selected.map(item => String(item).toUpperCase());
      return type === 'multiple_response'
        ? actual.length === expected.length && actual.every(item => expected.includes(item))
        : actual.length === 1 && expected.includes(actual[0]);
    }
    if (type === 'true_false') {
      if (!(question.statements || []).length) {
        return String(answer || '').toLowerCase() === getTrueFalseAnswer(question);
      }
      const selected = answer && typeof answer === 'object' ? answer : {};
      const statements = question.statements || [];
      return Boolean(statements.length) && statements.every((statement, index) =>
        String(selected[String(index)] || '').toLowerCase() === String(statement.answer || '').toLowerCase());
    }
    if (type === 'ordering') {
      const selected = answer && typeof answer === 'object' ? answer : {};
      const statements = question.statements?.length ? question.statements : [{ ordering_sequence: question.ordering_sequence || [] }];
      return statements.every((statement, index) =>
        String(selected[String(index)] || '').toUpperCase() === (statement.ordering_sequence || []).join('|').toUpperCase());
    }
    if (type === 'fill_in_blank') {
      return String(answer || '').trim().toLowerCase() === String(question.fill_blank_answer || '').trim().toLowerCase();
    }
    if (type === 'drag_into_groups') {
      const selected = answer && typeof answer === 'object' ? answer : {};
      return (question.drag_groups || []).every((group, index) =>
        JSON.stringify([...(selected[String(index)] || [])].sort()) === JSON.stringify([...(group.answers || [])].sort()));
    }
    if (type === 'drag_into_text') {
      const selected = answer && typeof answer === 'object' ? answer : {};
      return (question.drag_sentences || []).every((sentence, index) =>
        String(selected[String(index)] || '').trim().toLowerCase() === String(sentence.answer || '').trim().toLowerCase());
    }
    return Boolean(result.correct);
  }

  function getTrueFalseAnswer(question) {
    const answer = String(question.answer || '').toLowerCase();
    if (answer === 'true' || answer === 'false') return answer;
    const correct = (question.correct_options || [])[0];
    if (!correct) return '';
    const text = String(correct.text || '').toLowerCase();
    if (text.includes('đúng') || text.includes('dung') || text.includes('true')) return 'true';
    if (text.includes('sai') || text.includes('false')) return 'false';
    return '';
  }

  function renderChoiceReview(question, result, review) {
    const list = document.createElement('div');
    list.className = 'result-answer-list';
    const selected = Array.isArray(result.user_answer)
      ? result.user_answer
      : result.user_answer ? [result.user_answer] : [];
    const correct = (question.correct_options || []).map(option => String(option.label));

    (question.options || []).forEach(option => {
      const label = String(option.label);
      const displayLabel = String(option.display_label || label);
      const isCorrect = correct.some(item => item.toUpperCase() === label.toUpperCase());
      const isSelected = selected.some(item => String(item).toUpperCase() === label.toUpperCase());
      const item = document.createElement('div');
      item.className = 'result-answer-item';
      if (isCorrect) item.classList.add('correct');
      else if (isSelected) item.classList.add('wrong');
      item.innerHTML = `<span class="answer-label">${esc(displayLabel)}</span><span class="answer-text">${esc(option.text)}</span>`;
      if (isCorrect || isSelected) {
        const state = document.createElement('span');
        state.className = 'result-answer-state';
        state.textContent = isCorrect ? 'Đúng' : 'Bạn chọn';
        item.appendChild(state);
      }
      list.appendChild(item);
    });
    review.appendChild(list);
  }

  function createReviewAnswer(text, isCorrect, label) {
    const item = document.createElement('div');
    item.className = `result-free-answer ${isCorrect ? 'is-correct' : 'is-wrong'}`;
    const title = document.createElement('strong');
    title.textContent = label;
    const value = document.createElement('span');
    value.textContent = text || 'Chưa trả lời';
    item.append(title, value);
    return item;
  }

  function renderTrueFalseReview(question, result, review) {
    if (!(question.statements || []).length) {
      const expected = getTrueFalseAnswer(question);
      const actual = String(result.user_answer || '').toLowerCase();
      const list = document.createElement('div');
      list.className = 'result-review-grid';
      const row = document.createElement('div');
      row.className = 'result-review-row';
      const label = document.createElement('span');
      label.className = 'result-review-label';
      label.textContent = question.text || 'Câu đúng sai';
      const values = document.createElement('div');
      values.className = 'result-review-values';
      values.append(
        createReviewAnswer(actual === 'true' ? 'Đúng' : actual === 'false' ? 'Sai' : 'Chưa trả lời', actual === expected, 'Bạn chọn'),
        createReviewAnswer(expected === 'true' ? 'Đúng' : 'Sai', true, 'Đáp án đúng'),
      );
      row.append(label, values);
      list.appendChild(row);
      review.appendChild(list);
      return;
    }
    const userAnswers = result.user_answer && typeof result.user_answer === 'object' ? result.user_answer : {};
    const list = document.createElement('div');
    list.className = 'result-review-grid';
    (question.statements || []).forEach((statement, index) => {
      const expected = String(statement.answer || '').toLowerCase();
      const actual = String(userAnswers[String(index)] || '').toLowerCase();
      const row = document.createElement('div');
      row.className = 'result-review-row';
      row.innerHTML = `<span class="result-review-label">${index + 1}. ${esc(statement.text || '')}</span>`;
      const values = document.createElement('div');
      values.className = 'result-review-values';
      values.append(
        createReviewAnswer(actual === 'true' ? 'Đúng' : actual === 'false' ? 'Sai' : 'Chưa trả lời', actual === expected, 'Bạn chọn'),
        createReviewAnswer(expected === 'true' ? 'Đúng' : 'Sai', true, 'Đáp án đúng'),
      );
      row.appendChild(values);
      list.appendChild(row);
    });
    review.appendChild(list);
  }

  function renderOrderingReview(question, result, review) {
    const userAnswers = result.user_answer && typeof result.user_answer === 'object' ? result.user_answer : {};
    const statements = question.statements?.length ? question.statements : [{ ordering_sequence: question.ordering_sequence || [] }];
    const list = document.createElement('div');
    list.className = 'result-review-grid';
    statements.forEach((statement, index) => {
      const expected = (statement.ordering_sequence || []).join(' → ');
      const actual = String(userAnswers[String(index)] || '').split('|').filter(Boolean).join(' → ');
      const row = document.createElement('div');
      row.className = 'result-review-row';
      row.innerHTML = `<span class="result-review-label">${statements.length > 1 ? `${index + 1}. ` : ''}Thứ tự đáp án</span>`;
      const values = document.createElement('div');
      values.className = 'result-review-values';
      values.append(
        createReviewAnswer(actual || 'Chưa trả lời', actual === expected, 'Bạn sắp xếp'),
        createReviewAnswer(expected || 'Chưa có đáp án', true, 'Thứ tự đúng'),
      );
      row.appendChild(values);
      list.appendChild(row);
    });
    review.appendChild(list);
  }

  function renderDragTextReview(question, result, review) {
    const userAnswers = result.user_answer && typeof result.user_answer === 'object' ? result.user_answer : {};
    const list = document.createElement('div');
    list.className = 'result-review-grid';
    (question.drag_sentences || []).forEach((sentence, index) => {
      const expected = String(sentence.answer || '');
      const actual = String(userAnswers[String(index)] || '');
      const row = document.createElement('div');
      row.className = 'result-review-row';
      row.innerHTML = `<span class="result-review-label">${index + 1}. ${esc(sentence.text || '')}</span>`;
      const values = document.createElement('div');
      values.className = 'result-review-values';
      values.append(
        createReviewAnswer(actual || 'Chưa trả lời', actual.toLowerCase() === expected.toLowerCase(), 'Bạn kéo vào'),
        createReviewAnswer(expected || 'Chưa có đáp án', true, 'Đáp án đúng'),
      );
      row.appendChild(values);
      list.appendChild(row);
    });
    review.appendChild(list);
  }

  function renderDragGroupsReview(question, result, review) {
    const userGroups = result.user_answer && typeof result.user_answer === 'object' ? result.user_answer : {};
    const list = document.createElement('div');
    list.className = 'result-review-groups';
    (question.drag_groups || []).forEach((group, index) => {
      const userItems = userGroups[String(index)] || [];
      const expectedItems = group.answers || [];
      const isCorrect = [...userItems].sort().join('|') === [...expectedItems].sort().join('|');
      const row = document.createElement('div');
      row.className = `result-group-review ${isCorrect ? 'is-correct' : 'is-wrong'}`;
      const title = document.createElement('strong');
      title.textContent = group.label || `Nhóm ${index + 1}`;
      row.appendChild(title);
      row.appendChild(createGroupAnswerLine('Bạn chọn', userItems, false));
      row.appendChild(createGroupAnswerLine('Đáp án đúng', expectedItems, true));
      list.appendChild(row);
    });
    review.appendChild(list);
  }

  function renderFillReview(question, result, review) {
    const list = document.createElement('div');
    list.className = 'result-review-grid';
    const row = document.createElement('div');
    row.className = 'result-review-row';
    const label = document.createElement('span');
    label.className = 'result-review-label';
    label.textContent = question.text || 'Điền đáp án vào chỗ trống';
    const values = document.createElement('div');
    values.className = 'result-review-values';
    values.append(
      createReviewAnswer(formatAnswer(result.user_answer), result.correct, 'Bạn điền'),
      createReviewAnswer(question.fill_blank_answer || result.correct_answer, true, 'Đáp án đúng'),
    );
    row.append(label, values);
    list.appendChild(row);
    review.appendChild(list);
  }

  function createGroupAnswerLine(label, answersList, isCorrect) {
    const line = document.createElement('div');
    line.className = `result-group-line ${isCorrect ? 'is-correct' : ''}`;
    const heading = document.createElement('span');
    heading.className = 'result-group-line-label';
    heading.textContent = `${label}:`;
    const chips = document.createElement('div');
    chips.className = 'result-group-chips';
    if (answersList.length) {
      answersList.forEach(answer => {
        const chip = document.createElement('span');
        chip.className = 'result-group-chip';
        chip.textContent = answer;
        chips.appendChild(chip);
      });
    } else {
      const empty = document.createElement('span');
      empty.className = 'result-group-empty';
      empty.textContent = isCorrect ? 'Chưa có đáp án' : 'Chưa trả lời';
      chips.appendChild(empty);
    }
    line.append(heading, chips);
    return line;
  }

  function formatAnswer(answer) {
    if (answer === undefined || answer === null || answer === '') return 'Chưa trả lời';
    if (Array.isArray(answer)) return answer.join(', ');
    if (typeof answer === 'object') return Object.values(answer).join(', ');
    return String(answer);
  }

  function getCSRF() {
    return document.querySelector('[name=csrfmiddlewaretoken]')?.value
      || document.cookie.match(/csrftoken=([^;]+)/)?.[1] || '';
  }

  // Init
  if (window.__RESULT_DATA__) {
    submitted = true;
    showResults(window.__RESULT_DATA__);
  } else {
    renderQuestion(questions[0], 0);
  }
});
