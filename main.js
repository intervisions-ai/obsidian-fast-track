'use strict';

const obsidian = require('obsidian');

const VIEW_TYPE = 'fasting-timer-view';
const DASH_AUTO_START = '<!-- fast-track:auto-start -->';
const DASH_AUTO_END = '<!-- fast-track:auto-end -->';

const DEFAULT_SETTINGS = {
  milestones: [
    { label: '12h', seconds: 12 * 3600 },
    { label: '18h', seconds: 18 * 3600 },
    { label: '24h', seconds: 24 * 3600 },
    { label: '3d',  seconds: 3  * 86400 },
    { label: '5d',  seconds: 5  * 86400 }
  ],
  customGoalSeconds: null,
  fastingFolder: 'Fasting',
  fastsSubfolder: 'Fasts',
  dashboardFilename: 'Fasting.md',
  dailyNoteFolder: '',
  dailyNoteFormat: 'YYYY-MM-DD',
  dailyNoteHeading: '',
  calloutType: 'fast',
  showPauseButton: false,
  heatmapWeeks: 14,
  hourByDayDays: 14,
  fast: null,
  lastFast: null
};

function pad(n) { return n.toString().padStart(2, '0'); }

function formatHMS(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return { h: pad(h), m: pad(m), s: pad(sec), raw: s };
}

function formatCountdown(remainingSec) {
  const s = Math.max(0, Math.floor(remainingSec));
  if (s >= 86400) {
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    return d + 'd ' + h + 'h';
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return pad(h) + ':' + pad(m) + ':' + pad(sec);
}

function formatDuration(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return d + 'd ' + rh + 'h ' + m + 'm';
  }
  return h + 'h ' + pad(m) + 'm';
}

function formatVerbose(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const totalMin = Math.floor(s / 60);
  const totalHours = Math.floor(totalMin / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const mins = totalMin % 60;
  const parts = [];
  if (days > 0) parts.push(days + (days === 1 ? ' day' : ' days'));
  if (hours > 0 || days > 0) parts.push(hours + (hours === 1 ? ' hour' : ' hours'));
  parts.push(mins + (mins === 1 ? ' min' : ' mins'));
  return parts.join(' ');
}

function formatTimeOfDay(ts) {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return h + ':' + pad(m) + ' ' + ampm;
}

function formatDateLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(today.getTime() - 86400000);
  const sameDay = d.toDateString() === today.toDateString();
  const isYest = d.toDateString() === yest.toDateString();
  if (sameDay) return 'today';
  if (isYest) return 'yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateForFilename(ts, format) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const mo = pad(d.getMonth() + 1);
  const da = pad(d.getDate());
  return format
    .replace(/YYYY/g, y)
    .replace(/MM/g, mo)
    .replace(/DD/g, da);
}

function isoLocal(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

function parseIsoLocal(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime();
}

function toLocalDatetimeInputValue(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function insertAtHeading(content, headingText, block) {
  if (!headingText) {
    const sep = content.endsWith('\n') ? '' : '\n';
    return content + sep + block;
  }
  const lines = content.split('\n');
  const target = headingText.trim().toLowerCase();
  let headingIdx = -1;
  let headingLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (m && m[2].trim().toLowerCase() === target) {
      headingIdx = i;
      headingLevel = m[1].length;
      break;
    }
  }
  if (headingIdx === -1) {
    const sep = content.endsWith('\n') ? '' : '\n';
    return content + sep + block;
  }
  let endIdx = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+/);
    if (m && m[1].length <= headingLevel) {
      endIdx = i;
      break;
    }
  }
  while (endIdx > headingIdx + 1 && lines[endIdx - 1].trim() === '') endIdx--;
  const before = lines.slice(0, endIdx).join('\n');
  const after = lines.slice(endIdx).join('\n');
  const trimmedBlock = block.replace(/^\n+/, '');
  const beforeSep = before.endsWith('\n') ? '' : '\n';
  return before + beforeSep + '\n' + trimmedBlock + (after.length > 0 ? '\n' + after : '');
}

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return { data: {}, body: content };
  const yaml = m[1];
  const data = {};
  yaml.split('\n').forEach(line => {
    const kv = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!kv) return;
    let value = kv[2].trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
    } else if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    } else if (/^-?\d+(\.\d+)?$/.test(value)) {
      value = parseFloat(value);
    }
    data[kv[1]] = value;
  });
  const body = content.slice(m[0].length).replace(/^\n/, '');
  return { data, body };
}

function buildFrontmatter(data) {
  const lines = ['---'];
  Object.keys(data).forEach(key => {
    const v = data[key];
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) {
      lines.push(key + ': [' + v.map(x => '"' + String(x).replace(/"/g, '\\"') + '"').join(', ') + ']');
    } else if (typeof v === 'string' && (v.includes(':') || v.includes('#') || v.includes('"'))) {
      lines.push(key + ': "' + v.replace(/"/g, '\\"') + '"');
    } else {
      lines.push(key + ': ' + v);
    }
  });
  lines.push('---');
  return lines.join('\n');
}

function genFastId() {
  return 'f' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
}

class FastingTimerView extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.tickInterval = null;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Fast Track'; }
  getIcon() { return 'timer'; }

  async onOpen() {
    this.render();
    this.tickInterval = window.setInterval(() => {
      if (this.plugin.settings.fast && !this.plugin.settings.fast.pausedAt) {
        this.updateLiveDisplay();
      }
    }, 1000);
  }

  async onClose() {
    if (this.tickInterval) window.clearInterval(this.tickInterval);
    this.tickInterval = null;
  }

  render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('ft-view-container');
    const wrap = container.createDiv({ cls: 'ft-wrap' });
    const card = wrap.createDiv({ cls: 'ft-card' });
    const fast = this.plugin.settings.fast;
    if (fast) this.renderActiveState(card, fast);
    else this.renderIdleState(card);
  }

  renderHeader(card, stateLabel, stateClass) {
    const head = card.createDiv({ cls: 'ft-head' });
    const row = head.createDiv({ cls: 'ft-state-row' });
    row.createSpan({ cls: 'ft-dot ' + stateClass });
    row.createSpan({ cls: 'ft-state', text: stateLabel });
  }

  renderIdleState(card) {
    this.renderHeader(card, 'at rest', '');
    const empty = card.createDiv({ cls: 'ft-empty' });
    empty.createDiv({ cls: 'ft-empty-time', text: '00:00:00' });
    const lastFast = this.plugin.settings.lastFast;
    const subText = lastFast
      ? '— last fast · ' + formatDuration(lastFast.durationSec) + ', ' + formatDateLabel(lastFast.startedAt) + ' —'
      : '— ready when you are —';
    empty.createDiv({ cls: 'ft-empty-sub', text: subText });

    const controls = card.createDiv({ cls: 'ft-empty-controls' });
    const startBtn = controls.createEl('button', { cls: 'ft-btn is-primary', text: 'begin fast' });
    startBtn.addEventListener('click', () => this.plugin.startFast());
    const customBtn = controls.createEl('button', { cls: 'ft-btn', text: 'custom goal' });
    customBtn.addEventListener('click', () => {
      new CustomGoalModal(this.app, (seconds) => {
        this.plugin.settings.customGoalSeconds = seconds;
        this.plugin.saveSettings();
        this.plugin.startFast();
      }).open();
    });

    const dashBtn = card.createEl('button', { cls: 'ft-link-btn', text: 'open dashboard →' });
    dashBtn.addEventListener('click', () => this.plugin.openDashboard());
  }

  renderActiveState(card, fast) {
    const paused = !!fast.pausedAt;
    const elapsedSec = this.getElapsedSec(fast);
    const milestones = this.getMilestones();
    const anyHit = milestones.some(ms => elapsedSec >= ms.seconds);
    if (anyHit) card.addClass('is-achieved');

    this.renderHeader(card, paused ? 'paused' : 'fasting', paused ? 'is-paused' : 'is-live');

    const row = card.createDiv({ cls: 'ft-row' });
    const dialWrap = row.createDiv({ cls: 'ft-dial' });
    this.renderDial(dialWrap, fast);

    const timeBlock = row.createDiv({ cls: 'ft-time-block' });
    const elapsedEl = timeBlock.createDiv({ cls: 'ft-elapsed' });
    elapsedEl.dataset.role = 'elapsed';

    const sinceEl = timeBlock.createDiv({ cls: 'ft-since is-editable' });
    sinceEl.dataset.role = 'since';
    sinceEl.setAttr('title', 'click to edit start time');
    sinceEl.setText('since ' + formatTimeOfDay(fast.startedAt) + ' ' + formatDateLabel(fast.startedAt));
    sinceEl.addEventListener('click', () => {
      new EditStartTimeModal(this.app, this.plugin, fast).open();
    });

    const sideControls = row.createDiv({ cls: 'ft-side-controls' });
    if (this.plugin.settings.showPauseButton) {
      const pauseBtn = sideControls.createEl('button', { cls: 'ft-btn', text: paused ? 'resume' : 'pause' });
      pauseBtn.addEventListener('click', () => {
        if (paused) this.plugin.resumeFast();
        else this.plugin.pauseFast();
      });
    }
    const endBtn = sideControls.createEl('button', { cls: 'ft-btn is-primary', text: 'end fast' });
    endBtn.addEventListener('click', () => {
      new EndFastModal(this.app, this.plugin, fast).open();
    });

    const mrow = card.createDiv({ cls: 'ft-mrow' });
    mrow.dataset.role = 'milestones';
    this.renderMilestones(mrow, fast);

    const dashBtn = card.createEl('button', { cls: 'ft-link-btn', text: 'open dashboard →' });
    dashBtn.addEventListener('click', () => this.plugin.openDashboard());

    this.updateLiveDisplay();
  }

  renderDial(wrap, fast) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 74 74');
    wrap.appendChild(svg);
    const track = document.createElementNS(svgNS, 'circle');
    track.setAttribute('cx', '37'); track.setAttribute('cy', '37'); track.setAttribute('r', '32');
    track.setAttribute('class', 'ft-dial-track');
    svg.appendChild(track);
    const fill = document.createElementNS(svgNS, 'circle');
    fill.setAttribute('cx', '37'); fill.setAttribute('cy', '37'); fill.setAttribute('r', '32');
    fill.setAttribute('class', 'ft-dial-fill');
    fill.setAttribute('stroke-dasharray', '201');
    fill.setAttribute('stroke-dashoffset', '201');
    fill.dataset.role = 'dial-fill';
    svg.appendChild(fill);
    const label = wrap.createDiv({ cls: 'ft-dial-label' });
    label.dataset.role = 'dial-label';
  }

  renderMilestones(mrow, fast) {
    const milestones = this.getMilestones();
    const elapsedSec = this.getElapsedSec(fast);
    let activeFound = false;
    milestones.forEach((ms) => {
      const cell = mrow.createDiv({ cls: 'ft-m' });
      cell.dataset.seconds = String(ms.seconds);
      cell.dataset.label = ms.label;
      cell.createDiv({ cls: 'ft-m-goal', text: ms.label });
      const count = cell.createDiv({ cls: 'ft-m-count' });
      count.dataset.role = 'm-count';
      if (elapsedSec >= ms.seconds) {
        cell.addClass('is-hit');
        count.setText('✓');
      } else if (!activeFound) {
        cell.addClass('is-active');
        count.setText(formatCountdown(ms.seconds - elapsedSec));
        activeFound = true;
      } else {
        count.setText(formatCountdown(ms.seconds - elapsedSec));
      }
    });
  }

  getMilestones() {
    const base = this.plugin.settings.milestones.slice();
    if (this.plugin.settings.customGoalSeconds) {
      base.push({ label: 'custom', seconds: this.plugin.settings.customGoalSeconds });
    }
    base.sort((a, b) => a.seconds - b.seconds);
    return base;
  }

  getElapsedSec(fast) {
    if (!fast) return 0;
    const now = Date.now();
    if (fast.pausedAt) {
      return Math.floor((fast.pausedAt - fast.startedAt - (fast.totalPausedMs || 0)) / 1000);
    }
    return Math.floor((now - fast.startedAt - (fast.totalPausedMs || 0)) / 1000);
  }

  updateLiveDisplay() {
    const fast = this.plugin.settings.fast;
    if (!fast) return;
    const container = this.containerEl.children[1];
    const elapsedSec = this.getElapsedSec(fast);
    const hms = formatHMS(elapsedSec);
    const elapsedEl = container.querySelector('[data-role="elapsed"]');
    if (elapsedEl) {
      elapsedEl.empty();
      elapsedEl.appendText(hms.h + ':' + hms.m);
      elapsedEl.createSpan({ cls: 'ft-sec' }).setText(':' + hms.s);
    }
    const milestones = this.getMilestones();
    const lastMs = milestones[milestones.length - 1];
    const maxSec = lastMs ? lastMs.seconds : 24 * 3600;
    const pct = Math.min(1, elapsedSec / maxSec);
    const anyHit = milestones.some(ms => elapsedSec >= ms.seconds);

    const card = container.querySelector('.ft-card');
    if (card) {
      if (anyHit) card.addClass('is-achieved');
      else card.removeClass('is-achieved');
    }

    const dialFill = container.querySelector('[data-role="dial-fill"]');
    if (dialFill) dialFill.setAttribute('stroke-dashoffset', String(201 - 201 * pct));
    const dialLabel = container.querySelector('[data-role="dial-label"]');
    if (dialLabel) dialLabel.setText(hms.h + 'h');

    const mrow = container.querySelector('[data-role="milestones"]');
    if (mrow) {
      let activeFound = false;
      mrow.querySelectorAll('.ft-m').forEach((cell) => {
        const sec = parseInt(cell.dataset.seconds, 10);
        const countEl = cell.querySelector('[data-role="m-count"]');
        cell.removeClass('is-hit'); cell.removeClass('is-active');
        if (elapsedSec >= sec) {
          cell.addClass('is-hit');
          if (countEl) countEl.setText('✓');
        } else if (!activeFound) {
          cell.addClass('is-active');
          if (countEl) countEl.setText(formatCountdown(sec - elapsedSec));
          activeFound = true;
        } else {
          if (countEl) countEl.setText(formatCountdown(sec - elapsedSec));
        }
      });
    }
  }
}

class CustomGoalModal extends obsidian.Modal {
  constructor(app, onSubmit) {
    super(app);
    this.onSubmit = onSubmit;
    this.hours = 20;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText('Custom fasting goal');
    const wrap = contentEl.createDiv({ cls: 'ft-modal-content' });
    const row = wrap.createDiv({ cls: 'ft-modal-row' });
    row.createDiv({ cls: 'ft-modal-label', text: 'goal duration in hours' });
    const input = row.createEl('input', { type: 'number', value: '20' });
    input.min = '1'; input.max = '240'; input.step = '0.5';
    input.addEventListener('input', () => { this.hours = parseFloat(input.value) || 0; });
    const actions = wrap.createDiv({ cls: 'ft-modal-actions' });
    actions.createEl('button', { cls: 'ft-btn', text: 'cancel' }).addEventListener('click', () => this.close());
    actions.createEl('button', { cls: 'ft-btn is-primary', text: 'set & begin' }).addEventListener('click', () => {
      if (this.hours > 0) {
        this.onSubmit(Math.round(this.hours * 3600));
        this.close();
      }
    });
  }
  onClose() { this.contentEl.empty(); }
}

class EditStartTimeModal extends obsidian.Modal {
  constructor(app, plugin, fast) {
    super(app);
    this.plugin = plugin;
    this.fast = fast;
    this.newStartTs = fast.startedAt;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText('Edit fast start time');
    const wrap = contentEl.createDiv({ cls: 'ft-modal-content' });
    const row = wrap.createDiv({ cls: 'ft-modal-row' });
    row.createDiv({ cls: 'ft-modal-label', text: 'when did you actually start?' });
    const input = row.createEl('input', { type: 'datetime-local' });
    input.value = toLocalDatetimeInputValue(this.fast.startedAt);
    input.max = toLocalDatetimeInputValue(Date.now());
    input.addEventListener('input', () => {
      const parsed = new Date(input.value);
      if (!isNaN(parsed.getTime())) this.newStartTs = parsed.getTime();
    });

    const quickRow = wrap.createDiv({ cls: 'ft-modal-row' });
    quickRow.createDiv({ cls: 'ft-modal-label', text: 'or jump back' });
    const quickBtns = quickRow.createDiv({ cls: 'ft-quick-row' });
    [1, 2, 4, 8, 12].forEach((h) => {
      const btn = quickBtns.createEl('button', { cls: 'ft-btn', text: '+' + h + 'h ago' });
      btn.addEventListener('click', () => {
        const ts = Date.now() - h * 3600 * 1000;
        this.newStartTs = ts;
        input.value = toLocalDatetimeInputValue(ts);
      });
    });

    const actions = wrap.createDiv({ cls: 'ft-modal-actions' });
    actions.createEl('button', { cls: 'ft-btn', text: 'cancel' }).addEventListener('click', () => this.close());
    actions.createEl('button', { cls: 'ft-btn is-primary', text: 'update' }).addEventListener('click', async () => {
      if (this.newStartTs > Date.now()) {
        new obsidian.Notice('Start time cannot be in the future');
        return;
      }
      await this.plugin.updateFastStart(this.newStartTs);
      this.close();
    });
  }
  onClose() { this.contentEl.empty(); }
}

class EndFastModal extends obsidian.Modal {
  constructor(app, plugin, fast) {
    super(app);
    this.plugin = plugin;
    this.fast = fast;
    this.notes = '';
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    const view = this.plugin.getView();
    const elapsedSec = view ? view.getElapsedSec(this.fast) : 0;
    titleEl.setText('End fast · ' + formatDuration(elapsedSec));
    const wrap = contentEl.createDiv({ cls: 'ft-modal-content' });
    const row = wrap.createDiv({ cls: 'ft-modal-row' });
    row.createDiv({ cls: 'ft-modal-label', text: 'notes (optional)' });
    const textarea = row.createEl('textarea', { placeholder: 'how did it go?' });
    textarea.rows = 3;
    textarea.style.fontFamily = 'var(--font-text)';
    textarea.style.fontSize = '13px';
    textarea.style.padding = '8px 10px';
    textarea.style.border = '1px solid var(--background-modifier-border)';
    textarea.style.borderRadius = 'var(--radius-s, 4px)';
    textarea.style.background = 'var(--background-primary)';
    textarea.style.color = 'var(--text-normal)';
    textarea.style.resize = 'vertical';
    textarea.addEventListener('input', () => { this.notes = textarea.value; });
    const actions = wrap.createDiv({ cls: 'ft-modal-actions' });
    actions.createEl('button', { cls: 'ft-btn', text: 'cancel' }).addEventListener('click', () => this.close());
    actions.createEl('button', { cls: 'ft-btn is-primary', text: 'end & log' }).addEventListener('click', async () => {
      await this.plugin.endFast(this.notes);
      this.close();
    });
  }
  onClose() { this.contentEl.empty(); }
}

class EditFastModal extends obsidian.Modal {
  constructor(app, plugin, fastRecord) {
    super(app);
    this.plugin = plugin;
    this.original = fastRecord;
    this.startTs = fastRecord.startedAt;
    this.endTs = fastRecord.endedAt;
    this.notes = fastRecord.notes || '';
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText('Edit fast');
    const wrap = contentEl.createDiv({ cls: 'ft-modal-content' });

    const sRow = wrap.createDiv({ cls: 'ft-modal-row' });
    sRow.createDiv({ cls: 'ft-modal-label', text: 'start' });
    const sInput = sRow.createEl('input', { type: 'datetime-local' });
    sInput.value = toLocalDatetimeInputValue(this.startTs);
    sInput.addEventListener('input', () => {
      const p = new Date(sInput.value);
      if (!isNaN(p.getTime())) this.startTs = p.getTime();
    });

    const eRow = wrap.createDiv({ cls: 'ft-modal-row' });
    eRow.createDiv({ cls: 'ft-modal-label', text: 'end' });
    const eInput = eRow.createEl('input', { type: 'datetime-local' });
    eInput.value = toLocalDatetimeInputValue(this.endTs);
    eInput.addEventListener('input', () => {
      const p = new Date(eInput.value);
      if (!isNaN(p.getTime())) this.endTs = p.getTime();
    });

    const nRow = wrap.createDiv({ cls: 'ft-modal-row' });
    nRow.createDiv({ cls: 'ft-modal-label', text: 'notes' });
    const ta = nRow.createEl('textarea');
    ta.rows = 3;
    ta.value = this.notes;
    ta.style.padding = '8px 10px';
    ta.style.border = '1px solid var(--background-modifier-border)';
    ta.style.borderRadius = 'var(--radius-s, 4px)';
    ta.style.background = 'var(--background-primary)';
    ta.style.color = 'var(--text-normal)';
    ta.style.fontFamily = 'var(--font-text)';
    ta.style.fontSize = '13px';
    ta.addEventListener('input', () => { this.notes = ta.value; });

    const actions = wrap.createDiv({ cls: 'ft-modal-actions' });
    actions.createEl('button', { cls: 'ft-btn', text: 'cancel' }).addEventListener('click', () => this.close());
    actions.createEl('button', { cls: 'ft-btn is-primary', text: 'save changes' }).addEventListener('click', async () => {
      if (this.endTs <= this.startTs) {
        new obsidian.Notice('End time must be after start time');
        return;
      }
      await this.plugin.editCompletedFast(this.original.id, this.startTs, this.endTs, this.notes);
      this.close();
    });
  }
  onClose() { this.contentEl.empty(); }
}

class ConfirmModal extends obsidian.Modal {
  constructor(app, title, message, onConfirm) {
    super(app);
    this.titleText = title;
    this.message = message;
    this.onConfirm = onConfirm;
  }
  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText(this.titleText);
    const wrap = contentEl.createDiv({ cls: 'ft-modal-content' });
    wrap.createEl('p', { text: this.message, cls: 'ft-modal-message' });
    const actions = wrap.createDiv({ cls: 'ft-modal-actions' });
    actions.createEl('button', { cls: 'ft-btn', text: 'cancel' }).addEventListener('click', () => this.close());
    actions.createEl('button', { cls: 'ft-btn is-danger', text: 'confirm' }).addEventListener('click', async () => {
      await this.onConfirm();
      this.close();
    });
  }
  onClose() { this.contentEl.empty(); }
}

class FastingTimerSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h3', { text: 'Storage' });

    new obsidian.Setting(containerEl)
      .setName('Fasting folder')
      .setDesc('Top-level folder for the dashboard and fast notes.')
      .addText(t => t.setValue(this.plugin.settings.fastingFolder).onChange(async (v) => {
        this.plugin.settings.fastingFolder = v.trim() || 'Fasting';
        await this.plugin.saveSettings();
      }));

    new obsidian.Setting(containerEl)
      .setName('Fast notes subfolder')
      .setDesc('Subfolder inside the fasting folder where individual fast notes live.')
      .addText(t => t.setValue(this.plugin.settings.fastsSubfolder).onChange(async (v) => {
        this.plugin.settings.fastsSubfolder = v.trim() || 'Fasts';
        await this.plugin.saveSettings();
      }));

    new obsidian.Setting(containerEl)
      .setName('Dashboard filename')
      .setDesc('Name of the dashboard note inside the fasting folder.')
      .addText(t => t.setValue(this.plugin.settings.dashboardFilename).onChange(async (v) => {
        const val = v.trim() || 'Fasting.md';
        this.plugin.settings.dashboardFilename = val.endsWith('.md') ? val : val + '.md';
        await this.plugin.saveSettings();
      }));

    containerEl.createEl('h3', { text: 'Daily notes' });

    new obsidian.Setting(containerEl)
      .setName('Daily note folder')
      .setDesc('Folder where daily notes live. Leave blank for vault root.')
      .addText(t => t.setValue(this.plugin.settings.dailyNoteFolder).onChange(async (v) => {
        this.plugin.settings.dailyNoteFolder = v.trim();
        await this.plugin.saveSettings();
      }));

    new obsidian.Setting(containerEl)
      .setName('Daily note filename format')
      .setDesc('Format for daily note filenames. Use YYYY, MM, DD.')
      .addText(t => t.setValue(this.plugin.settings.dailyNoteFormat).onChange(async (v) => {
        this.plugin.settings.dailyNoteFormat = v.trim() || 'YYYY-MM-DD';
        await this.plugin.saveSettings();
      }));

    new obsidian.Setting(containerEl)
      .setName('Insert under heading')
      .setDesc('Heading (without #) to insert the callout under. Blank = append. Missing heading = append.')
      .addText(t => t.setValue(this.plugin.settings.dailyNoteHeading || '').onChange(async (v) => {
        this.plugin.settings.dailyNoteHeading = v.trim();
        await this.plugin.saveSettings();
      }));

    new obsidian.Setting(containerEl)
      .setName('Callout type')
      .setDesc('Callout type used in the daily note.')
      .addText(t => t.setValue(this.plugin.settings.calloutType).onChange(async (v) => {
        this.plugin.settings.calloutType = v.trim() || 'fast';
        await this.plugin.saveSettings();
      }));

    containerEl.createEl('h3', { text: 'Interface' });

    new obsidian.Setting(containerEl)
      .setName('Show pause button')
      .setDesc('Show a pause/resume button in the sidebar.')
      .addToggle(t => t.setValue(this.plugin.settings.showPauseButton).onChange(async (v) => {
        this.plugin.settings.showPauseButton = v;
        await this.plugin.saveSettings();
        const view = this.plugin.getView();
        if (view) view.render();
      }));

    new obsidian.Setting(containerEl)
      .setName('Heatmap weeks')
      .setDesc('Number of recent weeks shown in the dashboard heatmap.')
      .addText(t => t.setValue(String(this.plugin.settings.heatmapWeeks || 14)).onChange(async (v) => {
        const n = parseInt(v, 10);
        if (!isNaN(n) && n > 0 && n <= 104) {
          this.plugin.settings.heatmapWeeks = n;
          await this.plugin.saveSettings();
        }
      }));

    new obsidian.Setting(containerEl)
      .setName('Hour-by-day days')
      .setDesc('Number of recent days shown in the hour-by-day grid.')
      .addText(t => t.setValue(String(this.plugin.settings.hourByDayDays || 14)).onChange(async (v) => {
        const n = parseInt(v, 10);
        if (!isNaN(n) && n > 0 && n <= 90) {
          this.plugin.settings.hourByDayDays = n;
          await this.plugin.saveSettings();
        }
      }));

    containerEl.createEl('h3', { text: 'Maintenance' });

    new obsidian.Setting(containerEl)
      .setName('Rebuild dashboard')
      .setDesc('Re-scan fast notes and regenerate the dashboard charts. Use after manually editing fast frontmatter.')
      .addButton(b => b.setButtonText('Rebuild').onClick(async () => {
        await this.plugin.rebuildDashboard();
        new obsidian.Notice('Dashboard rebuilt');
      }));
  }
}

class FastingTimerPlugin extends obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE, (leaf) => new FastingTimerView(leaf, this));
    this.addRibbonIcon('timer', 'Fast Track', () => this.activateView());
    this.addCommand({ id: 'open-fast-track', name: 'Open Fast Track', callback: () => this.activateView() });
    this.addCommand({
      id: 'toggle-fast-track',
      name: 'Start or end fast',
      callback: () => {
        if (this.settings.fast) {
          new EndFastModal(this.app, this, this.settings.fast).open();
        } else {
          this.startFast();
        }
      }
    });
    this.addCommand({
      id: 'open-fast-dashboard',
      name: 'Open fasting dashboard',
      callback: () => this.openDashboard()
    });
    this.addCommand({
      id: 'rebuild-fast-dashboard',
      name: 'Rebuild fasting dashboard',
      callback: () => this.rebuildDashboard()
    });

    this.addSettingTab(new FastingTimerSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.activateView();
      this.scanHistory().then(() => this.rebuildDashboard());
    });
  }

  async onunload() {}

  async loadSettings() {
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded || {});
    if (!this.settings.milestones || this.settings.milestones.length === 0) {
      this.settings.milestones = DEFAULT_SETTINGS.milestones.slice();
    }
    this.history = [];
  }

  async saveSettings() { await this.saveData(this.settings); }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  getView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    return leaves.length === 0 ? null : leaves[0].view;
  }

  fastsFolderPath() {
    const root = this.settings.fastingFolder.replace(/\/$/, '');
    const sub = this.settings.fastsSubfolder.replace(/^\/|\/$/g, '');
    return sub ? root + '/' + sub : root;
  }

  dashboardPath() {
    const root = this.settings.fastingFolder.replace(/\/$/, '');
    return root + '/' + this.settings.dashboardFilename;
  }

  async ensureFolders() {
    const dirs = [this.settings.fastingFolder.replace(/\/$/, ''), this.fastsFolderPath()];
    for (const d of dirs) {
      if (!d) continue;
      const exists = this.app.vault.getAbstractFileByPath(d);
      if (!exists) {
        try { await this.app.vault.createFolder(d); } catch (e) {}
      }
    }
  }

  async scanHistory() {
    const folder = this.fastsFolderPath();
    const folderObj = this.app.vault.getAbstractFileByPath(folder);
    this.history = [];
    if (!folderObj || !(folderObj instanceof obsidian.TFolder)) return;
    const files = folderObj.children.filter(f => f instanceof obsidian.TFile && f.extension === 'md');
    for (const file of files) {
      try {
        const content = await this.app.vault.read(file);
        const { data } = parseFrontmatter(content);
        if (data['fast-id'] && data['start'] && data['end']) {
          const startedAt = parseIsoLocal(data['start']);
          const endedAt = parseIsoLocal(data['end']);
          if (!startedAt || !endedAt) continue;
          this.history.push({
            id: String(data['fast-id']),
            startedAt: startedAt,
            endedAt: endedAt,
            durationSec: Math.floor((endedAt - startedAt) / 1000),
            milestones: Array.isArray(data['milestones-hit']) ? data['milestones-hit'] : [],
            notes: data['notes'] || '',
            filePath: file.path
          });
        }
      } catch (e) {}
    }
    this.history.sort((a, b) => a.startedAt - b.startedAt);
    if (this.history.length > 0) {
      const last = this.history[this.history.length - 1];
      this.settings.lastFast = {
        startedAt: last.startedAt,
        endedAt: last.endedAt,
        durationSec: last.durationSec
      };
      await this.saveSettings();
    }
  }

  async startFast() {
    this.settings.fast = {
      id: genFastId(),
      startedAt: Date.now(),
      pausedAt: null,
      totalPausedMs: 0
    };
    await this.saveSettings();
    const view = this.getView();
    if (view) view.render();
  }

  async pauseFast() {
    if (!this.settings.fast || this.settings.fast.pausedAt) return;
    this.settings.fast.pausedAt = Date.now();
    await this.saveSettings();
    const v = this.getView(); if (v) v.render();
  }

  async resumeFast() {
    const f = this.settings.fast;
    if (!f || !f.pausedAt) return;
    f.totalPausedMs = (f.totalPausedMs || 0) + (Date.now() - f.pausedAt);
    f.pausedAt = null;
    await this.saveSettings();
    const v = this.getView(); if (v) v.render();
  }

  async updateFastStart(newStartTs) {
    const f = this.settings.fast;
    if (!f) return;
    if (newStartTs > Date.now()) {
      new obsidian.Notice('Start time cannot be in the future');
      return;
    }
    f.startedAt = newStartTs;
    f.totalPausedMs = 0;
    f.pausedAt = null;
    await this.saveSettings();
    new obsidian.Notice('Start time updated');
    const v = this.getView(); if (v) v.render();
  }

  async endFast(notes) {
    const fast = this.settings.fast;
    if (!fast) return;
    const endedAt = fast.pausedAt || Date.now();
    const durationSec = Math.floor((endedAt - fast.startedAt - (fast.totalPausedMs || 0)) / 1000);
    const milestones = this.getMilestonesForLogging();
    const hitLabels = milestones.filter(ms => durationSec >= ms.seconds).map(ms => ms.label);
    const id = fast.id || genFastId();

    await this.ensureFolders();
    await this.writeFastNote(id, fast.startedAt, endedAt, durationSec, hitLabels, notes || '');
    await this.appendCalloutToDailyNote(id, fast.startedAt, endedAt, durationSec, hitLabels, notes || '');

    this.settings.lastFast = { startedAt: fast.startedAt, endedAt: endedAt, durationSec: durationSec };
    this.settings.fast = null;
    this.settings.customGoalSeconds = null;
    await this.saveSettings();

    await this.scanHistory();
    await this.rebuildDashboard();

    const v = this.getView(); if (v) v.render();
  }

  getMilestonesForLogging() {
    const base = this.settings.milestones.slice();
    if (this.settings.customGoalSeconds) {
      base.push({ label: 'custom', seconds: this.settings.customGoalSeconds });
    }
    base.sort((a, b) => a.seconds - b.seconds);
    return base;
  }

  fastNotePath(startedAt, id) {
    const dateStr = formatDateForFilename(startedAt, 'YYYY-MM-DD');
    const fname = dateStr + '-fast-' + id + '.md';
    return this.fastsFolderPath() + '/' + fname;
  }

  async writeFastNote(id, startedAt, endedAt, durationSec, milestones, notes) {
    const path = this.fastNotePath(startedAt, id);
    const fm = buildFrontmatter({
      'fast-id': id,
      'start': isoLocal(startedAt),
      'end': isoLocal(endedAt),
      'duration-sec': durationSec,
      'duration-hr': Math.round(durationSec / 36) / 100,
      'milestones-hit': milestones,
      'notes': notes
    });
    const body = '\n# Fast · ' + formatVerbose(durationSec) + '\n\n' +
      '- start: ' + new Date(startedAt).toLocaleString() + '\n' +
      '- end: ' + new Date(endedAt).toLocaleString() + '\n' +
      '- duration: ' + formatVerbose(durationSec) + '\n' +
      '- milestones: ' + (milestones.length > 0 ? milestones.join(', ') : 'none') + '\n' +
      (notes && notes.trim() ? '\n## notes\n\n' + notes.trim() + '\n' : '');
    const content = fm + '\n' + body;
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing && existing instanceof obsidian.TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(path, content);
    }
  }

  async appendCalloutToDailyNote(id, startedAt, endedAt, durationSec, hitLabels, notes) {
    const settings = this.settings;
    const filename = formatDateForFilename(endedAt, settings.dailyNoteFormat) + '.md';
    const folder = settings.dailyNoteFolder ? settings.dailyNoteFolder.replace(/\/$/, '') + '/' : '';
    const path = folder + filename;

    const block = this.buildCalloutBlock(id, startedAt, endedAt, durationSec, hitLabels, notes);

    let file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      try {
        if (folder) {
          const folderExists = this.app.vault.getAbstractFileByPath(folder.replace(/\/$/, ''));
          if (!folderExists) await this.app.vault.createFolder(folder.replace(/\/$/, ''));
        }
        await this.app.vault.create(path, block.trimStart());
        new obsidian.Notice('Fast logged to ' + filename);
        return;
      } catch (e) {
        new obsidian.Notice('Could not create daily note: ' + e.message);
        return;
      }
    }

    if (file instanceof obsidian.TFile) {
      const existing = await this.app.vault.read(file);
      const heading = (settings.dailyNoteHeading || '').trim();
      const updated = insertAtHeading(existing, heading, block);
      await this.app.vault.modify(file, updated);
      new obsidian.Notice('Fast logged to ' + filename);
    }
  }

  buildCalloutBlock(id, startedAt, endedAt, durationSec, hitLabels, notes) {
    const verbose = formatVerbose(durationSec);
    const startTime = formatTimeOfDay(startedAt);
    const endTime = formatTimeOfDay(endedAt);
    const startDate = new Date(startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const endDate = new Date(endedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const spansDay = new Date(startedAt).toDateString() !== new Date(endedAt).toDateString();
    const milestoneLine = hitLabels.length > 0
      ? '> milestones: ' + hitLabels.map(l => l + ' ✓').join(' · ')
      : '> milestones: none reached';
    const timeLine = spansDay
      ? '> ' + startTime + ' (' + startDate + ') → ' + endTime + ' (' + endDate + ')'
      : '> ' + startTime + ' → ' + endTime;

    const fastNotePath = this.fastNotePath(startedAt, id);
    const linkName = fastNotePath.replace(/\.md$/, '').split('/').pop();

    let block = '\n<!-- fast-track:id=' + id + ' -->\n';
    block += '> [!' + this.settings.calloutType + '] Fast Complete: ' + verbose + '\n';
    block += timeLine + '\n';
    block += milestoneLine + '\n';
    if (notes && notes.trim()) {
      block += '> \n';
      block += notes.trim().split('\n').map(l => '> ' + l).join('\n') + '\n';
    }
    block += '> \n';
    block += '> details: [[' + linkName + ']]\n';
    return block;
  }

  async editCompletedFast(id, newStartTs, newEndTs, newNotes) {
    const entry = this.history.find(h => h.id === id);
    if (!entry) {
      new obsidian.Notice('Fast not found');
      return;
    }
    const oldStartedAt = entry.startedAt;
    const oldEndedAt = entry.endedAt;
    const newDurationSec = Math.floor((newEndTs - newStartTs) / 1000);
    const milestones = this.getMilestonesForLogging();
    const hitLabels = milestones.filter(ms => newDurationSec >= ms.seconds).map(ms => ms.label);

    const oldPath = entry.filePath;
    const newPath = this.fastNotePath(newStartTs, id);
    if (oldPath !== newPath) {
      const oldFile = this.app.vault.getAbstractFileByPath(oldPath);
      if (oldFile && oldFile instanceof obsidian.TFile) {
        await this.app.vault.delete(oldFile);
      }
    }
    await this.writeFastNote(id, newStartTs, newEndTs, newDurationSec, hitLabels, newNotes);

    await this.removeCalloutFromDaily(id, oldEndedAt);
    await this.appendCalloutToDailyNote(id, newStartTs, newEndTs, newDurationSec, hitLabels, newNotes);

    new obsidian.Notice('Fast updated');
    await this.scanHistory();
    await this.rebuildDashboard();
  }

  async deleteCompletedFast(id) {
    const entry = this.history.find(h => h.id === id);
    if (!entry) return;
    const file = this.app.vault.getAbstractFileByPath(entry.filePath);
    if (file && file instanceof obsidian.TFile) {
      await this.app.vault.delete(file);
    }
    await this.removeCalloutFromDaily(id, entry.endedAt);
    await this.scanHistory();
    await this.rebuildDashboard();
    new obsidian.Notice('Fast deleted');
  }

  async removeCalloutFromDaily(id, endedAt) {
    const filename = formatDateForFilename(endedAt, this.settings.dailyNoteFormat) + '.md';
    const folder = this.settings.dailyNoteFolder ? this.settings.dailyNoteFolder.replace(/\/$/, '') + '/' : '';
    const path = folder + filename;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof obsidian.TFile)) return;
    const existing = await this.app.vault.read(file);
    const marker = '<!-- fast-track:id=' + id + ' -->';
    const idx = existing.indexOf(marker);
    if (idx === -1) return;

    const lines = existing.split('\n');
    let startLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(marker)) { startLine = i; break; }
    }
    if (startLine === -1) return;
    let endLine = startLine;
    for (let i = startLine + 1; i < lines.length; i++) {
      if (lines[i].startsWith('>') || lines[i].trim() === '') {
        endLine = i;
      } else {
        break;
      }
    }
    while (endLine + 1 < lines.length && lines[endLine].trim() !== '' && lines[endLine].startsWith('>')) endLine++;
    while (endLine > startLine && lines[endLine].trim() === '') endLine--;

    const newLines = lines.slice(0, startLine).concat(lines.slice(endLine + 1));
    let result = newLines.join('\n');
    result = result.replace(/\n{3,}/g, '\n\n');
    await this.app.vault.modify(file, result);
  }

  async openDashboard() {
    await this.ensureFolders();
    const path = this.dashboardPath();
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      await this.rebuildDashboard();
      file = this.app.vault.getAbstractFileByPath(path);
    }
    if (file && file instanceof obsidian.TFile) {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
    }
  }

  async rebuildDashboard() {
    await this.scanHistory();
    await this.ensureFolders();
    const path = this.dashboardPath();
    const file = this.app.vault.getAbstractFileByPath(path);

    const auto = this.buildDashboardAutoSection();

    let content;
    if (file && file instanceof obsidian.TFile) {
      const existing = await this.app.vault.read(file);
      const startIdx = existing.indexOf(DASH_AUTO_START);
      const endIdx = existing.indexOf(DASH_AUTO_END);
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        content = existing.slice(0, startIdx) + DASH_AUTO_START + '\n' + auto + '\n' + existing.slice(endIdx);
      } else {
        content = existing.trimEnd() + '\n\n' + DASH_AUTO_START + '\n' + auto + '\n' + DASH_AUTO_END + '\n';
      }
      await this.app.vault.modify(file, content);
    } else {
      content = '# Fasting\n\nTrack your intermittent fasting practice. The section below is auto-generated by Fast Track — anything you write outside the markers is preserved on rebuild.\n\n'
        + DASH_AUTO_START + '\n' + auto + '\n' + DASH_AUTO_END + '\n';
      await this.app.vault.create(path, content);
    }
  }

  buildDashboardAutoSection() {
    const stats = this.computeStats();
    let out = '## Summary\n\n';
    out += '| metric | value |\n|---|---|\n';
    out += '| total fasts | ' + stats.total + ' |\n';
    out += '| total fasting time | ' + (stats.totalHours.toFixed(1)) + ' hours |\n';
    out += '| average duration | ' + (stats.avgHours ? stats.avgHours.toFixed(1) + ' hours' : '—') + ' |\n';
    out += '| longest fast | ' + (stats.longestHours ? stats.longestHours.toFixed(1) + ' hours' : '—') + ' |\n';
    out += '| current streak | ' + stats.currentStreak + ' days |\n';
    out += '\n';

    out += '## Heatmap\n\n';
    out += this.buildHeatmapHtml() + '\n\n';

    out += '## Hour-by-day\n\n';
    out += this.buildHourByDayHtml() + '\n\n';

    out += '## Fasts\n\n';
    out += this.buildFastsTable() + '\n';

    return out;
  }

  computeStats() {
    const h = this.history;
    if (h.length === 0) {
      return { total: 0, totalHours: 0, avgHours: 0, longestHours: 0, currentStreak: 0 };
    }
    const totalSec = h.reduce((s, f) => s + f.durationSec, 0);
    const longestSec = Math.max(...h.map(f => f.durationSec));
    const dayKeys = new Set();
    h.forEach(f => {
      const d = new Date(f.endedAt);
      d.setHours(0, 0, 0, 0);
      dayKeys.add(d.getTime());
    });
    let streak = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 365; i++) {
      const t = today.getTime() - i * 86400000;
      if (dayKeys.has(t)) streak++;
      else if (i > 0) break;
    }
    return {
      total: h.length,
      totalHours: totalSec / 3600,
      avgHours: totalSec / 3600 / h.length,
      longestHours: longestSec / 3600,
      currentStreak: streak
    };
  }

  buildHeatmapHtml() {
    const weeks = this.settings.heatmapWeeks || 14;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const firstDay = new Date(startOfWeek);
    firstDay.setDate(startOfWeek.getDate() - (weeks - 1) * 7);

    const dayHours = {};
    this.history.forEach(f => {
      let cur = f.startedAt;
      while (cur < f.endedAt) {
        const d = new Date(cur);
        d.setHours(0, 0, 0, 0);
        const key = d.getTime();
        const nextMid = d.getTime() + 86400000;
        const chunkEnd = Math.min(f.endedAt, nextMid);
        dayHours[key] = (dayHours[key] || 0) + (chunkEnd - cur) / 3600000;
        cur = chunkEnd;
      }
    });

    const intensity = (hours) => {
      if (!hours || hours < 1) return 0;
      if (hours < 6) return 1;
      if (hours < 12) return 2;
      if (hours < 18) return 3;
      if (hours < 24) return 4;
      return 5;
    };

    let html = '<div class="ft-dash-heatmap">\n';
    html += '  <div class="ft-hm-grid">\n';
    for (let w = 0; w < weeks; w++) {
      html += '    <div class="ft-hm-week">\n';
      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(firstDay);
        cellDate.setDate(firstDay.getDate() + w * 7 + d);
        const cellKey = cellDate.getTime();
        const isFuture = cellDate > today;
        const hours = dayHours[cellKey] || 0;
        const level = isFuture ? -1 : intensity(hours);
        const label = cellDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ': ' + hours.toFixed(1) + 'h';
        const cls = isFuture ? 'ft-hm-cell is-future' : 'ft-hm-cell h' + level;
        html += '      <div class="' + cls + '" title="' + label + '"></div>\n';
      }
      html += '    </div>\n';
    }
    html += '  </div>\n';
    html += '  <div class="ft-hm-legend"><span>less</span><div class="ft-hm-cell h0"></div><div class="ft-hm-cell h1"></div><div class="ft-hm-cell h2"></div><div class="ft-hm-cell h3"></div><div class="ft-hm-cell h4"></div><div class="ft-hm-cell h5"></div><span>more</span></div>\n';
    html += '</div>';
    return html;
  }

  buildHourByDayHtml() {
    const days = this.settings.hourByDayDays || 14;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const firstDay = new Date(today);
    firstDay.setDate(today.getDate() - (days - 1));

    const grid = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(firstDay);
      d.setDate(firstDay.getDate() + i);
      grid[d.getTime()] = new Array(24).fill(0);
    }

    this.history.forEach(f => {
      let cur = f.startedAt;
      while (cur < f.endedAt) {
        const d = new Date(cur);
        const hour = d.getHours();
        d.setMinutes(0, 0, 0);
        const cellStart = d.getTime();
        const cellEnd = cellStart + 3600000;
        const dayKey = new Date(d); dayKey.setHours(0, 0, 0, 0);
        const dayK = dayKey.getTime();
        if (grid[dayK]) {
          const overlap = Math.min(f.endedAt, cellEnd) - cur;
          grid[dayK][hour] = Math.min(1, (grid[dayK][hour] || 0) + overlap / 3600000);
        }
        cur = cellEnd;
        if (cur >= f.endedAt) break;
      }
    });

    let html = '<div class="ft-dash-hbd">\n';
    html += '  <div class="ft-hbd-header">\n';
    html += '    <div class="ft-hbd-corner"></div>\n';
    for (let h = 0; h < 24; h++) {
      const lbl = (h % 6 === 0) ? String(h) : '';
      html += '    <div class="ft-hbd-hour">' + lbl + '</div>\n';
    }
    html += '  </div>\n';

    Object.keys(grid).sort((a, b) => +a - +b).forEach(k => {
      const d = new Date(+k);
      const dLabel = (d.getMonth() + 1) + '/' + d.getDate();
      html += '  <div class="ft-hbd-row">\n';
      html += '    <div class="ft-hbd-day">' + dLabel + '</div>\n';
      for (let h = 0; h < 24; h++) {
        const val = grid[+k][h] || 0;
        const filled = val >= 0.5 ? ' is-filled' : (val > 0 ? ' is-partial' : '');
        html += '    <div class="ft-hbd-cell' + filled + '"></div>\n';
      }
      html += '  </div>\n';
    });
    html += '</div>';
    return html;
  }

  buildFastsTable() {
    if (this.history.length === 0) {
      return '_No fasts recorded yet._';
    }
    const rows = this.history.slice().reverse();
    let out = '| start | end | duration | milestones | note |\n';
    out += '|---|---|---|---|---|\n';
    rows.forEach(f => {
      const startD = new Date(f.startedAt);
      const endD = new Date(f.endedAt);
      const startStr = startD.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + formatTimeOfDay(f.startedAt);
      const endStr = endD.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + formatTimeOfDay(f.endedAt);
      const dur = formatDuration(f.durationSec);
      const mile = f.milestones.length > 0 ? f.milestones.join(', ') : '—';
      const noteLink = '[[' + f.filePath.replace(/\.md$/, '').split('/').pop() + '|open]]';
      out += '| ' + startStr + ' | ' + endStr + ' | ' + dur + ' | ' + mile + ' | ' + noteLink + ' |\n';
    });
    return out;
  }
}

module.exports = FastingTimerPlugin;
