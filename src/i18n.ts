/**
 * i18n.ts — minimal string-table i18n (pure, no obsidian import).
 * Locale follows Obsidian's own language setting (localStorage 'language');
 * en is the fallback everywhere, so Node/vitest environments see English.
 * Placeholders use {name} syntax.
 */
const en = {
    // Notices
    'notice.renamed': 'H1Aligner: renamed → {name}',
    'notice.skipped': 'H1Aligner: skipped ({reason})',
    'notice.error': 'H1Aligner error: {message}',
    'notice.nothingToUndo': 'H1Aligner: nothing to undo',
    'notice.undoMoved': 'H1Aligner: cannot undo — file was moved or deleted',
    'notice.undoOccupied': 'H1Aligner: cannot undo — original name is occupied',
    'notice.undone': 'H1Aligner: undone → {path}',
    'notice.undoFailed': 'H1Aligner: undo failed',
    'notice.batchRunning': 'H1Aligner: a batch scan is already running',
    'notice.scanning': 'H1Aligner: scanning {count} notes…',
    'notice.batchDone': 'H1Aligner: batch renamed {done} file(s)',
    'notice.batchChanged': '{count} skipped (changed since preview)',
    'notice.batchFailed': '{count} skipped/failed',
    'notice.invalidPatterns': 'H1Aligner: invalid exclude pattern(s) ignored:\n{patterns}',
    // Commands
    'cmd.renameActive': 'Rename active file from first H1',
    'cmd.batchPreview': 'Preview all renames (dry run)',
    'cmd.undo': 'Undo last rename',
    'cmd.showActivity': 'Show recent activity',
    // Batch modal
    'batch.summary': '{renamable} of {total} note(s) would be renamed.',
    'batch.hint': 'Targets are re-checked at apply time; notes whose H1 changed meanwhile are skipped.',
    'batch.more': '…and {count} more rename(s)',
    'batch.skippedHeader': 'Skipped {count} note(s):',
    'batch.close': 'Close',
    'batch.apply': 'Apply {count} rename(s)',
    // Activity modal
    'activity.title': 'H1Aligner activity (this session)',
    'activity.empty': 'No rename activity this session yet.',
    // Onboarding modal
    'onboard.title': 'H1Aligner — the one-way contract',
    'onboard.body1':
        'This plugin renames files to match their first H1. It is one-way: the H1 is always the source of truth, so a manual filename change that diverges from the H1 will be reverted on the next trigger.',
    'onboard.body2':
        'Date-named daily notes are protected by default, and any note can opt out with "h1aligner-lock: true" in its frontmatter. You can change everything later in Settings.',
    'onboard.keepAuto': 'Keep automatic (on file open)',
    'onboard.manualOnly': 'Start with Manual only',
    // Settings — trigger
    'set.trigger.name': 'Rename trigger',
    'set.trigger.desc':
        'When to rename automatically. "On file open" renames when you switch to a note; "After editing" renames after you pause typing; "Manual only" leaves it to the command.',
    'set.trigger.fileOpen': 'On file open',
    'set.trigger.edit': 'After editing (debounced)',
    'set.trigger.manual': 'Manual only',
    // Settings — scope
    'set.scope.heading': 'Scope',
    'set.ignore.name': 'Ignore folders',
    'set.ignore.desc':
        'Comma-separated folder paths to ignore (prefix match; / means the vault root layer). Default: .obsidian, .trash',
    'set.include.name': 'Include only these folders',
    'set.include.desc':
        'Comma-separated whitelist. When non-empty, ONLY notes inside these folders are renamed. Use / for the vault root layer (root files only). Leave empty to process the whole vault.',
    'set.exclude.name': 'Exclude filename patterns',
    'set.exclude.desc':
        'One regular expression per line, tested against the note name (without .md). Unanchored substring match — use ^ and $ for exact names. Matching notes are not auto-renamed (the manual command still works). The default protects date-named daily notes.',
    'set.lock.name': 'Respect frontmatter lock',
    'set.lock.desc':
        'Skip notes whose frontmatter contains "h1aligner-lock: true". Lets you exempt individual notes.',
    // Settings — naming
    'set.naming.heading': 'Naming',
    'set.template.name': 'Filename template',
    'set.template.desc':
        'Tokens: {{h1}} (the heading — REQUIRED; templates without it are treated as plain {{h1}}), {{date}} (file creation date, YYYY-MM-DD), {{date:FORMAT}} with YYYY/MM/DD/HH/mm/ss. Creation date keeps renames stable. Default: {{h1}}',
    'set.collision.name': 'When the target name is taken',
    'set.collision.desc':
        'Skip leaves the note untouched; Number appends the first free " 1", " 2", …',
    'set.collision.skip': 'Skip (safe default)',
    'set.collision.number': 'Append a number',
    'set.caseOnly.name': 'Allow case-only renames',
    'set.caseOnly.desc':
        'Rename "linker.md" to "Linker.md" when only the capitalisation differs. Turn off to keep the file tree still.',
    'set.alias.name': 'Preserve old name as alias',
    'set.alias.desc':
        'After a rename, append the previous filename to the note\'s frontmatter aliases so the old name still works in the quick switcher. Aliases are not removed on undo.',
    'set.trim.name': 'Trim whitespace',
    'set.trim.desc': 'Strip leading and trailing whitespace from the H1 text.',
    'set.replace.name': 'Replace illegal characters',
    'set.replace.desc':
        'Replace characters that are invalid on Windows (\\ / : * ? " < > |) or break Obsidian links (# ^ [ ]) with the replacement character. Path separators are always replaced.',
    'set.replChar.name': 'Replacement character',
    'set.replChar.desc':
        'Single character used to replace illegal characters (illegal characters themselves are rejected; leave empty to delete instead). Default: single space.',
    'set.maxLen.name': 'Maximum filename length',
    'set.maxLen.desc':
        'Truncate filenames longer than this many characters (1-255; filenames are additionally capped at 255 bytes for filesystem compatibility). Default: 150.',
    'set.preview.name': 'Preview',
    'set.preview.desc':
        "Type a sample H1 to see the filename it would produce with the current settings. Date tokens preview with the current time; real renames use each file's creation time.",
    'set.preview.empty': '→ (empty after sanitising — would be skipped)',
    // Settings — notifications
    'set.notif.heading': 'Notifications',
    'set.notice.name': 'Notice level',
    'set.notice.desc':
        'For automatic renames. Off: silent. Errors only: report failures. All: also announce successful renames. The manual command and batch apply always report.',
    'set.notice.off': 'Off (quiet)',
    'set.notice.errors': 'Errors only',
    'set.notice.all': 'All renames',
    // Settings — advanced
    'set.adv.heading': 'Advanced',
    'set.debounceOpen.name': 'File-open debounce (ms)',
    'set.debounceOpen.desc': 'Wait time after a file-open before renaming. Default: 100.',
    'set.debounceEdit.name': 'Edit debounce (ms)',
    'set.debounceEdit.desc':
        'Typing pause required before an "After editing" rename fires. Keep this generous — renaming mid-typing is disruptive. Default: 2000.',
} as const;

export type LocaleKey = keyof typeof en;

const zhTW: Record<LocaleKey, string> = {
    'notice.renamed': 'H1Aligner：已改名 → {name}',
    'notice.skipped': 'H1Aligner：已跳過（{reason}）',
    'notice.error': 'H1Aligner 錯誤：{message}',
    'notice.nothingToUndo': 'H1Aligner：沒有可復原的改名',
    'notice.undoMoved': 'H1Aligner：無法復原 — 檔案已被移動或刪除',
    'notice.undoOccupied': 'H1Aligner：無法復原 — 原檔名已被占用',
    'notice.undone': 'H1Aligner：已復原 → {path}',
    'notice.undoFailed': 'H1Aligner：復原失敗',
    'notice.batchRunning': 'H1Aligner：批次掃描已在進行中',
    'notice.scanning': 'H1Aligner：掃描 {count} 篇筆記中…',
    'notice.batchDone': 'H1Aligner：批次改名 {done} 個檔案',
    'notice.batchChanged': '{count} 個已跳過（預覽後內容有變動）',
    'notice.batchFailed': '{count} 個跳過/失敗',
    'notice.invalidPatterns': 'H1Aligner：以下無效的排除 pattern 已被忽略：\n{patterns}',
    'cmd.renameActive': 'Rename active file from first H1（依第一個 H1 改名目前檔案）',
    'cmd.batchPreview': 'Preview all renames (dry run)（批次預覽）',
    'cmd.undo': 'Undo last rename（復原上一次改名）',
    'cmd.showActivity': 'Show recent activity（顯示活動紀錄）',
    'batch.summary': '{total} 篇筆記中有 {renamable} 篇會被改名。',
    'batch.hint': '套用時會重新核對目標檔名；預覽後 H1 有變動的筆記會被跳過。',
    'batch.more': '…還有 {count} 筆會被改名',
    'batch.skippedHeader': '跳過 {count} 篇筆記：',
    'batch.close': '關閉',
    'batch.apply': '套用 {count} 筆改名',
    'activity.title': 'H1Aligner 活動紀錄（本次工作階段）',
    'activity.empty': '本次工作階段尚無改名活動。',
    'onboard.title': 'H1Aligner — 單向契約',
    'onboard.body1':
        '此外掛會把檔名改成與第一個 H1 一致。方向是單向的：H1 永遠是唯一事實來源，手動改的檔名若與 H1 不符，下次觸發時會被改回來。',
    'onboard.body2':
        '日期命名的 daily notes 預設受保護；任何筆記都可以在 frontmatter 加上 "h1aligner-lock: true" 排除。之後都可以在設定中調整。',
    'onboard.keepAuto': '保持自動（開檔時改名）',
    'onboard.manualOnly': '先用手動模式',
    'set.trigger.name': '改名觸發時機',
    'set.trigger.desc':
        '自動改名的時機。「開檔時」在切換到筆記時改名；「編輯後」在停止打字後改名；「僅手動」只透過指令改名。',
    'set.trigger.fileOpen': '開檔時',
    'set.trigger.edit': '編輯後（延遲觸發）',
    'set.trigger.manual': '僅手動',
    'set.scope.heading': '套用範圍',
    'set.ignore.name': '忽略資料夾',
    'set.ignore.desc': '逗號分隔的資料夾路徑（前綴比對；/ 代表 vault 根目錄層）。預設：.obsidian, .trash',
    'set.include.name': '僅套用於這些資料夾',
    'set.include.desc':
        '逗號分隔的白名單。填寫後「只有」這些資料夾內的筆記會被改名；輸入 / 代表 vault 根目錄那一層（不含子資料夾）；留空則套用整個 vault。',
    'set.exclude.name': '排除檔名 pattern',
    'set.exclude.desc':
        '每行一條正規表達式，比對筆記名稱（不含 .md）。未錨定的子字串比對 — 精確比對請用 ^ 與 $。符合的筆記不會被自動改名（手動指令仍可用）。預設保護日期命名的 daily notes。',
    'set.lock.name': '尊重 frontmatter 鎖',
    'set.lock.desc': '跳過 frontmatter 含 "h1aligner-lock: true" 的筆記，可逐篇排除。',
    'set.naming.heading': '命名規則',
    'set.template.name': '檔名模板',
    'set.template.desc':
        '可用 token：{{h1}}（標題 — 必填；模板缺少它時整個模板視為 {{h1}}）、{{date}}（檔案建立日期，YYYY-MM-DD）、{{date:格式}} 支援 YYYY/MM/DD/HH/mm/ss。使用建立日期可保持改名穩定。預設：{{h1}}',
    'set.collision.name': '目標檔名已存在時',
    'set.collision.desc': '「跳過」保持原狀；「加序號」附加第一個可用的 " 1"、" 2"、…',
    'set.collision.skip': '跳過（安全預設）',
    'set.collision.number': '加序號',
    'set.caseOnly.name': '允許僅大小寫差異的改名',
    'set.caseOnly.desc':
        '當只有大小寫不同時仍改名（如 "linker.md" → "Linker.md"）。關閉可讓檔案樹保持安定。',
    'set.alias.name': '將舊檔名保留為別名',
    'set.alias.desc':
        '改名後把舊檔名加入筆記 frontmatter 的 aliases，讓舊名稱仍可在快速切換器搜尋到。復原改名時不會移除別名。',
    'set.trim.name': '修剪空白',
    'set.trim.desc': '移除 H1 文字前後的空白。',
    'set.replace.name': '取代非法字元',
    'set.replace.desc':
        '將 Windows 不允許（\\ / : * ? " < > |）或破壞 Obsidian 連結（# ^ [ ]）的字元換成取代字元。路徑分隔符一律取代。',
    'set.replChar.name': '取代字元',
    'set.replChar.desc':
        '取代非法字元用的單一字元（非法字元本身會被拒絕；留空表示直接刪除）。預設：半形空白。',
    'set.maxLen.name': '檔名長度上限',
    'set.maxLen.desc':
        '超過此字數的檔名會被截斷（1-255；另外一律受 255 bytes 的檔案系統上限保護）。預設：150。',
    'set.preview.name': '預覽',
    'set.preview.desc':
        '輸入範例 H1，即時顯示目前設定會產生的檔名。日期 token 以現在時間預覽；實際改名使用各檔案的建立時間。',
    'set.preview.empty': '→（清理後為空 — 將被跳過）',
    'set.notif.heading': '通知',
    'set.notice.name': '通知層級',
    'set.notice.desc':
        '僅影響自動改名。「關閉」完全安靜；「僅錯誤」只回報失敗；「全部」連同成功改名一併通知。手動指令與批次套用一律回報。',
    'set.notice.off': '關閉（安靜）',
    'set.notice.errors': '僅錯誤',
    'set.notice.all': '全部改名',
    'set.adv.heading': '進階',
    'set.debounceOpen.name': '開檔延遲（毫秒）',
    'set.debounceOpen.desc': '開檔後等待多久才改名。預設：100。',
    'set.debounceEdit.name': '編輯延遲（毫秒）',
    'set.debounceEdit.desc':
        '「編輯後」觸發需要的停止打字時間。建議保持寬鬆 — 打字中改名會干擾書寫。預設：2000。',
};

const ja: Record<LocaleKey, string> = {
    'notice.renamed': 'H1Aligner：リネームしました → {name}',
    'notice.skipped': 'H1Aligner：スキップしました（{reason}）',
    'notice.error': 'H1Aligner エラー：{message}',
    'notice.nothingToUndo': 'H1Aligner：取り消せるリネームはありません',
    'notice.undoMoved': 'H1Aligner：取り消せません — ファイルが移動または削除されています',
    'notice.undoOccupied': 'H1Aligner：取り消せません — 元のファイル名は既に使用されています',
    'notice.undone': 'H1Aligner：取り消しました → {path}',
    'notice.undoFailed': 'H1Aligner：取り消しに失敗しました',
    'notice.batchRunning': 'H1Aligner：一括スキャンは既に実行中です',
    'notice.scanning': 'H1Aligner：{count} 件のノートをスキャン中…',
    'notice.batchDone': 'H1Aligner：一括リネーム {done} 件完了',
    'notice.batchChanged': '{count} 件スキップ（プレビュー後に変更あり）',
    'notice.batchFailed': '{count} 件スキップ/失敗',
    'notice.invalidPatterns': 'H1Aligner：無効な除外パターンを無視しました：\n{patterns}',
    'cmd.renameActive': 'Rename active file from first H1（最初の H1 でリネーム）',
    'cmd.batchPreview': 'Preview all renames (dry run)（一括プレビュー）',
    'cmd.undo': 'Undo last rename（直前のリネームを取り消す）',
    'cmd.showActivity': 'Show recent activity（アクティビティを表示）',
    'batch.summary': '{total} 件のノートのうち {renamable} 件がリネーム対象です。',
    'batch.hint': '適用時にリネーム先を再確認します。プレビュー後に H1 が変更されたノートはスキップされます。',
    'batch.more': '…ほか {count} 件がリネーム対象',
    'batch.skippedHeader': '{count} 件のノートをスキップ：',
    'batch.close': '閉じる',
    'batch.apply': '{count} 件のリネームを適用',
    'activity.title': 'H1Aligner アクティビティ（このセッション）',
    'activity.empty': 'このセッションのリネーム記録はまだありません。',
    'onboard.title': 'H1Aligner — 一方向の原則',
    'onboard.body1':
        'このプラグインはファイル名を最初の H1 に合わせてリネームします。方向は一方向のみ：H1 が常に唯一の基準です。H1 と異なる手動リネームは、次のトリガー時に元へ戻されます。',
    'onboard.body2':
        '日付名のデイリーノートはデフォルトで保護されます。個別のノートはフロントマターに「h1aligner-lock: true」を追加すれば除外できます。設定は後からいつでも変更できます。',
    'onboard.keepAuto': '自動のまま使う（ファイルを開いたとき）',
    'onboard.manualOnly': 'まずは手動のみで使う',
    'set.trigger.name': 'リネームのトリガー',
    'set.trigger.desc':
        '自動リネームのタイミング。「ファイルを開いたとき」はノートに切り替えた時、「編集後」は入力が止まった後、「手動のみ」はコマンド実行時のみリネームします。',
    'set.trigger.fileOpen': 'ファイルを開いたとき',
    'set.trigger.edit': '編集後（遅延実行）',
    'set.trigger.manual': '手動のみ',
    'set.scope.heading': '適用範囲',
    'set.ignore.name': '除外フォルダ',
    'set.ignore.desc': 'カンマ区切りのフォルダパス（前方一致。/ はルート階層）。デフォルト：.obsidian, .trash',
    'set.include.name': '対象をこれらのフォルダに限定',
    'set.include.desc':
        'カンマ区切りのホワイトリスト。指定すると、これらのフォルダ内のノート「のみ」リネームされます。/ は保管庫のルート階層（サブフォルダを除く）を意味します。空欄で保管庫全体が対象になります。',
    'set.exclude.name': '除外ファイル名パターン',
    'set.exclude.desc':
        '1 行につき 1 つの正規表現。ノート名（.md を除く）と照合します。アンカーなしの部分一致 — 完全一致には ^ と $ を使ってください。一致したノートは自動リネームされません（手動コマンドは使用可能）。デフォルトは日付名のデイリーノートを保護します。',
    'set.lock.name': 'フロントマターのロックを尊重',
    'set.lock.desc':
        'フロントマターに「h1aligner-lock: true」があるノートをスキップします。ノート単位で除外できます。',
    'set.naming.heading': '命名規則',
    'set.template.name': 'ファイル名テンプレート',
    'set.template.desc':
        'トークン：{{h1}}（見出し — 必須。含まないテンプレートは {{h1}} として扱われます）、{{date}}（ファイル作成日、YYYY-MM-DD）、{{date:書式}} は YYYY/MM/DD/HH/mm/ss に対応。作成日を使うためリネームは安定します。デフォルト：{{h1}}',
    'set.collision.name': 'リネーム先の名前が既にあるとき',
    'set.collision.desc': '「スキップ」は何もしません。「番号を付ける」は空いている " 1"、" 2"… を付加します。',
    'set.collision.skip': 'スキップ（安全なデフォルト）',
    'set.collision.number': '番号を付ける',
    'set.caseOnly.name': '大文字小文字のみの変更を許可',
    'set.caseOnly.desc':
        '大文字小文字だけが異なる場合もリネームします（例：「linker.md」→「Linker.md」）。オフにするとファイルツリーの揺れを防げます。',
    'set.alias.name': '旧ファイル名をエイリアスとして保存',
    'set.alias.desc':
        'リネーム後、旧ファイル名をノートのフロントマター aliases に追加し、クイックスイッチャーで旧名でも検索できるようにします。取り消してもエイリアスは削除されません。',
    'set.trim.name': '空白のトリム',
    'set.trim.desc': 'H1 テキストの前後の空白を除去します。',
    'set.replace.name': '使用できない文字の置換',
    'set.replace.desc':
        'Windows で無効な文字（\\ / : * ? " < > |）や Obsidian のリンクを壊す文字（# ^ [ ]）を置換文字に置き換えます。パス区切り文字は常に置換されます。',
    'set.replChar.name': '置換文字',
    'set.replChar.desc':
        '使用できない文字を置き換える 1 文字（使用できない文字自体は拒否されます。空欄にすると削除になります）。デフォルト：半角スペース。',
    'set.maxLen.name': 'ファイル名の最大長',
    'set.maxLen.desc':
        'この文字数を超えるファイル名を切り詰めます（1-255。さらにファイルシステム互換のため常に 255 バイト上限が適用されます）。デフォルト：150。',
    'set.preview.name': 'プレビュー',
    'set.preview.desc':
        'サンプルの H1 を入力すると、現在の設定で生成されるファイル名を表示します。日付トークンは現在時刻でプレビューされます。実際のリネームでは各ファイルの作成日時を使用します。',
    'set.preview.empty': '→（サニタイズ後に空 — スキップされます）',
    'set.notif.heading': '通知',
    'set.notice.name': '通知レベル',
    'set.notice.desc':
        '自動リネームのみに適用。「オフ」は通知なし。「エラーのみ」は失敗のみ報告。「すべて」は成功したリネームも通知します。手動コマンドと一括適用は常に報告されます。',
    'set.notice.off': 'オフ（静か）',
    'set.notice.errors': 'エラーのみ',
    'set.notice.all': 'すべてのリネーム',
    'set.adv.heading': '詳細設定',
    'set.debounceOpen.name': 'ファイルを開いたときの遅延（ミリ秒）',
    'set.debounceOpen.desc': 'ファイルを開いてからリネームするまでの待ち時間。デフォルト：100。',
    'set.debounceEdit.name': '編集後の遅延（ミリ秒）',
    'set.debounceEdit.desc':
        '「編集後」リネームが実行されるまでに必要な入力停止時間。入力中のリネームは邪魔になるため、余裕を持たせてください。デフォルト：2000。',
};

export const LOCALES = { en, 'zh-tw': zhTW, ja };

/** Obsidian stores its UI language in localStorage 'language' ('' = en). */
export function detectLanguage(): string | null {
    try {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem('language');
        }
    } catch { /* sandboxed environment */ }
    return null;
}

export function resolveLocale(lang: string | null): 'en' | 'zh-tw' | 'ja' {
    const l = lang ? lang.toLowerCase() : '';
    if (l === 'zh-tw') return 'zh-tw';
    if (l === 'ja') return 'ja';
    return 'en';
}

export function t(key: LocaleKey, vars?: Record<string, string | number>): string {
    const table = LOCALES[resolveLocale(detectLanguage())];
    let s: string = table[key] ?? en[key] ?? key;
    if (vars) {
        for (const [k, v] of Object.entries(vars)) {
            s = s.split(`{${k}}`).join(String(v));
        }
    }
    return s;
}
