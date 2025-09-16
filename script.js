(() => {
  const appElement = document.getElementById('app');
  const eventTitleInput = document.getElementById('eventTitleInput');
  const eventTitleDisplay = document.getElementById('eventTitleDisplay');
  const timeDisplay = document.getElementById('timeDisplay');
  const hintDisplay = document.getElementById('hintDisplay');
  const startPauseButton = document.getElementById('startPauseButton');
  const resetButton = document.getElementById('resetButton');
  const muteButton = document.getElementById('muteButton');
  const durationInput = document.getElementById('durationInput');
  const reminderInput = document.getElementById('reminderInput');
  const addReminderButton = document.getElementById('addReminderButton');
  const reminderList = document.getElementById('reminderList');
  const reminderMessage = document.getElementById('reminderMessage');
  const settingsForm = document.getElementById('settingsForm');
  const settingsMessage = document.getElementById('settingsMessage');

  const DEFAULT_REMINDER_MESSAGE = '可加入多個提醒點，以協助掌握節奏。';

  let totalDurationSeconds = 180;
  let remainingSeconds = totalDurationSeconds;
  let expectedEndTimestamp = null;
  let timerInterval = null;
  let isRunning = false;
  let isMuted = false;
  let audioContext = null;
  let reminderVisualTimeout = null;
  let reminderMessageTimeout = null;
  let settingsMessageTimeout = null;
  let reminderIdCounter = 0;

  /** @type {{id: number, seconds: number, triggered: boolean}[]} */
  let reminders = [];

  function formatTime(seconds) {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function formatReminderLabel(seconds) {
    const safeSeconds = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    if (minutes > 0 && secs > 0) {
      return `${minutes} 分 ${secs} 秒`;
    }
    if (minutes > 0) {
      return `${minutes} 分鐘`;
    }
    return `${secs} 秒`;
  }

  function updateDocumentTitle(seconds) {
    const title = eventTitleDisplay.textContent.trim() || '活動倒數計時器';
    document.title = `${formatTime(seconds)}｜${title}`;
  }

  function updateTimeDisplay(seconds) {
    timeDisplay.textContent = formatTime(seconds);
    updateDocumentTitle(seconds);
  }

  function updateTitleDisplay() {
    const value = eventTitleInput.value.trim();
    eventTitleDisplay.textContent = value || '活動流程';
    updateDocumentTitle(remainingSeconds);
  }

  function updateStartPauseButton() {
    startPauseButton.textContent = isRunning ? '暫停' : '開始';
    startPauseButton.setAttribute('aria-pressed', isRunning ? 'true' : 'false');
  }

  function updateStartButtonAvailability() {
    const disabled = totalDurationSeconds <= 0;
    startPauseButton.disabled = disabled;
    resetButton.disabled = disabled;
  }

  function clearHint() {
    hintDisplay.textContent = '';
  }

  function resetVisualState() {
    clearTimeout(reminderVisualTimeout);
    reminderVisualTimeout = null;
    timeDisplay.classList.remove('is-reminder', 'is-ended');
    appElement.classList.remove('state-reminder', 'state-ended');
    clearHint();
  }

  function clearEndedState() {
    timeDisplay.classList.remove('is-ended');
    appElement.classList.remove('state-ended');
    if (hintDisplay.textContent === '時間到') {
      clearHint();
    }
  }

  function enterReminderState(message) {
    clearTimeout(reminderVisualTimeout);
    timeDisplay.classList.remove('is-ended');
    appElement.classList.remove('state-ended');
    timeDisplay.classList.add('is-reminder');
    appElement.classList.add('state-reminder');
    hintDisplay.textContent = message;
    reminderVisualTimeout = window.setTimeout(() => {
      timeDisplay.classList.remove('is-reminder');
      appElement.classList.remove('state-reminder');
      if (hintDisplay.textContent === message) {
        clearHint();
      }
    }, 5000);
  }

  function enterEndedState() {
    clearTimeout(reminderVisualTimeout);
    reminderVisualTimeout = null;
    timeDisplay.classList.remove('is-reminder');
    appElement.classList.remove('state-reminder');
    timeDisplay.classList.add('is-ended');
    appElement.classList.add('state-ended');
    hintDisplay.textContent = '時間到';
  }

  function resetReminderTriggers() {
    reminders.forEach((reminder) => {
      reminder.triggered = false;
    });
  }

  function ensureAudioContext() {
    if (audioContext) {
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {});
      }
      return audioContext;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    audioContext = new AudioContextClass();
    return audioContext;
  }

  function playBeep(times = 1, { duration = 0.18, frequency = 880, gap = 0.25 } = {}) {
    if (isMuted) {
      return;
    }
    const ctx = ensureAudioContext();
    if (!ctx) {
      return;
    }
    const now = ctx.currentTime;
    for (let i = 0; i < times; i += 1) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + i * gap;
      const endTime = startTime + duration;

      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.4, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.start(startTime);
      oscillator.stop(endTime + 0.05);
    }
  }

  function showReminderMessage(message, type) {
    reminderMessage.textContent = message || DEFAULT_REMINDER_MESSAGE;
    reminderMessage.classList.remove('success', 'error');
    if (type) {
      reminderMessage.classList.add(type);
    }
    clearTimeout(reminderMessageTimeout);
    if (message) {
      reminderMessageTimeout = window.setTimeout(() => {
        reminderMessage.classList.remove('success', 'error');
        reminderMessage.textContent = DEFAULT_REMINDER_MESSAGE;
      }, 4000);
    }
  }

  function showSettingsMessage(message, type) {
    settingsMessage.textContent = message || '';
    settingsMessage.classList.remove('success', 'error');
    if (type) {
      settingsMessage.classList.add(type);
    }
    clearTimeout(settingsMessageTimeout);
    if (message) {
      settingsMessageTimeout = window.setTimeout(() => {
        settingsMessage.classList.remove('success', 'error');
        settingsMessage.textContent = '';
      }, 4000);
    }
  }

  function renderReminderList() {
    reminderList.innerHTML = '';
    if (reminders.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'reminder-empty';
      empty.textContent = '尚未設定提醒。';
      reminderList.appendChild(empty);
      return;
    }

    reminders.sort((a, b) => b.seconds - a.seconds);
    reminders.forEach((reminder) => {
      const item = document.createElement('li');
      item.className = 'reminder-item';
      item.dataset.reminderId = String(reminder.id);

      const label = document.createElement('span');
      label.textContent = `剩 ${formatReminderLabel(reminder.seconds)}`;
      item.appendChild(label);

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'reminder-remove';
      removeButton.textContent = '移除';
      removeButton.setAttribute('aria-label', `移除剩 ${formatReminderLabel(reminder.seconds)} 的提醒`);
      item.appendChild(removeButton);

      reminderList.appendChild(item);
    });
  }

  function addReminder() {
    if (totalDurationSeconds <= 0) {
      showSettingsMessage('請先設定大於 0 的總時長。', 'error');
      return;
    }

    const value = parseFloat(reminderInput.value);
    if (!Number.isFinite(value)) {
      showReminderMessage('請輸入正確的提醒分鐘數。', 'error');
      return;
    }

    const seconds = Math.round(value * 60);
    if (seconds <= 0) {
      showReminderMessage('提醒點需大於 0 分鐘。', 'error');
      return;
    }

    if (seconds >= totalDurationSeconds) {
      showReminderMessage('提醒點需小於總時長，請重新輸入。', 'error');
      return;
    }

    const exists = reminders.some((reminder) => reminder.seconds === seconds);
    if (exists) {
      showReminderMessage('此提醒點已存在。', 'error');
      return;
    }

    reminderIdCounter += 1;
    reminders.push({ id: reminderIdCounter, seconds, triggered: false });
    reminderInput.value = '';
    renderReminderList();
    showReminderMessage(`已加入提醒：剩 ${formatReminderLabel(seconds)}。`, 'success');
  }

  function removeReminder(id) {
    const targetReminder = reminders.find((reminder) => reminder.id === id);
    if (!targetReminder) {
      return;
    }
    reminders = reminders.filter((reminder) => reminder.id !== id);
    renderReminderList();
    showReminderMessage(`已移除提醒：剩 ${formatReminderLabel(targetReminder.seconds)}。`, 'success');
  }

  function checkReminders(remainingSecondsPrecise) {
    if (remainingSecondsPrecise <= 0) {
      return;
    }
    reminders.forEach((reminder) => {
      if (!reminder.triggered && remainingSecondsPrecise <= reminder.seconds) {
        reminder.triggered = true;
        enterReminderState(`提醒：剩 ${formatReminderLabel(reminder.seconds)}`);
        playBeep(1, { frequency: 1040, duration: 0.16 });
      }
    });
  }

  function finishTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    expectedEndTimestamp = null;
    isRunning = false;
    remainingSeconds = 0;
    enterEndedState();
    updateTimeDisplay(remainingSeconds);
    playBeep(2, { frequency: 740, duration: 0.2, gap: 0.35 });
    updateStartPauseButton();
  }

  function tick() {
    if (!expectedEndTimestamp) {
      return;
    }
    const now = Date.now();
    const remainingMs = Math.max(0, expectedEndTimestamp - now);
    const remainingSecondsPrecise = remainingMs / 1000;
    const displaySeconds = Math.ceil(remainingSecondsPrecise);

    if (displaySeconds !== remainingSeconds) {
      remainingSeconds = displaySeconds;
      updateTimeDisplay(remainingSeconds);
    } else {
      updateDocumentTitle(remainingSeconds);
    }

    checkReminders(remainingSecondsPrecise);

    if (remainingMs <= 0) {
      finishTimer();
    }
  }

  function startTimer() {
    if (totalDurationSeconds <= 0) {
      return;
    }

    if (remainingSeconds <= 0 || remainingSeconds > totalDurationSeconds) {
      remainingSeconds = totalDurationSeconds;
      resetReminderTriggers();
      resetVisualState();
      updateTimeDisplay(remainingSeconds);
    } else {
      clearEndedState();
    }

    ensureAudioContext();
    isRunning = true;
    updateStartPauseButton();

    expectedEndTimestamp = Date.now() + remainingSeconds * 1000;
    clearInterval(timerInterval);
    timerInterval = window.setInterval(tick, 100);
    tick();
  }

  function pauseTimer() {
    if (!isRunning) {
      return;
    }
    if (expectedEndTimestamp) {
      const remainingMs = Math.max(0, expectedEndTimestamp - Date.now());
      remainingSeconds = Math.ceil(remainingMs / 1000);
      updateTimeDisplay(remainingSeconds);
    }
    clearInterval(timerInterval);
    timerInterval = null;
    expectedEndTimestamp = null;
    isRunning = false;
    updateStartPauseButton();
  }

  function resetTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    expectedEndTimestamp = null;
    isRunning = false;
    remainingSeconds = totalDurationSeconds;
    resetReminderTriggers();
    resetVisualState();
    updateTimeDisplay(remainingSeconds);
    updateStartPauseButton();
    updateStartButtonAvailability();
  }

  function applySettings(event) {
    event.preventDefault();
    const minutes = parseFloat(durationInput.value);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      showSettingsMessage('請輸入大於 0 的總時長。', 'error');
      return;
    }
    const seconds = Math.round(minutes * 60);
    if (seconds <= 0) {
      showSettingsMessage('請輸入大於 0 的總時長。', 'error');
      return;
    }

    totalDurationSeconds = seconds;
    const removedCount = reminders.filter((reminder) => reminder.seconds >= totalDurationSeconds).length;
    reminders = reminders.filter((reminder) => reminder.seconds < totalDurationSeconds);
    resetTimer();
    renderReminderList();

    if (removedCount > 0) {
      showReminderMessage(`有 ${removedCount} 個提醒超出新的總時長，已為您移除。`, 'success');
    } else {
      showReminderMessage('', '');
    }

    showSettingsMessage('已套用新的總時長。', 'success');
  }

  eventTitleInput.addEventListener('input', updateTitleDisplay);

  startPauseButton.addEventListener('click', () => {
    if (isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  });

  resetButton.addEventListener('click', () => {
    resetTimer();
  });

  muteButton.addEventListener('click', () => {
    isMuted = !isMuted;
    muteButton.classList.toggle('is-muted', isMuted);
    muteButton.textContent = isMuted ? '🔕 音效：關' : '🔔 音效：開';
    muteButton.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
  });

  addReminderButton.addEventListener('click', addReminder);

  reminderInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addReminder();
    }
  });

  reminderList.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.classList.contains('reminder-remove')) {
      const { reminderId } = target.parentElement.dataset;
      if (reminderId) {
        removeReminder(Number(reminderId));
      }
    }
  });

  settingsForm.addEventListener('submit', applySettings);

  resetTimer();
  renderReminderList();
  updateTitleDisplay();
  showReminderMessage('', '');
})();
