/**
 * rtmSymbols.js — Road to Millionaire の絵柄定義
 *
 * 6種類の絵柄。ミリオンゴッド系譜の高射幸性AT機。
 * 画像は既存スロットのassetを暫定流用（後日、神殿/マネーモチーフに差し替え予定）。
 *
 * GOD   : AT揃い用（AT_STANDBY中にこの図柄を揃えてAT突入）
 * MONEY : レア演出用（チャンス目のテンパイハズレ等）
 * BELL  : 通常小役・AT中ナビ対象
 * WATERMELON : レア小役（モード昇格ソース）
 * CHERRY     : レア小役（モード昇格ソース）
 * REPLAY     : 再遊技（AT中は純増リプレイ）
 */

import { assetPath } from '../../../core/assetPath.js';

/** @typedef {'GOD'|'MONEY'|'BELL'|'WATERMELON'|'CHERRY'|'REPLAY'} RtmSymbolId */

export const RTM_SYMBOLS = {
  GOD:        { label: 'GOD',      japanese: '神の恩寵',   image: assetPath('/art/casino/symbols/blue7.png') },
  MONEY:      { label: 'MONEY',    japanese: '黄金の山',   image: assetPath('/art/casino/symbols/big7_red.png') },
  BELL:       { label: 'ベル',     japanese: '聖鐘',       image: assetPath('/art/casino/symbols/bell.png') },
  WATERMELON: { label: 'スイカ',   japanese: '神酒の実',   image: assetPath('/art/casino/symbols/watermelon.png') },
  CHERRY:     { label: 'チェリー', japanese: '血の勲章',   image: assetPath('/art/casino/symbols/cherry.png') },
  REPLAY:     { label: 'リプレイ', japanese: '神託',       image: assetPath('/art/casino/symbols/replay.png') },
};

/** @type {RtmSymbolId[]} */
export const RTM_SYMBOL_IDS = Object.keys(RTM_SYMBOLS);
