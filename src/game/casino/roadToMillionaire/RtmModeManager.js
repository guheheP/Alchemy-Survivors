/**
 * RtmModeManager.js — 内部モード管理
 *
 * プレイヤー非可視のモード (normal / chance / heaven / super_heaven) を
 * 管理し、レア役成立時の昇格抽選と AT 終了時の遷移抽選を担う。
 *
 * super_heaven が最高モードで、それ以上には上がらない (capped)。
 */

import { RTM_MODE_UP_TABLE, RTM_MODE_TRANSITION_ON_AT_END_TABLE, RTM_PROB_DENOM } from './data/rtmProbabilities.js';
import { drawFromDistribution } from '../util/rng.js';

/** @typedef {'normal'|'chance'|'heaven'|'super_heaven'} RtmMode */
/** @typedef {'cherry'|'watermelon'|'chance'} RtmRareFlag */

/** モードの順序 (index = 段階) */
const MODE_ORDER = ['normal', 'chance', 'heaven', 'super_heaven'];

/**
 * 指定モードから delta 段階だけ上昇させる。上限 super_heaven で頭打ち。
 * @param {RtmMode} mode
 * @param {1|2|3} delta
 * @returns {RtmMode}
 */
function bumpMode(mode, delta) {
  const idx = MODE_ORDER.indexOf(mode);
  if (idx < 0) return 'normal';
  const next = Math.min(MODE_ORDER.length - 1, idx + delta);
  return /** @type {RtmMode} */ (MODE_ORDER[next]);
}

export class RtmModeManager {
  /**
   * @param {object} opts
   * @param {import('../util/rng.js').Rng} opts.rng
   * @param {() => (1|2|3|4|5|6)} opts.getSetting
   */
  constructor({ rng, getSetting }) {
    this.rng = rng;
    this.getSetting = getSetting;
  }

  /**
   * レア役成立時のモード昇格抽選。
   * 現モードが super_heaven の場合は昇格抽選をスキップしてそのまま返す。
   * @param {RtmMode} currentMode
   * @param {RtmRareFlag} rareFlag - cherry/watermelon/chance
   * @returns {RtmMode} 新モード (変化なしなら同じ値)
   */
  drawModeUp(currentMode, rareFlag) {
    if (currentMode === 'super_heaven') return currentMode;
    const setting = this.getSetting();
    const table = RTM_MODE_UP_TABLE[setting]?.[rareFlag];
    if (!table) return currentMode;
    const result = drawFromDistribution(table, RTM_PROB_DENOM, this.rng);
    switch (result) {
      case 'up1': return bumpMode(currentMode, 1);
      case 'up2': return bumpMode(currentMode, 2);
      case 'up3': return bumpMode(currentMode, 3);
      case 'stay':
      default:
        return currentMode;
    }
  }

  /**
   * AT終了時のモード移行抽選。
   * @returns {RtmMode}
   */
  transitionOnAtEnd() {
    const setting = this.getSetting();
    const table = RTM_MODE_TRANSITION_ON_AT_END_TABLE[setting];
    if (!table) return 'normal';
    return /** @type {RtmMode} */ (drawFromDistribution(table, RTM_PROB_DENOM, this.rng));
  }
}
