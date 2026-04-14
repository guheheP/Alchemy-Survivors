/**
 * TutorialOverlay — 初回プレイ時のステップガイド
 */

const STEPS = [
  {
    title: 'Alchemy Survivorsへようこそ！',
    text: 'このゲームは、自分で武器を鍛えて戦場を制圧するサバイバルアクションです。まずは基本を見ていきましょう。',
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
    text: 'WASD / 矢印キーで移動、Space でダッシュ。武器は自動で攻撃します。Tab キーで詳細ステータスを確認できます。',
    icon: '🎮',
  },
  {
    title: 'レベルアップで強化',
    text: '敵を倒してレベルアップすると、3択の強化を選べます。数字キー 1・2・3 でも選択可能。装備特性もパッシブ効果として作用します。',
    icon: '⬆️',
  },
  {
    title: 'クラフトのループ',
    text: 'ランで集めた素材は倉庫に永続保管。より良い素材を集めて、強力な特性を持つ装備を融合で鍛え上げましょう。',
    icon: '🔄',
  },
  {
    title: '冒険の始まり',
    text: '素材 → クラフト → 装備 → ラン のサイクルを回して、すべてのステージを攻略しましょう。幸運を！',
    icon: '🌟',
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
    const isFirst = this.step === 0;

    this.el.innerHTML = `
      <div class="tutorial-backdrop"></div>
      <div class="tutorial-card" role="dialog" aria-labelledby="tutorial-title-${this.step}" aria-describedby="tutorial-text-${this.step}">
        <div class="tutorial-step-indicator" aria-label="ステップ ${this.step + 1} / ${STEPS.length}">
          ${STEPS.map((_, i) => `<span class="tutorial-dot ${i === this.step ? 'active' : i < this.step ? 'done' : ''}" aria-hidden="true"></span>`).join('')}
        </div>
        <div class="tutorial-step-count">${this.step + 1} / ${STEPS.length}</div>
        <div class="tutorial-icon" aria-hidden="true">${s.icon}</div>
        <h3 class="tutorial-title" id="tutorial-title-${this.step}">${s.title}</h3>
        <p class="tutorial-text" id="tutorial-text-${this.step}">${s.text}</p>
        <div class="tutorial-actions">
          <div class="tutorial-nav-left">
            <button class="tutorial-skip" aria-label="チュートリアルをスキップ">スキップ</button>
            ${!isFirst ? '<button class="tutorial-back" aria-label="前のステップ">← 戻る</button>' : ''}
          </div>
          <button class="tutorial-next" aria-label="${isLast ? 'ゲームを始める' : '次のステップ'}">${isLast ? '🚀 始める！' : '次へ →'}</button>
        </div>
      </div>
    `;

    this.el.querySelector('.tutorial-skip').addEventListener('click', () => this._complete());
    const backBtn = this.el.querySelector('.tutorial-back');
    if (backBtn) backBtn.addEventListener('click', () => { this.step--; this._render(); });
    this.el.querySelector('.tutorial-next').addEventListener('click', () => {
      if (isLast) {
        this._complete();
      } else {
        this.step++;
        this._render();
      }
    });
    // フォーカスを次へボタンに
    const nextBtn = this.el.querySelector('.tutorial-next');
    if (nextBtn) nextBtn.focus();
  }

  _complete() {
    this.el.remove();
    if (this.onComplete) this.onComplete();
  }

  destroy() {
    this.el.remove();
  }
}
