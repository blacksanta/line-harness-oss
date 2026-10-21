import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';
import { initLiff } from './lib/liff-auth.js';
import './index.css';

// LIFF endpoint に到着したとき URL が `?page=event&id=X` 形式のことがある
// （`/o` や `/r/:ref` が LIFF のクエリパススルーで生成する形式）。
// React Router は path ベースなのでクエリだけでは振り分けできない。
// initLiff() の後・render() の前に history.replaceState で path に書き換える。
// `_redirects` ではクエリのキャプチャができないため JS で行う以外に手段が無い。
function rewritePageQuery(): void {
  const url = new URL(window.location.href);
  const page = url.searchParams.get('page');
  if (!page) return; // べき等: page クエリが無ければ何もしない

  const next = new URLSearchParams(url.searchParams);
  next.delete('page');
  let newPath: string | null = null;

  if (page === 'event') {
    const id = next.get('id');
    if (id) {
      next.delete('id');
      newPath = `/events/${id}`;
    }
  } else if (page === 'salon-book') {
    newPath = '/booking';
  } else if (page === 'event-me') {
    newPath = '/events/me';
  }

  if (!newPath) return; // 未知の page 値は触らない（前方互換）
  const qs = next.toString();
  const fullPath = `${basename}${newPath}`;
  window.history.replaceState(null, '', qs ? `${fullPath}?${qs}` : fullPath);
}
// three-surfaces bundle（2026-08-24）: このアプリが `/liff-app` のようなサブパスで
// 配信されるとき、クライアント側ルーティングもそのプレフィックス配下で動く必要がある。
// `import.meta.env.BASE_URL`（vite が vite.config.ts の `base` から自動で埋める。
// 末尾 '/' 付き）を react-router の basename に渡す — root 配信（'/'）のときは
// basename='' になり、これまでどおり動く。
const basename = import.meta.env.BASE_URL.replace(/\/+$/, '');

(async () => {
  try {
    await initLiff();
    rewritePageQuery();
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <BrowserRouter basename={basename}>
          <App />
        </BrowserRouter>
      </StrictMode>,
    );
  } catch (err) {
    document.getElementById('root')!.innerHTML = `
      <div style="padding: 2rem; font-family: sans-serif; color: #b91c1c;">
        <h1 style="font-size: 1.25rem; margin-bottom: 1rem;">起動できませんでした</h1>
        <p>${err instanceof Error ? err.message : String(err)}</p>
      </div>
    `;
  }
})();
