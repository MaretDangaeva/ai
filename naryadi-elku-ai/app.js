(() => {
  'use strict';

  const treePoints = [
    [240, 169], [208, 239], [270, 241], [168, 303],
    [239, 301], [310, 303], [144, 376], [207, 382],
    [274, 376], [335, 376], [179, 428], [295, 427]
  ];
  const autoOrder = [0, 5, 10, 2, 8, 9, 1, 6, 11, 4, 3, 7];
  const svgNS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  const screens = ['introScreen', 'quizScreen', 'finishScreen'];
  const state = {
    grade: 'junior', length: 6, questions: [], index: 0,
    ornaments: [], ornament: 'red', phase: 'intro', sound: false
  };
  let audioContext = null;

  function showScreen(screen) {
    screens.forEach((name) => { $(name).hidden = name !== screen; });
  }

  function el(tag, attributes = {}) {
    const element = document.createElementNS(svgNS, tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  function add(parent, tag, props) {
    const child = el(tag, props);
    parent.appendChild(child);
    return child;
  }

  function drawOrnament(type, x, y) {
    const g = el('g', { transform: `translate(${x} ${y})`, class: 'tree-ornament' });
    const inner = add(g, 'g', { class: 'ornament-animated' });
    if (type === 'red' || type === 'purple') {
      add(inner, 'path', { d: 'M0 -18 V-13', stroke: '#f7dbab', 'stroke-width': 2.2, 'stroke-linecap': 'round' });
      add(inner, 'rect', { x: -5, y: -17, width: 10, height: 5, rx: 1.4, fill: '#ead095' });
      add(inner, 'circle', { cx: 0, cy: 0, r: 15, fill: type === 'red' ? 'url(#redBall)' : 'url(#purpleBall)', stroke: '#ffebce', 'stroke-width': 1.2 });
      add(inner, 'ellipse', { cx: -5, cy: -6, rx: 3.8, ry: 5.7, fill: '#fff', opacity: '.5', transform: 'rotate(-30 -5 -6)' });
    } else if (type === 'gold') {
      add(inner, 'path', { d: 'M0 -18 5.5 -6.5 18 -5 8.4 3.4 11.3 16 0 9.5 -11.3 16 -8.4 3.4 -18 -5 -5.5 -6.5Z', fill: '#ffd36f', stroke: '#fff3b7', 'stroke-width': 2, 'stroke-linejoin': 'round' });
      add(inner, 'circle', { cx: -3, cy: -3, r: 2.5, fill: '#fff7cf', opacity: '.8' });
    } else if (type === 'snow') {
      add(inner, 'circle', { r: 17, fill: '#70cce9', opacity: '.24' });
      for (let a = 0; a < 3; a++) {
        const line = add(inner, 'g', { transform: `rotate(${a * 60})` });
        add(line, 'path', { d: 'M-15 0H15 M-12 -4L-8 0 -12 4 M12 -4L8 0 12 4', fill: 'none', stroke: '#e4fcff', 'stroke-width': 2.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      }
      add(inner, 'circle', { r: 3.3, fill: '#b2f2fb' });
    }
    return g;
  }

  function renderTree() {
    const slots = $('treeSlots');
    const ornaments = $('treeOrnaments');
    slots.replaceChildren();
    ornaments.replaceChildren();
    treePoints.forEach(([x, y], index) => {
      const filled = state.ornaments.find((item) => item.slot === index);
      if (filled) {
        ornaments.appendChild(drawOrnament(filled.type, x, y));
        return;
      }
      const enabled = state.phase === 'decorate';
      const group = add(slots, 'g', {
        class: enabled ? 'slot available' : 'slot',
        'data-slot': index,
        role: 'button',
        tabindex: enabled ? 0 : -1,
        'aria-label': `Повесить игрушку на место ${index + 1}`,
        'aria-disabled': enabled ? 'false' : 'true'
      });
      add(group, 'circle', { class: 'slot-outline', r: 13, cx: x, cy: y });
      add(group, 'path', { class: 'slot-plus', d: `M${x - 4} ${y}h8 M${x} ${y - 4}v8` });
      group.addEventListener('click', () => placeOrnament(index));
      group.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          placeOrnament(index);
        }
      });
    });
    $('treeScore').textContent = `${state.ornaments.length} из ${state.length} игрушек`;
    $('treeSvg').setAttribute('aria-label', `Ёлка: ${state.ornaments.length} украшений из ${state.length}. ${state.phase === 'decorate' ? 'Нажми на свободное место для игрушки.' : ''}`);
    document.querySelector('.tree-card').classList.toggle('completed', state.phase === 'finish');
  }

  function updateProgress() {
    const count = state.ornaments.length;
    $('progressFill').style.width = `${count / state.length * 100}%`;
    $('progressTrack').setAttribute('aria-valuenow', String(Math.round(count / state.length * 100)));
    $('progressCaption').textContent = `${count} ${plural(count, 'игрушка', 'игрушки', 'игрушек')} готово`;
  }

  function plural(number, one, few, many) {
    const n = Math.abs(number) % 100;
    const last = n % 10;
    if (n > 10 && n < 20) return many;
    if (last === 1) return one;
    if (last > 1 && last < 5) return few;
    return many;
  }

  function shuffleCopy(array) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function setPhase(phase) {
    state.phase = phase;
    document.querySelector('.page').dataset.phase = phase;
  }

  function resetToIntro() {
    if (state.phase !== 'intro' && state.phase !== 'finish' && state.ornaments.length > 0) {
      if (!window.confirm('Начать новую игру? Все украшения на ёлке исчезнут.')) return;
    }
    state.index = 0;
    state.ornaments = [];
    setPhase('intro');
    showScreen('introScreen');
    $('treeHelp').innerHTML = '<span class="help-symbol" aria-hidden="true">✦</span><span>За каждый правильный ответ — игрушка на ёлку!</span>';
    $('confetti').replaceChildren();
    renderTree();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startGame() {
    const pool = window.AI_TREE_QUESTIONS && window.AI_TREE_QUESTIONS[state.grade];
    if (!Array.isArray(pool) || pool.length < state.length) {
      alert('Не хватает вопросов для выбранного режима. Проверьте файл questions.js.');
      return;
    }
    state.questions = shuffleCopy(pool).slice(0, state.length);
    state.index = 0;
    state.ornaments = [];
    setOrnament('red');
    setPhase('answer');
    $('confetti').replaceChildren();
    showScreen('quizScreen');
    renderQuestion();
    renderTree();
    updateProgress();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderQuestion() {
    const q = state.questions[state.index];
    setPhase('answer');
    $('roundPill').textContent = `ВОПРОС ${state.index + 1} / ${state.length}`;
    $('topicTag').textContent = q.topic;
    $('questionTitle').textContent = q.question;
    $('questionSubtitle').textContent = 'Выбери один правильный ответ.';
    $('feedback').hidden = true;
    $('feedback').className = 'feedback';
    $('decoratePanel').hidden = true;
    $('nextPanel').hidden = true;
    $('treeHelp').innerHTML = '<span class="help-symbol" aria-hidden="true">✦</span><span>Ответь правильно, чтобы получить игрушку.</span>';
    const answers = $('answers');
    answers.replaceChildren();
    q.options.forEach((answer, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'answer-button';
      button.setAttribute('data-answer', String(i));
      const letter = document.createElement('span');
      letter.className = 'answer-letter';
      letter.textContent = String(i + 1).padStart(2, '0');
      letter.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      text.textContent = answer;
      button.append(letter, text);
      button.addEventListener('click', () => answerQuestion(i));
      answers.appendChild(button);
    });
    updateProgress();
    renderTree();
  }

  function answerQuestion(index) {
    if (state.phase !== 'answer') return;
    const q = state.questions[state.index];
    const buttons = [...document.querySelectorAll('.answer-button')];
    const chosen = buttons[index];
    if (!chosen || chosen.disabled) return;
    const feedback = $('feedback');
    feedback.hidden = false;
    if (index !== q.correct) {
      chosen.classList.add('wrong');
      chosen.disabled = true;
      feedback.classList.add('try-again');
      feedback.textContent = `Не совсем! ${q.hint} Попробуй ещё раз.`;
      playTone([220], .13);
      return;
    }
    setPhase('decorate');
    chosen.classList.add('correct');
    buttons.forEach((b) => { b.disabled = true; });
    feedback.classList.remove('try-again');
    feedback.textContent = `Верно! ${q.explanation}`;
    $('decoratePanel').hidden = false;
    $('treeHelp').innerHTML = '<span class="help-symbol" aria-hidden="true">✦</span><span>Нажми на светящийся кружок и повесь игрушку!</span>';
    renderTree();
    playTone([523, 659, 784], .11);
  }

  function setOrnament(type) {
    state.ornament = type;
    document.querySelectorAll('.ornament-choice').forEach((button) => {
      const active = button.dataset.ornament === type;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function placeOrnament(slot) {
    if (state.phase !== 'decorate' || state.ornaments.some((item) => item.slot === slot)) return;
    state.ornaments.push({ slot, type: state.ornament });
    // Следующее украшение по умолчанию другого цвета: удобно при работе с проектором.
    setOrnament(['red', 'gold', 'snow', 'purple'][state.ornaments.length % 4]);
    setPhase('placed');
    $('decoratePanel').hidden = true;
    $('nextPanel').hidden = false;
    $('nextButton').innerHTML = state.index === state.questions.length - 1
      ? 'Праздновать! <span aria-hidden="true">✦</span>'
      : 'Следующий вопрос <span aria-hidden="true">→</span>';
    $('treeHelp').innerHTML = '<span class="help-symbol" aria-hidden="true">✓</span><span>Какая красота! Игрушка уже на ёлке.</span>';
    updateProgress();
    renderTree();
    playTone([659, 880], .12);
    if (window.innerWidth <= 760) {
      $('nextPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function autoPlace() {
    const first = autoOrder.find((slot) => !state.ornaments.some((item) => item.slot === slot));
    if (first !== undefined) placeOrnament(first);
  }

  function nextQuestion() {
    if (state.phase !== 'placed') return;
    if (state.index + 1 === state.questions.length) {
      finishGame();
      return;
    }
    state.index += 1;
    renderQuestion();
    if (window.innerWidth <= 760) {
      $('quizScreen').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function finishGame() {
    setPhase('finish');
    showScreen('finishScreen');
    $('finalCount').textContent = `${state.length} ${plural(state.length, 'игрушка', 'игрушки', 'игрушек')}`;
    $('treeHelp').innerHTML = '<span class="help-symbol" aria-hidden="true">★</span><span>Поздравляем! Новогодняя ёлка знаний готова!</span>';
    renderTree();
    playTone([523, 659, 784, 1046], .16);
    makeConfetti();
    if (window.innerWidth <= 760) $('finishScreen').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function makeConfetti() {
    const container = $('confetti');
    container.replaceChildren();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#ffd277', '#fd7b8d', '#70ddba', '#90c5eb', '#c5a4f6', '#fff3d0'];
    for (let i = 0; i < 75; i++) {
      const particle = document.createElement('i');
      particle.style.left = `${Math.random() * 100}%`;
      particle.style.background = colors[i % colors.length];
      particle.style.setProperty('--drift', `${Math.random() * 220 - 110}px`);
      particle.style.setProperty('--rotation', `${Math.random() * 1300 - 650}deg`);
      particle.style.animationDelay = `${Math.random() * 1.1}s`;
      particle.style.animationDuration = `${3 + Math.random() * 1.9}s`;
      container.appendChild(particle);
    }
  }

  function playTone(frequencies, duration = .12) {
    if (!state.sound) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!audioContext) audioContext = new AudioContext();
      if (audioContext.state === 'suspended') audioContext.resume();
      const now = audioContext.currentTime;
      frequencies.forEach((hz, i) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = hz;
        const start = now + i * duration;
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(.09, start + .015);
        gain.gain.exponentialRampToValueAtTime(.0001, start + duration * .95);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + duration);
      });
    } catch (_error) { /* В браузерах без аудио игра работает без звуков */ }
  }

  function makeSnow() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const snow = document.querySelector('.snow');
    for (let i = 0; i < 30; i++) {
      const flake = document.createElement('i');
      flake.style.left = `${Math.random() * 100}%`;
      flake.style.animationDelay = `${Math.random() * -21}s`;
      flake.style.animationDuration = `${12 + Math.random() * 17}s`;
      const size = 2 + Math.random() * 3;
      flake.style.width = `${size}px`;
      flake.style.height = `${size}px`;
      snow.appendChild(flake);
    }
  }

  function setSelection(groupId, selector, value, stateKey) {
    state[stateKey] = value;
    document.querySelectorAll(`#${groupId} ${selector}`).forEach((button) => {
      const selected = button.dataset[stateKey === 'grade' ? 'grade' : 'length'] === String(value);
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    renderTree();
  }

  $('gradeChoice').addEventListener('click', (event) => {
    const button = event.target.closest('[data-grade]');
    if (button) setSelection('gradeChoice', '[data-grade]', button.dataset.grade, 'grade');
  });
  $('lengthChoice').addEventListener('click', (event) => {
    const button = event.target.closest('[data-length]');
    if (button) setSelection('lengthChoice', '[data-length]', Number(button.dataset.length), 'length');
  });
  $('ornamentPalette').addEventListener('click', (event) => {
    const button = event.target.closest('[data-ornament]');
    if (button) setOrnament(button.dataset.ornament);
  });
  $('startButton').addEventListener('click', startGame);
  $('homeButton').addEventListener('click', resetToIntro);
  $('autoPlaceButton').addEventListener('click', autoPlace);
  $('nextButton').addEventListener('click', nextQuestion);
  $('playAgainButton').addEventListener('click', startGame);
  $('changeModeButton').addEventListener('click', resetToIntro);
  $('soundButton').addEventListener('click', () => {
    state.sound = !state.sound;
    $('soundButton').setAttribute('aria-pressed', String(state.sound));
    $('soundButton').setAttribute('aria-label', state.sound ? 'Выключить звуки' : 'Включить звуки');
    $('soundButton').title = state.sound ? 'Выключить звуки' : 'Включить звуки';
    if (state.sound) playTone([700], .12);
  });
  document.addEventListener('keydown', (event) => {
    const active = document.activeElement;
    if (event.ctrlKey || event.metaKey || event.altKey || active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') return;
    if (state.phase === 'answer' && ['1', '2', '3'].includes(event.key)) {
      answerQuestion(Number(event.key) - 1);
    }
  });

  // Игра работает также с локального диска: сервер и сборка не требуются.
  renderTree();
  makeSnow();
})();
