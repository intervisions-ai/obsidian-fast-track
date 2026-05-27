'use strict';

const obsidian = require('obsidian');

const VIEW_TYPE = 'fasting-timer-view';

const DEFAULT_SETTINGS = {
  milestones: [
    { label: '12h', seconds: 12 * 3600 },
    { label: '18h', seconds: 18 * 3600 },
    { label: '24h', seconds: 24 * 3600 },
    { label: '3d',  seconds: 3  * 86400 },
    { label: '5d',  seconds: 5  * 86400 }
  ],
  customGoalSeconds: null,
  dailyNoteFolder: '',
  dailyNoteFormat: 'YYYY-MM-DD',
  dailyNoteHeading: '',
  calloutType: 'fast',
  showPauseButton: false,
  chartCount: 7,
  fastHistory: [],
  fast: null
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

function formatGanttDate(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const mo = pad(d.getMonth() + 1);
  const da = pad(d.getDate());
  const h = pad(d.getHours());
  const m = pad(d.getMinutes());
  return y + '-' + mo + '-' + da + ' ' + h + ':' + m;
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
  while (endIdx > headingIdx + 1 && lines[endIdx - 1].trim() === '') {
    endIdx--;
  }
  const before = lines.slice(0, endIdx).join('\n');
  const after = lines.slice(endIdx).join('\n');
  const trimmedBlock = block.replace(/^\n+/, '');
  const beforeSep = before.endsWith('\n') ? '' : '\n';
  const afterSep = after.length > 0 ? '\n\n' : '';
  return before + beforeSep + '\n' + trimmedBlock + (after.length > 0 ? '\n' + after : '');
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
    if (this.tickInterval) {
      window.clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('ft-view-container');

    const wrap = container.createDiv({ cls: 'ft-wrap' });
    const card = wrap.createDiv({ cls: 'ft-card' });

    const fast = this.plugin.settings.fast;
    if (fast) {
      this.renderActiveState(card, fast);
    } else {
      this.renderIdleState(card);
    }
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

    this.updateLiveDisplay();
  }

  renderDial(wrap, fast) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 74 74');
    wrap.appendChild(svg);

    const track = document.createElementNS(svgNS, 'circle');
    track.setAttribute('cx', '37');
    track.setAttribute('cy', '37');
    track.setAttribute('r', '32');
    track.setAttribute('class', 'ft-dial-track');
    svg.appendChild(track);

    const fill = document.createElementNS(svgNS, 'circle');
    fill.setAttribute('cx', '37');
    fill.setAttribute('cy', '37');
    fill.setAttribute('r', '32');
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

      const goal = cell.createDiv({ cls: 'ft-m-goal', text: ms.label });
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
      const sec = elapsedEl.createSpan({ cls: 'ft-sec' });
      sec.setText(':' + hms.s);
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
    if (dialFill) {
      const offset = 201 - 201 * pct;
      dialFill.setAttribute('stroke-dashoffset', String(offset));
    }

    const dialLabel = container.querySelector('[data-role="dial-label"]');
    if (dialLabel) {
      dialLabel.setText(hms.h + 'h');
    }

    const mrow = container.querySelector('[data-role="milestones"]');
    if (mrow) {
      let activeFound = false;
      const cells = mrow.querySelectorAll('.ft-m');
      cells.forEach((cell) => {
        const sec = parseInt(cell.dataset.seconds, 10);
        const countEl = cell.querySelector('[data-role="m-count"]');
        cell.removeClass('is-hit');
        cell.removeClass('is-active');
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
    input.min = '1';
    input.max = '240';
    input.step = '0.5';
    input.addEventListener('input', () => {
      this.hours = parseFloat(input.value) || 0;
    });

    const actions = wrap.createDiv({ cls: 'ft-modal-actions' });
    const cancel = actions.createEl('button', { cls: 'ft-btn', text: 'cancel' });
    cancel.addEventListener('click', () => this.close());
    const submit = actions.createEl('button', { cls: 'ft-btn is-primary', text: 'set & begin' });
    submit.addEventListener('click', () => {
      if (this.hours > 0) {
        this.onSubmit(Math.round(this.hours * 3600));
        this.close();
      }
    });
  }

  onClose() { this.contentEl.empty(); }
}

function toLocalDatetimeInputValue(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const mo = pad(d.getMonth() + 1);
  const da = pad(d.getDate());
  const h = pad(d.getHours());
  const m = pad(d.getMinutes());
  return y + '-' + mo + '-' + da + 'T' + h + ':' + m;
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
    const quicks = [
      { label: '+1h ago',  hours: 1 },
      { label: '+2h ago',  hours: 2 },
      { label: '+4h ago',  hours: 4 },
      { label: '+8h ago',  hours: 8 },
      { label: '+12h ago', hours: 12 }
    ];
    quicks.forEach((q) => {
      const btn = quickBtns.createEl('button', { cls: 'ft-btn', text: q.label });
      btn.addEventListener('click', () => {
        const ts = Date.now() - q.hours * 3600 * 1000;
        this.newStartTs = ts;
        input.value = toLocalDatetimeInputValue(ts);
      });
    });

    const actions = wrap.createDiv({ cls: 'ft-modal-actions' });
    const cancel = actions.createEl('button', { cls: 'ft-btn', text: 'cancel' });
    cancel.addEventListener('click', () => this.close());
    const submit = actions.createEl('button', { cls: 'ft-btn is-primary', text: 'update' });
    submit.addEventListener('click', async () => {
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
    const cancel = actions.createEl('button', { cls: 'ft-btn', text: 'cancel' });
    cancel.addEventListener('click', () => this.close());
    const confirm = actions.createEl('button', { cls: 'ft-btn is-primary', text: 'end & log' });
    confirm.addEventListener('click', async () => {
      await this.plugin.endFast(this.notes);
      this.close();
    });
  }

  onClose() { this.contentEl.empty(); }
}

class FastingTimerSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new obsidian.Setting(containerEl)
      .setName('Daily note folder')
      .setDesc('Folder where your daily notes live. Leave blank for vault root.')
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
      .setDesc('Heading name (without #) to insert the callout under. Leave blank to append to the end. If the heading is missing, the callout is appended.')
      .addText(t => t.setValue(this.plugin.settings.dailyNoteHeading || '').onChange(async (v) => {
        this.plugin.settings.dailyNoteHeading = v.trim();
        await this.plugin.saveSettings();
      }));

    new obsidian.Setting(containerEl)
      .setName('Callout type')
      .setDesc('The callout block type used when logging. e.g. "fast", "tip", "info".')
      .addText(t => t.setValue(this.plugin.settings.calloutType).onChange(async (v) => {
        this.plugin.settings.calloutType = v.trim() || 'fast';
        await this.plugin.saveSettings();
      }));

    new obsidian.Setting(containerEl)
      .setName('Show pause button')
      .setDesc('Show a pause/resume button next to end fast in the sidebar.')
      .addToggle(t => t.setValue(this.plugin.settings.showPauseButton).onChange(async (v) => {
        this.plugin.settings.showPauseButton = v;
        await this.plugin.saveSettings();
        const view = this.plugin.getView();
        if (view) view.render();
      }));

    new obsidian.Setting(containerEl)
      .setName('Chart history length')
      .setDesc('Number of recent fasts to include in the daily-note chart.')
      .addText(t => t.setValue(String(this.plugin.settings.chartCount || 7)).onChange(async (v) => {
        const n = parseInt(v, 10);
        if (!isNaN(n) && n > 0 && n <= 100) {
          this.plugin.settings.chartCount = n;
          await this.plugin.saveSettings();
        }
      }));
  }
}

class FastingTimerPlugin extends obsidian.Plugin {
  async onload() {
    await this.loadSettings();

    this.registerView(VIEW_TYPE, (leaf) => new FastingTimerView(leaf, this));

    this.addRibbonIcon('timer', 'Fast Track', () => {
      this.activateView();
    });

    this.addCommand({
      id: 'open-fast-track',
      name: 'Open Fast Track',
      callback: () => this.activateView()
    });

    this.addCommand({
      id: 'toggle-fasting-timer',
      name: 'Start or end fast',
      callback: () => {
        if (this.settings.fast) {
          const view = this.getView();
          if (view) {
            new EndFastModal(this.app, this, this.settings.fast).open();
          }
        } else {
          this.startFast();
        }
      }
    });

    this.addSettingTab(new FastingTimerSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.activateView();
    });
  }

  async onunload() { }

  async loadSettings() {
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded || {});
    if (!this.settings.milestones || this.settings.milestones.length === 0) {
      this.settings.milestones = DEFAULT_SETTINGS.milestones.slice();
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

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
    if (leaves.length === 0) return null;
    return leaves[0].view;
  }

  async startFast() {
    this.settings.fast = {
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
    const view = this.getView();
    if (view) view.render();
  }

  async resumeFast() {
    const f = this.settings.fast;
    if (!f || !f.pausedAt) return;
    f.totalPausedMs = (f.totalPausedMs || 0) + (Date.now() - f.pausedAt);
    f.pausedAt = null;
    await this.saveSettings();
    const view = this.getView();
    if (view) view.render();
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
    const view = this.getView();
    if (view) view.render();
  }

  async endFast(notes) {
    const fast = this.settings.fast;
    if (!fast) return;

    const endedAt = fast.pausedAt || Date.now();
    const durationSec = Math.floor((endedAt - fast.startedAt - (fast.totalPausedMs || 0)) / 1000);

    const milestones = this.getMilestonesForLogging();
    const hitLabels = milestones
      .filter(ms => durationSec >= ms.seconds)
      .map(ms => ms.label);

    if (!Array.isArray(this.settings.fastHistory)) this.settings.fastHistory = [];
    this.settings.fastHistory.push({
      startedAt: fast.startedAt,
      endedAt: endedAt,
      durationSec: durationSec
    });
    if (this.settings.fastHistory.length > 100) {
      this.settings.fastHistory = this.settings.fastHistory.slice(-100);
    }

    await this.appendCalloutToDailyNote(fast.startedAt, endedAt, durationSec, hitLabels, notes);

    this.settings.lastFast = {
      startedAt: fast.startedAt,
      endedAt: endedAt,
      durationSec: durationSec
    };
    this.settings.fast = null;
    this.settings.customGoalSeconds = null;
    await this.saveSettings();

    const view = this.getView();
    if (view) view.render();
  }

  getMilestonesForLogging() {
    const base = this.settings.milestones.slice();
    if (this.settings.customGoalSeconds) {
      base.push({ label: 'custom (' + Math.round(this.settings.customGoalSeconds / 360) / 10 + 'h)', seconds: this.settings.customGoalSeconds });
    }
    base.sort((a, b) => a.seconds - b.seconds);
    return base;
  }

  buildMermaidChart() {
    const history = Array.isArray(this.settings.fastHistory) ? this.settings.fastHistory : [];
    if (history.length === 0) return '';
    const n = Math.max(1, this.settings.chartCount || 7);
    const recent = history.slice(-n);

    const segments = [];
    recent.forEach((f, idx) => {
      let segStart = f.startedAt;
      const segEnd = f.endedAt;
      while (segStart < segEnd) {
        const dayStart = new Date(segStart);
        dayStart.setHours(0, 0, 0, 0);
        const nextMidnight = dayStart.getTime() + 86400000;
        const chunkEnd = Math.min(segEnd, nextMidnight);
        segments.push({
          fastIdx: idx,
          dateLabel: formatDateForFilename(segStart, 'MM/DD'),
          start: segStart,
          end: chunkEnd
        });
        segStart = chunkEnd;
      }
    });

    const dayGroups = {};
    segments.forEach(s => {
      if (!dayGroups[s.dateLabel]) dayGroups[s.dateLabel] = [];
      dayGroups[s.dateLabel].push(s);
    });

    let chart = '> ```mermaid\n';
    chart += '> gantt\n';
    chart += '>   title recent fasts\n';
    chart += '>   dateFormat YYYY-MM-DD HH:mm\n';
    chart += '>   axisFormat %H:%M\n';
    Object.keys(dayGroups).forEach(dateLabel => {
      chart += '>   section ' + dateLabel + '\n';
      dayGroups[dateLabel].forEach((seg, i) => {
        const taskName = 'fast ' + (seg.fastIdx + 1);
        chart += '>   ' + taskName + ' :' + formatGanttDate(seg.start) + ', ' + formatGanttDate(seg.end) + '\n';
      });
    });
    chart += '> ```';
    return chart;
  }

  async appendCalloutToDailyNote(startedAt, endedAt, durationSec, hitLabels, notes) {
    const settings = this.settings;
    const filename = formatDateForFilename(endedAt, settings.dailyNoteFormat) + '.md';
    const folder = settings.dailyNoteFolder ? settings.dailyNoteFolder.replace(/\/$/, '') + '/' : '';
    const path = folder + filename;

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

    const chartBlock = this.buildMermaidChart();

    let block = '\n> [!' + settings.calloutType + '] Fast Complete: ' + verbose + '\n';
    block += timeLine + '\n';
    block += milestoneLine + '\n';
    if (notes && notes.trim()) {
      block += '> \n';
      const noteLines = notes.trim().split('\n').map(l => '> ' + l).join('\n');
      block += noteLines + '\n';
    }
    if (chartBlock) {
      block += '> \n';
      block += chartBlock + '\n';
    }

    let file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      try {
        if (folder) {
          const folderExists = this.app.vault.getAbstractFileByPath(folder.replace(/\/$/, ''));
          if (!folderExists) {
            await this.app.vault.createFolder(folder.replace(/\/$/, ''));
          }
        }
        file = await this.app.vault.create(path, block.trimStart());
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
}

module.exports = FastingTimerPlugin;
