/**
 * TitleScreen — タイトル画面
 */

const SAVE_KEY = 'alchemy_survivors_save_v1';

function _formatLastPlayed(ts) {
  if (!ts || Number.isNaN(ts)) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'さっき';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}時間前`;
  const days = Math.floor(diff / 86_400_000);
  if (days < 30) return `${days}日前`;
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function _readSaveMeta() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      lastSaved: data?.meta?.savedAt || data?.savedAt || data?.timestamp || null,
      runCount: data?.stats?.totalRuns || data?.totalRuns || null,
    };
  } catch {
    return { lastSaved: null, runCount: null };
  }
}

export class TitleScreen {
  constructor(container, onStart) {
    this.container = container;
    this.el = document.createElement('div');
    this.el.id = 'title-screen';

    const saveMeta = _readSaveMeta();
    const hasSave = saveMeta !== null;
    const lastPlayed = saveMeta?.lastSaved ? _formatLastPlayed(saveMeta.lastSaved) : '';

    this.el.innerHTML = `
      <div class="title-content anim-fade-in">
        <h1 class="title-name">Alchemy Survivors</h1>
        <p class="title-sub">アルケミー・サバイバーズ</p>
        <p class="title-tagline">錬金術で武器を鍛え、終わりなき戦場を生き抜け。</p>
        <ul class="title-features" aria-label="ゲームの特徴">
          <li><span class="title-feature-icon">⚔️</span>自動攻撃のサバイバルアクション</li>
          <li><span class="title-feature-icon">🔮</span>素材からクラフトする武器・防具</li>
          <li><span class="title-feature-icon">🌟</span>34種の特性が変えるビルド</li>
        </ul>
        <div class="title-buttons">
          <button class="title-btn ${hasSave ? 'title-btn-continue' : 'title-btn-primary'}" id="title-continue" ${hasSave ? '' : 'disabled'} aria-label="${hasSave ? '前回の続きからプレイ' : 'セーブデータなし'}">
            <span class="title-btn-icon">${hasSave ? '▶' : '—'}</span>
            <span class="title-btn-label">
              <span class="title-btn-main">${hasSave ? 'コンティニュー' : 'セーブデータなし'}</span>
              ${hasSave && lastPlayed ? `<span class="title-btn-sub">前回プレイ: ${lastPlayed}</span>` : ''}
            </span>
          </button>
          <button class="title-btn ${hasSave ? 'title-btn-secondary' : 'title-btn-primary'}" id="title-new-game" aria-label="新規ゲーム開始">
            <span class="title-btn-icon">✦</span>
            <span class="title-btn-label">
              <span class="title-btn-main">ニューゲーム</span>
              ${!hasSave ? '<span class="title-btn-sub">推奨</span>' : ''}
            </span>
          </button>
        </div>
        <p class="title-hint">操作: WASD/矢印キーで移動 · Spaceでダッシュ · 武器は自動攻撃</p>
      </div>
    `;
    container.appendChild(this.el);

    if (hasSave) {
      const continueBtn = this.el.querySelector('#title-continue');
      continueBtn.addEventListener('click', () => {
        this.hide();
        onStart('continue');
      });
    }

    this.el.querySelector('#title-new-game').addEventListener('click', () => {
      this.hide();
      onStart('new');
    });
  }

  hide() {
    this.el.classList.add('hidden');
  }

  show() {
    this.el.classList.remove('hidden');
  }

  destroy() {
    this.el.remove();
  }
}
