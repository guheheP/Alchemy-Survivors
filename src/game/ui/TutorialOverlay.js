/**
 * TutorialOverlay — 初回プレイ時のステップガイド
 */

const STEPS = [
  {
    title: 'Alchemy Survivorsへようこそ！',
    text: 'このゲームは、自分で武器を鍛えて戦場を制圧するサバイバルアクションです。',
    icon: '⚔️',
  },
  {
    title: '錬金工房',
    text: '素材を使って武器・防具・アクセサリを作りましょう。品質と特性がランでの強さに直結します。',
    icon: '🔮',
    tab: 'craft',
  },
  {
    title: '装備変更',
    text: '作った装備をセットしましょう。武器は最大4つまで装備でき、レベルアップで順次解放されます。',
    icon: '⚔️',
    tab: 'equip',
  },
  {
    title: '出撃準備',
    text: 'ステージを選んで出撃！消耗品を3つまで持ち込めます。ボスを撃破すると新ステージが解放されます。',
    icon: '🚀',
    tab: 'prep',
  },
  {
    title: 'ラン中の操作',
    text: 'WASD/矢印キーで移動、Spaceでダッシュ。武器は自動で攻撃します。レベルアップ時にパッシブを選択しましょう。',
    icon: '🎮',
  },
  {
    title: '素材を集めてクラフト',
    text: 'ランで集めた素材は倉庫に保管されます。素材→クラフト→装備→ランのループを回して、より強い装備を作りましょう！',
    icon: '🔄',
  },
];

export class TutorialOverlay {
  constructor(container, onComplete) {
    this.container = container;
    this.onComplete = onComplete;
    this.step = 0;
    this.el = document.createElement('div');
    this.el.className = 'tutorial-overlay';
    this._render();
    this.container.appendChild(this.el);
  }

  _render() {
    const s = STEPS[this.step];
    const isLast = this.step === STEPS.length - 1;

    this.el.innerHTML = `
      <div class="tutorial-backdrop"></div>
      <div class="tutorial-card">
        <div class="tutorial-step-indicator">
          ${STEPS.map((_, i) => `<span class="tutorial-dot ${i === this.step ? 'active' : i < this.step ? 'done' : ''}"></span>`).join('')}
        </div>
        <div class="tutorial-icon">${s.icon}</div>
        <h3 class="tutorial-title">${s.title}</h3>
        <p class="tutorial-text">${s.text}</p>
        <div class="tutorial-actions">
          <button class="tutorial-skip">スキップ</button>
          <button class="tutorial-next">${isLast ? '始める！' : '次へ →'}</button>
        </div>
      </div>
    `;

    this.el.querySelector('.tutorial-skip').addEventListener('click', () => this._complete());
    this.el.querySelector('.tutorial-next').addEventListener('click', () => {
      if (isLast) {
        this._complete();
      } else {
        this.step++;
        this._render();
      }
    });
  }

  _complete() {
    this.el.remove();
    if (this.onComplete) this.onComplete();
  }

  destroy() {
    this.el.remove();
  }
}
