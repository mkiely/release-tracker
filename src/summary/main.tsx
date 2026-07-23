import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import '../styles/base.css';
import { SummaryApp } from './SummaryApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SummaryApp />
  </StrictMode>,
);
