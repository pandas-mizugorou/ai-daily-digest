// readstate.js — 既読 / ブックマーク状態の管理 (Phase 2-1、日次/検索ページで共有)
//
// 完全クライアントサイド・無料。localStorage に item.id の集合を持つ。
//   aidd:read  … 一度開いた / 元記事を踏んだ記事 (カードを淡色化して既読を示す)
//   aidd:saved … ☆ で保存した記事 (ヘッダーの保存ビューで後から読む)
//
// id は記事ごとにほぼ一意 (source slug ベース)。保存ビューは search-index.json から
// id で解決するため、ここでは id 文字列のみ保持する。

const READ_KEY = "aidd:read";
const SAVED_KEY = "aidd:saved";
const MAX_READ = 4000; // 上限 (古いものから間引く。閲覧履歴が無限に膨らまないように)

function loadSet(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); } catch { return new Set(); }
}
function persist(key, set) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch {}
}

const readSet = loadSet(READ_KEY);
const savedSet = loadSet(SAVED_KEY);
const listeners = new Set(); // saved 変更通知 (ヘッダーのバッジ更新用)

function emit() { for (const cb of listeners) { try { cb(); } catch {} } }

export function isRead(id) { return id != null && readSet.has(id); }

export function markRead(id) {
  if (id == null || readSet.has(id)) return;
  readSet.add(id);
  // 上限超過時は挿入順 (Set は挿入順) の先頭から間引く
  if (readSet.size > MAX_READ) {
    const it = readSet.values();
    for (let i = 0, n = readSet.size - MAX_READ; i < n; i++) readSet.delete(it.next().value);
  }
  persist(READ_KEY, readSet);
}

export function isSaved(id) { return id != null && savedSet.has(id); }

export function toggleSaved(id) {
  if (id == null) return false;
  if (savedSet.has(id)) savedSet.delete(id);
  else savedSet.add(id);
  persist(SAVED_KEY, savedSet);
  emit();
  return savedSet.has(id);
}

export function removeSaved(id) {
  if (savedSet.delete(id)) { persist(SAVED_KEY, savedSet); emit(); }
}

export function savedIds() { return [...savedSet]; }
export function savedCount() { return savedSet.size; }
export function onSavedChange(cb) { listeners.add(cb); return () => listeners.delete(cb); }
