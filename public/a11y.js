const A11Y_STORAGE_KEY = 'truecalo_a11y';

export function applySavedA11y() {
  try {
    const saved = localStorage.getItem(A11Y_STORAGE_KEY);
    if (!saved) return;
    const prefs = JSON.parse(saved);
    const root = document.documentElement;
    root.classList.toggle('a11y-large-text', Boolean(prefs.largeText));
    root.classList.toggle('a11y-high-contrast', Boolean(prefs.highContrast));
    root.classList.toggle('a11y-reduced-motion', Boolean(prefs.reducedMotion));
  } catch {}
}

export function mountAccessibilityMenu({ $, state, openModal, showToast }) {
  let prefs = { largeText: false, highContrast: false, reducedMotion: false };
  try {
    const saved = localStorage.getItem(A11Y_STORAGE_KEY);
    if (saved) prefs = { ...prefs, ...JSON.parse(saved) };
  } catch {}

  const btnLarge = $('#btnA11yLargeText');
  const btnContrast = $('#btnA11yHighContrast');
  const btnSpeech = $('#btnA11ySpeech');
  const btnMotion = $('#btnA11yReducedMotion');
  const btnNavHelp = $('#btnA11yNavHelp');
  const navHelpBox = $('#a11yNavHelpBox');

  function syncUI() {
    const root = document.documentElement;
    root.classList.toggle('a11y-large-text', Boolean(prefs.largeText));
    root.classList.toggle('a11y-high-contrast', Boolean(prefs.highContrast));
    root.classList.toggle('a11y-reduced-motion', Boolean(prefs.reducedMotion));
    btnLarge?.classList.toggle('active', prefs.largeText);
    btnContrast?.classList.toggle('active', prefs.highContrast);
    btnMotion?.classList.toggle('active', prefs.reducedMotion);
  }

  function save() {
    localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(prefs));
    syncUI();
  }

  syncUI();

  btnLarge?.addEventListener('click', () => {
    prefs.largeText = !prefs.largeText;
    save();
  });
  btnContrast?.addEventListener('click', () => {
    prefs.highContrast = !prefs.highContrast;
    save();
  });
  btnMotion?.addEventListener('click', () => {
    prefs.reducedMotion = !prefs.reducedMotion;
    save();
  });

  btnNavHelp?.addEventListener('click', () => {
    const isHidden = navHelpBox?.classList.toggle('hidden');
    btnNavHelp.classList.toggle('active', !isHidden);
  });

  btnSpeech?.addEventListener('click', () => {
    if (!('speechSynthesis' in window)) {
      showToast('Tu navegador no soporta lectura de texto por voz.', true);
      return;
    }
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      btnSpeech.classList.remove('active');
      showToast('Lectura de texto detenida.');
      return;
    }
    const itemsText = state.items
      .slice(0, 5)
      .map(i => `${i.title}, en ${i.location}.`)
      .join(' ');
    const summary = `Bienvenido a TRUECALO. Si te interesa, cámbialo. Hay ${state.items.length} objetos mostrados. ${itemsText}`;
    const utter = new SpeechSynthesisUtterance(summary);
    utter.lang = 'es-ES';
    utter.onend = () => btnSpeech.classList.remove('active');
    btnSpeech.classList.add('active');
    window.speechSynthesis.speak(utter);
  });

  $('#btnA11yReset')?.addEventListener('click', () => {
    prefs = { largeText: false, highContrast: false, reducedMotion: false };
    window.speechSynthesis?.cancel();
    btnSpeech?.classList.remove('active');
    save();
    showToast('Opciones de accesibilidad restablecidas.');
  });

  openModal('a11yModal');
}
