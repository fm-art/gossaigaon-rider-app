import '@fortawesome/fontawesome-free/css/all.min.css';
import 'leaflet/dist/leaflet.css';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App';
import './index.css';

if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        setInterval(() => {
          void registration.update();
        }, 60 * 60 * 1000);
      }
    },
  });
}

createRoot(document.getElementById('root')!).render(<App />);
