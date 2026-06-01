// Inline SVG icons — ported from the Icon object in wireframe-kit.jsx.
import type { ReactElement } from 'react';

export const Icon: Record<string, ReactElement> = {
  chevDown: <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2.5 4.5L6 8l3.5-3.5" /></svg>,
  chevRight: <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4.5 2.5L8 6l-3.5 3.5" /></svg>,
  chevLeft: <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M7.5 2.5L4 6l3.5 3.5" /></svg>,
  plus: <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 2v8M2 6h8" /></svg>,
  cal: <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" strokeLinecap="round" /></svg>,
  sync: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M13 4.5A5.5 5.5 0 0 0 3 6M3 2.5V6h3.5M3 11.5A5.5 5.5 0 0 0 13 10M13 13.5V10H9.5" /></svg>,
  users: <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="6" cy="5" r="2.4" /><path d="M2 13c0-2.2 1.8-3.6 4-3.6S10 10.8 10 13" strokeLinecap="round" /><path d="M11 3.2A2.2 2.2 0 0 1 12 7.4M11.5 9.6c1.7.3 2.9 1.6 2.9 3.4" strokeLinecap="round" /></svg>,
  close: <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M3 3l6 6M9 3l-6 6" /></svg>,
  trash: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M2.5 4h9M5.5 4V2.8h3V4M3.7 4l.5 7.2h5.6l.5-7.2" /></svg>,
  edit: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9.3 2.4l2.3 2.3M10.2 1.5a1.2 1.2 0 0 1 1.7 1.7L4.4 10.7 1.8 11.5l.8-2.6 7.6-7.4z" /></svg>,
  sun: <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="3.1" /><path d="M8 1.4v1.7M8 12.9v1.7M1.4 8h1.7M12.9 8h1.7M3.3 3.3l1.2 1.2M11.5 11.5l1.2 1.2M12.7 3.3l-1.2 1.2M4.5 11.5l-1.2 1.2" /></svg>,
  moon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 9.4A5.6 5.6 0 0 1 6.6 2.5a5.6 5.6 0 1 0 6.9 6.9z" /></svg>,
};
