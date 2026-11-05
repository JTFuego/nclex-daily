// The light/dark toggle. Your choice is saved separately from your study
// progress, so it never touches your answers or appears in backups.
// Until you choose, the app follows your device's setting.

const KEY = 'nursing-study-theme';
const BANNER_COLORS = { light: '#2f5f8c', dark: '#14263d' };

const deviceTheme = matchMedia('(prefers-color-scheme: dark)');

function savedTheme() {
  try {
    const theme = localStorage.getItem(KEY);
    return theme === 'light' || theme === 'dark' ? theme : null;
  } catch {
    return null;
  }
}

export function setupThemeToggle(button) {
  const apply = (theme) => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = BANNER_COLORS[theme];
    button.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
  };

  apply(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

  button.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, next);
    } catch (error) {
      console.error('Could not save the theme choice', error);
    }
    apply(next);
  });

  deviceTheme.addEventListener('change', (event) => {
    if (!savedTheme()) apply(event.matches ? 'dark' : 'light');
  });
}
