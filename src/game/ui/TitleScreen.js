/**
 * TitleScreen — タイトル画面
 */

export class TitleScreen {
  constructor(container, onStart) {
    this.container = container;
    this.el = document.createElement('div');
    this.el.id = 'title-screen';
    this.el.innerHTML = `
      <div class="title-content">
        <h1 class="title-name">Alchemy Survivors</h1>
        <p class="title-sub">アルケミー・サバイバーズ</p>
        <div class="title-buttons">
          <button class="title-btn" id="title-new-game">ニューゲーム</button>
          <button class="title-btn title-btn-secondary" id="title-continue" disabled>コンティニュー</button>
        </div>
      </div>
    `;
    container.appendChild(this.el);

    // セーブデータ存在チェック
    const hasSave = localStorage.getItem('alchemy_survivors_save_v1');
    if (hasSave) {
      const continueBtn = this.el.querySelector('#title-continue');
      continueBtn.disabled = false;
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
