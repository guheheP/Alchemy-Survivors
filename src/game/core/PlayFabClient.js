/**
 * PlayFabClient — Azure PlayFab REST API 薄いラッパー
 *
 * - CustomID による匿名認証（UUID を localStorage に永続化）
 * - UserData（セーブ本体） 読み書き
 * - PlayerStatistics 取得（書き込みはサーバ経由 = ExecuteFunction 想定）
 * - ネットワーク/認証エラーは呼び出し側で握り潰せるよう例外を throw
 *
 * 使い方:
 *   await PlayFabClient.initialize();           // Title ID 確認 + CustomID 取得 + ログイン
 *   const { Data } = await PlayFabClient.getUserData(['save']);
 *   await PlayFabClient.updateUserData({ save: JSON.stringify(saveObj) });
 */

const CUSTOM_ID_KEY = 'alchemy_survivors_playfab_customid';
const SESSION_TICKET_KEY = 'alchemy_survivors_playfab_session_ticket'; // メモリのみで十分だが、リロード耐性のため保存
const PLAYFAB_ID_KEY = 'alchemy_survivors_playfab_id';
const DISPLAY_NAME_KEY = 'alchemy_survivors_display_name'; // ローカルキャッシュ
const EMAIL_KEY = 'alchemy_survivors_email'; // ローカルキャッシュ（連携済みメール表示用）

/** ランダムな PlayFab 用 Username を生成（3〜20 英数字） */
function generateUsername() {
  const rand = Math.random().toString(36).slice(2, 12); // 10 文字
  return `as${rand}`.slice(0, 20);
}

/** ブラウザ組み込みの UUID v4 生成（古い環境は Math.random フォールバック） */
function generateUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** localStorage から CustomID を取得、無ければ作成して保存 */
function getOrCreateCustomId() {
  try {
    let id = localStorage.getItem(CUSTOM_ID_KEY);
    if (!id) {
      id = `as-${generateUuid()}`;
      localStorage.setItem(CUSTOM_ID_KEY, id);
    }
    return id;
  } catch (e) {
    // localStorage が使えない環境（プライベートモード等）ではメモリ内 UUID を返す
    return `as-memory-${generateUuid()}`;
  }
}

export const PlayFabClient = {
  titleId: null,
  baseUrl: null,
  sessionTicket: null,
  playFabId: null,
  entityToken: null,
  entityId: null,
  entityType: null,
  customId: null,
  _initialized: false,
  _loginInFlight: null,

  /**
   * Title ID 設定 + CustomID 確保のみ（実ログインは lazy）
   */
  initialize() {
    const titleId = import.meta.env.VITE_PLAYFAB_TITLE_ID;
    if (!titleId) {
      console.warn('[PlayFab] VITE_PLAYFAB_TITLE_ID is not set. Cloud save disabled.');
      return false;
    }
    this.titleId = titleId;
    this.baseUrl = `https://${titleId}.playfabapi.com`;
    this.customId = getOrCreateCustomId();

    // 前回のセッションチケット復元（有効期限チェックはサーバで行われる）
    try {
      this.sessionTicket = sessionStorage.getItem(SESSION_TICKET_KEY) || null;
      this.playFabId = localStorage.getItem(PLAYFAB_ID_KEY) || null;
    } catch (e) { /* ignore */ }

    this._initialized = true;
    return true;
  },

  isAvailable() {
    return this._initialized && !!this.titleId;
  },

  isLoggedIn() {
    return !!this.sessionTicket;
  },

  getPlayFabId() {
    return this.playFabId;
  },

  getCustomId() {
    return this.customId;
  },

  /**
   * CustomID による匿名ログイン（並列呼び出しは Promise を共有）
   */
  async login() {
    if (!this.isAvailable()) throw new Error('PlayFab not initialized');
    if (this._loginInFlight) return this._loginInFlight;

    this._loginInFlight = (async () => {
      const body = {
        TitleId: this.titleId,
        CustomId: this.customId,
        CreateAccount: true,
      };
      const res = await this._rawPost('/Client/LoginWithCustomID', body, /* auth */ false);
      const data = res.data;
      this.sessionTicket = data.SessionTicket;
      this.playFabId = data.PlayFabId;
      if (data.EntityToken) {
        this.entityToken = data.EntityToken.EntityToken;
        this.entityId = data.EntityToken.Entity?.Id || null;
        this.entityType = data.EntityToken.Entity?.Type || null;
      }
      try {
        sessionStorage.setItem(SESSION_TICKET_KEY, this.sessionTicket);
        localStorage.setItem(PLAYFAB_ID_KEY, this.playFabId);
      } catch (e) { /* ignore */ }

      // EntityToken がレスポンスに含まれなかった場合は明示的に取得
      if (!this.entityToken) {
        await this._fetchEntityToken();
      }
      return data;
    })().finally(() => { this._loginInFlight = null; });

    return this._loginInFlight;
  },

  /**
   * ログイン必須の API を呼ぶ前に必ず呼ぶ
   */
  async ensureLoggedIn() {
    if (!this.isAvailable()) return false;
    if (this.isLoggedIn()) return true;
    await this.login();
    return this.isLoggedIn();
  },

  /**
   * UserData 取得
   * @param {string[]} keys
   * @returns {Promise<{ Data: Record<string, { Value: string }> }>}
   */
  async getUserData(keys) {
    await this.ensureLoggedIn();
    const res = await this._rawPost('/Client/GetUserData', { Keys: keys });
    return res.data;
  },

  /**
   * UserData 更新（value は string のみ受け付ける）
   * @param {Record<string, string>} data
   */
  async updateUserData(data) {
    await this.ensureLoggedIn();
    return (await this._rawPost('/Client/UpdateUserData', { Data: data })).data;
  },

  /**
   * PlayerStatistics 取得（表示用。書き込みはサーバ経由）
   * @param {string[]} [statisticNames]
   */
  async getPlayerStatistics(statisticNames) {
    await this.ensureLoggedIn();
    const body = statisticNames ? { StatisticNames: statisticNames } : {};
    return (await this._rawPost('/Client/GetPlayerStatistics', body)).data;
  },

  /** ローカルキャッシュされた表示名を取得（即時参照用） */
  getDisplayName() {
    try {
      return localStorage.getItem(DISPLAY_NAME_KEY) || null;
    } catch (e) { return null; }
  },

  /**
   * 表示名を更新する（3〜25 文字、PlayFab の制約に従う）
   * @param {string} displayName
   * @returns {Promise<string>} サーバが受理した最終的な表示名
   */
  async updateDisplayName(displayName) {
    await this.ensureLoggedIn();
    const trimmed = String(displayName || '').trim();
    if (trimmed.length < 3 || trimmed.length > 25) {
      throw new Error('表示名は 3〜25 文字で入力してください');
    }
    const res = await this._rawPost('/Client/UpdateUserTitleDisplayName', {
      DisplayName: trimmed,
    });
    const accepted = res.data?.DisplayName || trimmed;
    try { localStorage.setItem(DISPLAY_NAME_KEY, accepted); } catch (e) { /* ignore */ }
    return accepted;
  },

  /**
   * ログイン済みプレイヤーの現在の表示名をサーバから取得
   */
  async fetchDisplayName() {
    await this.ensureLoggedIn();
    const res = await this._rawPost('/Client/GetAccountInfo', {});
    const info = res.data?.AccountInfo;
    const name = info?.TitleInfo?.DisplayName || null;
    const email = info?.PrivateInfo?.Email || null;
    try {
      if (name) localStorage.setItem(DISPLAY_NAME_KEY, name);
      if (email) localStorage.setItem(EMAIL_KEY, email);
      else localStorage.removeItem(EMAIL_KEY);
    } catch (e) { /* ignore */ }
    return name;
  },

  /** ローカルキャッシュされたメールアドレスを取得 */
  getEmail() {
    try { return localStorage.getItem(EMAIL_KEY) || null; } catch (e) { return null; }
  },

  /** 連携済みか（メールアドレスが登録されているか） */
  isAccountLinked() {
    return !!this.getEmail();
  },

  /**
   * 現在の匿名アカウントにメール + パスワードを紐付け（連携）
   * Username は内部的に自動生成（ユーザーには見せない）
   * @param {string} email
   * @param {string} password
   */
  async addUsernamePassword(email, password) {
    await this.ensureLoggedIn();
    const trimmedEmail = String(email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      throw new Error('有効なメールアドレスを入力してください');
    }
    if (!password || password.length < 6 || password.length > 100) {
      throw new Error('パスワードは 6 文字以上で入力してください');
    }
    const res = await this._rawPost('/Client/AddUsernamePassword', {
      Username: generateUsername(),
      Email: trimmedEmail,
      Password: password,
    });
    try { localStorage.setItem(EMAIL_KEY, trimmedEmail); } catch (e) { /* ignore */ }
    return res.data;
  },

  /**
   * 既存アカウントにメール/パスワードでログイン（別端末からの引き継ぎ時）
   * ログイン後、現在の CustomID も同アカウントに紐付けて次回自動ログインが正しく動くようにする
   * @param {string} email
   * @param {string} password
   */
  async loginWithEmailAndPassword(email, password) {
    if (!this.isAvailable()) throw new Error('PlayFab not initialized');
    const trimmedEmail = String(email || '').trim();
    if (!trimmedEmail || !password) {
      throw new Error('メールアドレスとパスワードを入力してください');
    }

    // 現在のセッションを破棄
    this.sessionTicket = null;
    this.entityToken = null;
    try { sessionStorage.removeItem(SESSION_TICKET_KEY); } catch (e) { /* ignore */ }

    const res = await this._rawPost('/Client/LoginWithEmailAddress', {
      TitleId: this.titleId,
      Email: trimmedEmail,
      Password: password,
    }, /* auth */ false);

    const data = res.data;
    this.sessionTicket = data.SessionTicket;
    this.playFabId = data.PlayFabId;
    if (data.EntityToken) {
      this.entityToken = data.EntityToken.EntityToken;
      this.entityId = data.EntityToken.Entity?.Id || null;
      this.entityType = data.EntityToken.Entity?.Type || null;
    }
    try {
      sessionStorage.setItem(SESSION_TICKET_KEY, this.sessionTicket);
      localStorage.setItem(PLAYFAB_ID_KEY, this.playFabId);
      localStorage.setItem(EMAIL_KEY, trimmedEmail);
    } catch (e) { /* ignore */ }

    if (!this.entityToken) {
      try { await this._fetchEntityToken(); } catch (e) { /* ignore */ }
    }

    // この端末の CustomID を紐付け（次回の匿名自動ログインで同じアカウントに接続される）
    try {
      await this._rawPost('/Client/LinkCustomID', {
        CustomId: this.customId,
        ForceLink: true,
      });
    } catch (e) {
      console.warn('[PlayFab] LinkCustomID after email login failed (non-fatal):', e.message || e);
    }

    // 表示名も取り直してキャッシュを更新
    try { await this.fetchDisplayName(); } catch (e) { /* ignore */ }

    return data;
  },

  /**
   * パスワード再設定メールの送信をリクエスト
   * @param {string} email
   */
  async sendAccountRecoveryEmail(email) {
    if (!this.isAvailable()) throw new Error('PlayFab not initialized');
    const trimmedEmail = String(email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      throw new Error('有効なメールアドレスを入力してください');
    }
    return (await this._rawPost('/Client/SendAccountRecoveryEmail', {
      TitleId: this.titleId,
      Email: trimmedEmail,
    }, /* auth */ false)).data;
  },

  /**
   * リーダーボード上位 N 件を取得
   * @param {string} statisticName
   * @param {number} [maxResultsCount=100]
   * @param {number} [startPosition=0]
   */
  async getLeaderboard(statisticName, maxResultsCount = 100, startPosition = 0) {
    await this.ensureLoggedIn();
    return (await this._rawPost('/Client/GetLeaderboard', {
      StatisticName: statisticName,
      StartPosition: startPosition,
      MaxResultsCount: maxResultsCount,
    })).data;
  },

  /**
   * 自分の順位を中心にした近傍を取得
   * @param {string} statisticName
   * @param {number} [maxResultsCount=11]
   */
  async getLeaderboardAroundPlayer(statisticName, maxResultsCount = 11) {
    await this.ensureLoggedIn();
    return (await this._rawPost('/Client/GetLeaderboardAroundPlayer', {
      StatisticName: statisticName,
      MaxResultsCount: maxResultsCount,
    })).data;
  },

  /**
   * セッションチケットで EntityToken を取得
   */
  async _fetchEntityToken() {
    if (!this.sessionTicket) throw new Error('[PlayFab] Cannot fetch entity token without session ticket');
    const res = await this._rawPost('/Authentication/GetEntityToken', {});
    const data = res.data;
    this.entityToken = data.EntityToken;
    this.entityId = data.Entity?.Id || null;
    this.entityType = data.Entity?.Type || null;
    return data;
  },

  /**
   * Azure Functions 経由のサーバ側処理呼び出し（Phase 3 で使用）
   * @param {string} functionName
   * @param {unknown} parameter
   */
  async executeFunction(functionName, parameter) {
    await this.ensureLoggedIn();
    if (!this.entityToken) {
      // 既存セッションで未取得の可能性 → 明示的に取得
      await this._fetchEntityToken();
    }
    if (!this.entityToken) {
      throw new Error('[PlayFab] Entity token is required for ExecuteFunction');
    }
    // ExecuteFunction は通常の API ベース URL を使用（Entity API 扱い）
    const url = `${this.baseUrl}/CloudScript/ExecuteFunction`;
    const body = { FunctionName: functionName, FunctionParameter: parameter, GeneratePlayStreamEvent: true };
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-EntityToken': this.entityToken },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`[PlayFab] ExecuteFunction failed (${response.status}): ${text}`);
    }
    const json = await response.json();
    if (json.code !== 200) throw new Error(`[PlayFab] ExecuteFunction API error: ${json.errorMessage || json.error}`);
    return json.data;
  },

  /** 低レベル POST。auth=true のとき X-Authorization ヘッダを付与 */
  async _rawPost(path, body, auth = true) {
    if (!this.baseUrl) throw new Error('PlayFab not initialized');
    const headers = { 'Content-Type': 'application/json' };
    if (auth) {
      if (!this.sessionTicket) throw new Error('[PlayFab] Not logged in');
      headers['X-Authorization'] = this.sessionTicket;
    }
    let response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error(`[PlayFab] Network error: ${e.message || e}`);
    }

    let json;
    try {
      json = await response.json();
    } catch (e) {
      throw new Error(`[PlayFab] Invalid JSON response (${response.status})`);
    }

    // 認証切れ: セッションチケットを破棄して呼び出し側に伝える
    if (response.status === 401 || json.errorCode === 1000 /* NotAuthenticated */ || json.errorCode === 1074 /* InvalidSessionTicket */) {
      this.sessionTicket = null;
      try { sessionStorage.removeItem(SESSION_TICKET_KEY); } catch (e) { /* ignore */ }
      throw new Error(`[PlayFab] Session expired: ${json.errorMessage || 'unauthenticated'}`);
    }

    if (!response.ok || json.code !== 200) {
      const msg = json.errorMessage || json.error || `HTTP ${response.status}`;
      const detail = json.errorDetails ? ` | ${JSON.stringify(json.errorDetails)}` : '';
      throw new Error(`[PlayFab] ${path} failed: ${msg}${detail}`);
    }

    return json;
  },
};
