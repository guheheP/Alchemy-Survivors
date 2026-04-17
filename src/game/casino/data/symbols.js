/**
 * symbols.js — 絵柄定義
 *
 * 6種類の絵柄（ベル・スイカ・チェリー・リプレイ・赤7・青7）。
 * チャンス目は専用絵柄を持たず、停止パターンで表現する（chancePatterns.js 参照）。
 */

import { assetPath } from '../../core/assetPath.js';

/** @typedef {'BELL'|'WATERMELON'|'CHERRY'|'REPLAY'|'BIG7'|'BLUE7'} SymbolId */

export const SYMBOLS = {
  BELL:       { label: 'ベル',     japanese: '黄銅片',         image: assetPath('/art/casino/symbols/bell.png') },
  WATERMELON: { label: 'スイカ',   japanese: '月光草',         image: assetPath('/art/casino/symbols/watermelon.png') },
  CHERRY:     { label: 'チェリー', japanese: '血色結晶',       image: assetPath('/art/casino/symbols/cherry.png') },
  REPLAY:     { label: 'リプレイ', japanese: '賢者の石の欠片', image: assetPath('/art/casino/symbols/replay.png') },
  BIG7:       { label: '赤7',     japanese: '火竜の鱗',       image: assetPath('/art/casino/symbols/big7_red.png') },
  BLUE7:      { label: '青7',     japanese: '水竜の鱗',       image: assetPath('/art/casino/symbols/blue7.png') },
};

/** @type {SymbolId[]} */
export const SYMBOL_IDS = Object.keys(SYMBOLS);
