import '@fontsource/rubik/latin-400.css';
import '@fontsource/rubik/hebrew-400.css';
import '@fontsource/rubik/latin-500.css';
import '@fontsource/rubik/hebrew-500.css';
import '@fontsource/rubik/latin-600.css';
import '@fontsource/rubik/hebrew-600.css';
import './styles/base.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
