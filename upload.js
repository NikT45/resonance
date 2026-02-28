const modeTabs = [...document.querySelectorAll('.mode-tab')];
const modePanels = {
  pdf: document.getElementById('mode-pdf'),
  text: document.getElementById('mode-text'),
};

const pace = document.getElementById('pace');
const background = document.getElementById('background');
const emotion = document.getElementById('emotion');

const paceLabel = document.getElementById('pace-label');
const backgroundLabel = document.getElementById('background-label');
const emotionLabel = document.getElementById('emotion-label');

const rangeBand = (value, bands) => {
  const numeric = Number(value);
  if (numeric <= 25) return bands[0];
  if (numeric <= 50) return bands[1];
  if (numeric <= 75) return bands[2];
  return bands[3];
};

const setMode = (mode) => {
  modeTabs.forEach((tab) => {
    const isActive = tab.dataset.mode === mode;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });

  Object.entries(modePanels).forEach(([key, panel]) => {
    if (!panel) return;
    panel.classList.toggle('active', key === mode);
  });
};

modeTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    setMode(tab.dataset.mode);
  });
});

if (pace && paceLabel) {
  const updatePace = () => {
    paceLabel.textContent = rangeBand(pace.value, ['Very Slow', 'Balanced', 'Quick', 'Fast-Cut']);
  };
  updatePace();
  pace.addEventListener('input', updatePace);
}

if (background && backgroundLabel) {
  const updateBackground = () => {
    backgroundLabel.textContent = rangeBand(background.value, ['Minimal', 'Moderate', 'Layered', 'Cinematic']);
  };
  updateBackground();
  background.addEventListener('input', updateBackground);
}

if (emotion && emotionLabel) {
  const updateEmotion = () => {
    emotionLabel.textContent = rangeBand(emotion.value, ['Subtle', 'Warm', 'Expressive', 'Intense']);
  };
  updateEmotion();
  emotion.addEventListener('input', updateEmotion);
}
