// @the_solvers — shared engine utilities

/* ---------------------------------------------------------
   TEXT FORMATTER
   Cleans up raw question strings so they never render as one
   giant unbroken line, and renders "match the following /
   List I - List II" style questions as a proper two-column
   table instead of inline text.
---------------------------------------------------------- */
const TextFmt = (() => {

  function escapeHtml(s){
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // Try to detect & extract a "match the following" style table.
  // Returns {pre, table:[[left,right],...], headers:[l,r], post} or null
  function extractMatchTable(raw){
    let text = raw;

    // Pattern A: "List I (..) List II (..) 1. x P. y 2. ..." or "Column A.. Column B.."
    let headerMatch = text.match(/(List[\s-]*I\b[^]*?)(List[\s-]*II\b)|(Column\s*A\b[^]*?)(Column\s*B\b)/i);
    let leftHeader = 'List I', rightHeader = 'List II';
    let bodyStart = -1;

    let hIdx = text.search(/List[\s-]*I\b(?!I)/i);
    let h2Idx = text.search(/List[\s-]*II\b/i);
    let cAIdx = text.search(/Column[\s-]*A\b/i);
    let cBIdx = text.search(/Column[\s-]*B\b/i);

    let pre = text, rest = '';
    if (hIdx > -1 && h2Idx > -1){
      // find where list II label ends (after the word + optional parenthetical)
      let afterH2 = text.slice(h2Idx);
      let m = afterH2.match(/^List[\s-]*II\b\s*(\([^)]*\))?\s*/i);
      let cut = h2Idx + (m ? m[0].length : 5);
      pre = text.slice(0, hIdx).trim();
      rest = text.slice(cut).trim();
      leftHeader = 'List I'; rightHeader = 'List II';
    } else if (cAIdx > -1 && cBIdx > -1){
      let afterCB = text.slice(cBIdx);
      let m = afterCB.match(/^Column[\s-]*B\b\s*(\([^)]*\))?\s*/i);
      let cut = cBIdx + (m ? m[0].length : 8);
      pre = text.slice(0, cAIdx).trim();
      rest = text.slice(cut).trim();
      let lh = text.slice(hIdx > -1 ? hIdx : cAIdx, cAIdx).match(/Column\s*A\s*\(([^)]+)\)/i);
      let rhText = text.slice(cAIdx, cBIdx);
      let lhm = rhText.match(/Column\s*A\s*\(([^)]+)\)/i);
      let rhm = afterCB.match(/^Column[\s-]*B\s*\(([^)]+)\)/i);
      leftHeader = lhm ? lhm[1] : 'Column A';
      rightHeader = rhm ? rhm[1] : 'Column B';
    } else {
      return null;
    }

    if (!rest) return null;

    // tokenize rest into items: split right before a "Letter." or "Number." marker
    let tokens = rest.split(/(?=(?:[A-Z]|[0-9]+)\.\s)/).map(t => t.trim()).filter(Boolean);
    if (tokens.length < 4) return null;

    let leftItems = [], rightItems = [];
    let leftIsNumeric = null;
    tokens.forEach(tok => {
      let m = tok.match(/^([A-Z]|[0-9]+)\.\s*(.+)$/s);
      if (!m) return;
      let marker = m[1], val = m[2].trim();
      let isNumeric = /^[0-9]+$/.test(marker);
      if (leftIsNumeric === null) leftIsNumeric = isNumeric; // first marker type defines List I
      if (isNumeric === leftIsNumeric) {
        leftItems.push([marker, val]);
      } else {
        rightItems.push([marker, val]);
      }
    });

    // sometimes both lists use letters (A../P..) — detect via case or order
    if (rightItems.length === 0 && leftItems.length >= 4) {
      // split leftItems in half as fallback
      let half = Math.ceil(leftItems.length/2);
      rightItems = leftItems.slice(half);
      leftItems = leftItems.slice(0, half);
    }

    if (leftItems.length === 0 || rightItems.length === 0) return null;

    let rows = [];
    let n = Math.max(leftItems.length, rightItems.length);
    for (let i=0;i<n;i++){
      rows.push([
        leftItems[i] ? (leftItems[i][0] + '. ' + leftItems[i][1]) : '',
        rightItems[i] ? (rightItems[i][0] + '. ' + rightItems[i][1]) : ''
      ]);
    }

    return { pre, rows, leftHeader, rightHeader };
  }

  // Insert sensible line breaks into plain (non-table) question text:
  // before numbered/lettered list markers, after statement-ending colons,
  // and around "Assertion / Reason" style blocks.
  function softBreak(raw){
    let t = raw;

    // normalize whitespace but keep existing explicit newlines
    t = t.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();

    // break before "1." "2." etc when used as a statement list (3+ occurrences)
    let numMarkers = (t.match(/(?:^|\s)([0-9]{1,2})\.\s(?=[A-Z(])/g) || []).length;
    if (numMarkers >= 2) {
      t = t.replace(/\s(?=[0-9]{1,2}\.\s[A-Z(])/g, '\n');
    }

    // break before lettered statement markers like " A. " " B. " when 3+ occur
    let letterMarkers = (t.match(/(?:^|\s)([A-Z])\.\s(?=[A-Z(])/g) || []).length;
    if (letterMarkers >= 3) {
      t = t.replace(/\s(?=[A-Z]\.\s[A-Z(])/g, '\n');
    }

    // break before roman numeral statement markers "(i)" "(ii)" "I." "II."
    t = t.replace(/\s(?=\((?:i{1,3}|iv|v|vi{0,3})\)\s)/gi, '\n');

    // break after a colon that introduces a list/explanation, if followed by more text
    t = t.replace(/:\s+(?=[A-Z0-9(])/g, ':\n');

    // break before "Assertion" / "Reason" labels
    t = t.replace(/\s(?=Assertion\s*\(A\)|Reason\s*\(R\))/gi, '\n');

    // collapse accidental multi-blank-lines
    t = t.replace(/\n{3,}/g, '\n\n');

    return t.trim();
  }

  function renderQuestion(raw){
    const match = extractMatchTable(raw);
    if (match){
      let pre = softBreak(match.pre);
      let html = `<div>${escapeHtml(pre)}</div>`;
      html += `<table class="match-table"><thead><tr><th>${escapeHtml(match.leftHeader)}</th><th>${escapeHtml(match.rightHeader)}</th></tr></thead><tbody>`;
      match.rows.forEach(r => {
        html += `<tr><td>${escapeHtml(r[0])}</td><td>${escapeHtml(r[1])}</td></tr>`;
      });
      html += `</tbody></table>`;
      return html;
    }
    return escapeHtml(softBreak(raw)).replace(/\n/g, '<br>');
  }

  function renderPlain(raw){
    return escapeHtml(softBreak(raw)).replace(/\n/g, '<br>');
  }

  return { renderQuestion, renderPlain, escapeHtml };
})();

/* ---------------------------------------------------------
   STORAGE — attempts are saved per subject+set so a learner
   can resume / review later.
---------------------------------------------------------- */
const Store = (() => {
  const KEY = 'solvers_attempts_v1';

  function all(){
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch(e){ return {}; }
  }
  function saveAll(obj){
    localStorage.setItem(KEY, JSON.stringify(obj));
  }
  function attemptId(subjectKey, setIdx){
    return subjectKey + '::set' + setIdx;
  }
  function get(subjectKey, setIdx){
    return all()[attemptId(subjectKey, setIdx)] || null;
  }
  function save(subjectKey, setIdx, attempt){
    const a = all();
    a[attemptId(subjectKey, setIdx)] = attempt;
    saveAll(a);
  }
  function remove(subjectKey, setIdx){
    const a = all();
    delete a[attemptId(subjectKey, setIdx)];
    saveAll(a);
  }
  function subjectStats(subjectKey, totalSets){
    const a = all();
    let completed = 0, inProgress = 0;
    for (let i=0;i<totalSets;i++){
      const at = a[attemptId(subjectKey,i)];
      if (at && at.status === 'completed') completed++;
      else if (at && at.status === 'in-progress') inProgress++;
    }
    return { completed, inProgress };
  }
  return { get, save, remove, subjectStats, attemptId };
})();
