#!/usr/bin/env node
// =============================================================================
// 既存LPに「期限カウントダウン」ブロックを末尾追加する一括移行スクリプト
// =============================================================================
//
// 背景:
// 「視聴期限カウントダウン」を独立ブロック化したことで、`access_window_mode != 'none'`
// のときに自動で最下部に出ていた既存挙動が撤廃された。既存LPの表示を維持するため、
// 期限が設定されているLPに対してのみ countdown ブロックを末尾に追加する。
//
// 使い方:
//   API_BASE=https://your-host AUTH_TOKEN=... node scripts/migrate-add-countdown-block.mjs        # dry-run
//   API_BASE=https://your-host AUTH_TOKEN=... node scripts/migrate-add-countdown-block.mjs --apply
//
// 環境変数:
//   API_BASE    : 管理APIのベースURL（例: https://admin.example.com）
//   AUTH_TOKEN  : Authorization ヘッダの Bearer トークン（必要な場合）
//
// 補足:
// - dry-run（デフォルト）: 対象LPを列挙するだけで PUT は行わない
// - --apply 指定時のみ実際に更新する
// =============================================================================

const API_BASE = process.env.API_BASE;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const APPLY = process.argv.includes('--apply');

if (!API_BASE) {
  console.error('ERROR: API_BASE 環境変数を設定してください（例: API_BASE=https://example.com）');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
};

async function listLpPages() {
  const res = await fetch(`${API_BASE}/api/lp-pages`, { headers });
  if (!res.ok) {
    throw new Error(`GET /api/lp-pages -> ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  if (!json.success) throw new Error(`API error: ${json.error}`);
  return json.data;
}

async function updateLpPage(id, body) {
  const res = await fetch(`${API_BASE}/api/lp-pages/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`PUT /api/lp-pages/${id} -> ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  if (!json.success) throw new Error(`API error: ${json.error}`);
  return json.data;
}

function hasCountdown(blocks) {
  return Array.isArray(blocks) && blocks.some((b) => b && b.type === 'countdown');
}

(async () => {
  const lps = await listLpPages();
  console.log(`全LP: ${lps.length} 件`);

  const targets = lps.filter(
    (lp) => lp.accessWindowMode !== 'none' && !hasCountdown(lp.blocks),
  );
  console.log(`対象（期限あり & countdown 未配置）: ${targets.length} 件`);

  for (const lp of targets) {
    const countdownBlock = {
      id: crypto.randomUUID(),
      type: 'countdown',
      title: null,
      showTitle: true,
      color: null,
    };
    const nextBlocks = [...(lp.blocks ?? []), countdownBlock];
    console.log(
      `  - ${lp.slug} (${lp.name}): blocks ${lp.blocks?.length ?? 0} -> ${nextBlocks.length}`,
    );

    if (APPLY) {
      try {
        await updateLpPage(lp.id, { blocks: nextBlocks });
        console.log(`    ✓ updated`);
      } catch (err) {
        console.error(`    ✗ failed: ${err.message}`);
      }
    }
  }

  if (!APPLY) {
    console.log('\n(dry-run。実際に更新するには --apply を付けて再実行してください)');
  } else {
    console.log('\n完了');
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
