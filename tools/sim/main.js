/**
 * Sim — メインエントリ。タブ切替で各 Layer のパネルを描画
 */

import { renderLayer1Panel } from './layer1/Layer1Panel.js';
import { renderLayer2Panel } from './layer2/Layer2Panel.js';
import { renderLayer3Panel } from './layer3/Layer3Panel.js';

const TABS = [
  { id: 'layer1', label: 'Layer 1: DPS/EHP', render: renderLayer1Panel },
  { id: 'layer2', label: 'Layer 2: 確率シム', render: renderLayer2Panel },
  { id: 'layer3', label: 'Layer 3: フルラン', render: renderLayer3Panel },
];

function init() {
  const root = document.getElementById('sim-root');
  if (!root) return;

  let activeTab = TABS[0].id;

  function render() {
    root.innerHTML = `
      <header class="sim-header">
        <h1>🧪 Alchemy Survivors — Balance Simulator</h1>
        <nav class="sim-tabs">
          ${TABS.map(t => `<button class="sim-tab ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
        </nav>
      </header>
      <main class="sim-content" id="sim-content"></main>
    `;
    root.querySelectorAll('.sim-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        render();
      });
    });
    const tab = TABS.find(t => t.id === activeTab);
    const content = root.querySelector('#sim-content');
    if (tab && content) tab.render(content);
  }

  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
