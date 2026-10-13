import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Rose is the light theme, midnight is the dark one. Use the saved choice, else follow the system setting.
let theme = null;
try { theme = localStorage.getItem('theme'); } catch { /* storage blocked */ }
if (theme !== 'midnight' && theme !== 'rose') {
  theme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'midnight' : 'rose';
}
document.documentElement.dataset.theme = theme;

createRoot(document.getElementById('root')).render(<App />);