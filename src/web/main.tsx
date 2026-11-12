import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/big-shoulders-display/700';
import '@fontsource/big-shoulders-display/900';
import '@fontsource-variable/hanken-grotesk';
import './styles.css';
import { App } from './App.tsx';

createRoot(document.getElementById('racine')!).render(<StrictMode><App /></StrictMode>);
