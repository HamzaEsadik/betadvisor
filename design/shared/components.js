/* @ds-bundle: {"format":4,"namespace":"BetAdvisor","components":[{"name":"Icon"},{"name":"Button"},{"name":"Chip"},{"name":"StatusPill"},{"name":"EdgeBadge"},{"name":"TeamBadge"},{"name":"FormStrip"},{"name":"ProbabilityBar"},{"name":"SignalCard"},{"name":"SkipRow"},{"name":"LedgerRow"},{"name":"StatTile"},{"name":"BankrollHero"},{"name":"BankrollChart"},{"name":"Banner"},{"name":"TabBar"},{"name":"AppBar"},{"name":"SessionCard"},{"name":"BudgetInput"}]} */
(function () {
  var React = window.React, h = React.createElement;
  var ICONS = {"check":"<path d=\"M20 6 9 17l-5-5\" />","x":"<path d=\"M18 6 6 18\" /> <path d=\"m6 6 12 12\" />","clock":"<circle cx=\"12\" cy=\"12\" r=\"10\" /> <polyline points=\"12 6 12 12 16 14\" />","minus":"<path d=\"M5 12h14\" />","bell":"<path d=\"M10.268 21a2 2 0 0 0 3.464 0\" /> <path d=\"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326\" />","calendar-days":"<path d=\"M8 2v4\" /> <path d=\"M16 2v4\" /> <rect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\" /> <path d=\"M3 10h18\" /> <path d=\"M8 14h.01\" /> <path d=\"M12 14h.01\" /> <path d=\"M16 14h.01\" /> <path d=\"M8 18h.01\" /> <path d=\"M12 18h.01\" /> <path d=\"M16 18h.01\" />","list-ordered":"<path d=\"M10 12h11\" /> <path d=\"M10 18h11\" /> <path d=\"M10 6h11\" /> <path d=\"M4 10h2\" /> <path d=\"M4 6h1v4\" /> <path d=\"M6 18H4c0-1 2-2 2-3s-1-1.5-2-1\" />","chart-line":"<path d=\"M3 3v16a2 2 0 0 0 2 2h16\" /> <path d=\"m19 9-5 5-4-4-3 3\" />","layers":"<path d=\"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z\" /> <path d=\"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12\" /> <path d=\"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17\" />","settings":"<path d=\"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z\" /> <circle cx=\"12\" cy=\"12\" r=\"3\" />","chevron-right":"<path d=\"m9 18 6-6-6-6\" />","chevron-down":"<path d=\"m6 9 6 6 6-6\" />","triangle-alert":"<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\" /> <path d=\"M12 9v4\" /> <path d=\"M12 17h.01\" />","lock":"<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\" /> <path d=\"M7 11V7a5 5 0 0 1 10 0v4\" />","arrow-up":"<path d=\"m5 12 7-7 7 7\" /> <path d=\"M12 19V5\" />","arrow-down":"<path d=\"M12 5v14\" /> <path d=\"m19 12-7 7-7-7\" />","shield-check":"<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\" /> <path d=\"m9 12 2 2 4-4\" />","info":"<circle cx=\"12\" cy=\"12\" r=\"10\" /> <path d=\"M12 16v-4\" /> <path d=\"M12 8h.01\" />","wallet":"<path d=\"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1\" /> <path d=\"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4\" />","rotate-ccw":"<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\" /> <path d=\"M3 3v5h5\" />","trending-up":"<polyline points=\"22 7 13.5 15.5 8.5 10.5 2 17\" /> <polyline points=\"16 7 22 7 22 13\" />","target":"<circle cx=\"12\" cy=\"12\" r=\"10\" /> <circle cx=\"12\" cy=\"12\" r=\"6\" /> <circle cx=\"12\" cy=\"12\" r=\"2\" />"};

  function cx() { var o = []; for (var i = 0; i < arguments.length; i++) { if (arguments[i]) o.push(arguments[i]); } return o.join(' '); }
  function money(n, cur) { cur = cur == null ? '$' : cur; var s = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (n < 0 ? '-' : '') + cur + s; }
  function signed(n, cur) { return (n > 0 ? '+' : '') + money(n, cur); }
  function pct(p, d) { return (p * 100).toFixed(d == null ? 0 : d) + '%'; }
  function code3(name) { return String(name || '?').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase(); }
  var format = { money: money, signed: signed, pct: pct };

  function Icon(p) {
    var s = p.size || 20;
    return h('svg', {
      className: cx('ba-icon', p.className), width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      strokeWidth: p.strokeWidth || 1.75, strokeLinecap: 'round', strokeLinejoin: 'round',
      'aria-hidden': p.label ? undefined : true, role: p.label ? 'img' : undefined, 'aria-label': p.label,
      style: p.style, dangerouslySetInnerHTML: { __html: ICONS[p.name] || '' }
    });
  }

  function Button(p) {
    var v = p.variant || 'primary';
    return h('button', {
      type: 'button', className: cx('ba-btn', 'ba-btn-' + v, p.full && 'ba-btn-full', p.size === 'sm' && 'ba-btn-sm'),
      disabled: p.disabled, onClick: p.onClick
    }, p.icon && h(Icon, { name: p.icon, size: 18 }), h('span', { className: 'body-strong' }, p.children));
  }

  function Chip(p) {
    return h('button', {
      type: 'button', className: cx('ba-chip', p.selected && 'is-selected', 'caption'), 'aria-pressed': !!p.selected, onClick: p.onClick
    }, p.children, p.count != null && h('span', { className: 'ba-chip-count' }, p.count));
  }

  var STATUS = {
    open: { icon: 'clock', label: 'Open' }, won: { icon: 'check', label: 'Won' }, lost: { icon: 'x', label: 'Lost' },
    void: { icon: 'minus', label: 'Void' }, review: { icon: 'triangle-alert', label: 'Review' }
  };
  function StatusPill(p) {
    var s = STATUS[p.status] || STATUS.open;
    return h('span', { className: cx('ba-pill', 'ba-pill-' + p.status, 'caption') }, h(Icon, { name: s.icon, size: 14, strokeWidth: 2 }), p.label || s.label);
  }

  function EdgeBadge(p) {
    return h('span', { className: cx('ba-edge', 'caption') }, h(Icon, { name: 'trending-up', size: 14, strokeWidth: 2 }), '+' + (p.edge * 100).toFixed(1) + '% edge');
  }

  function TeamBadge(p) {
    return h('span', { className: cx('ba-badge', p.size === 'md' && 'ba-badge-md'), 'aria-hidden': true }, p.code || code3(p.name));
  }

  function FormStrip(p) {
    var letters = String(p.form || '').split('');
    return h('span', { className: 'ba-form', role: 'img', 'aria-label': (p.label ? p.label + ' form: ' : 'Form: ') + letters.join(' ') },
      letters.map(function (l, i) { return h('span', { key: i, className: cx('ba-form-dot', 'ba-form-' + l.toLowerCase()) }, l); }));
  }

  function ProbabilityBar(p) {
    function row(label, v, cls) {
      return h('div', { className: 'ba-prob-row' },
        h('span', { className: 'overline ba-over ba-prob-label' }, label),
        h('span', { className: 'ba-track' }, h('span', { className: cx('ba-fill', cls), style: { width: (v * 100) + '%' } })),
        h('span', { className: 'caption ba-num ba-prob-val' }, pct(v)));
    }
    return h('div', { className: cx('ba-prob', p.compact && 'is-compact') }, row('Model', p.model, 'ba-fill-model'), row('Book', p.book, 'ba-fill-book'));
  }

  function SignalCard(p) {
    var sel = p.selection === 'HOME' ? p.home : p.selection === 'AWAY' ? p.away : 'Draw';
    var cur = p.currency;
    return h('article', { className: cx('ba-card', 'ba-signal', p.expired && 'is-expired'), onClick: p.onPress },
      h('div', { className: 'ba-signal-head' },
        h('span', { className: 'caption ba-muted' }, p.league + ' · ' + p.kickoff),
        p.expired ? h('span', { className: 'caption ba-subtle' }, 'Kickoff passed') :
          p.frozen ? h('span', { className: 'ba-frozen caption' }, h(Icon, { name: 'lock', size: 14 }), 'Frozen') :
            h(EdgeBadge, { edge: p.edge })),
      h('div', { className: 'ba-signal-body' },
        h('div', { className: 'ba-signal-teams' },
          h('div', { className: 'ba-team-row' }, h(TeamBadge, { name: p.home, code: p.homeCode }), h('span', { className: 'headline' }, p.home)),
          h('div', { className: 'ba-team-row' }, h(TeamBadge, { name: p.away, code: p.awayCode }), h('span', { className: 'headline' }, p.away))),
        h('div', { className: 'ba-signal-pick' },
          h('span', { className: 'overline ba-over ba-subtle' }, 'Pick'),
          h('span', { className: 'body-strong' }, sel),
          h('span', { className: 'odds ba-num' }, p.odds.toFixed(2)))),
      h('div', { className: 'ba-signal-foot' },
        h('div', { className: 'ba-stake' },
          h('span', { className: 'overline ba-over ba-subtle' }, 'Stake'),
          h('span', { className: 'odds ba-num ba-brandink' }, money(p.stake, cur))),
        h(ProbabilityBar, { model: p.model, book: p.implied, compact: true })));
  }

  function SkipRow(p) {
    return h('div', { className: 'ba-skip' },
      h('div', { className: 'ba-skip-main' },
        h('span', { className: 'body-strong' }, p.home + ' v ' + p.away),
        h('span', { className: 'caption ba-muted' }, p.league + ' · ' + p.kickoff)),
      h('span', { className: 'ba-pill ba-pill-void caption' }, p.reason),
      p.onPress && h(Icon, { name: 'chevron-right', size: 18, className: 'ba-subtle' }));
  }

  function LedgerRow(p) {
    var profit = p.profit, cur = p.currency;
    var tone = p.status === 'won' ? 'win' : p.status === 'lost' ? 'loss' : 'flat';
    var arrow = tone === 'win' ? 'arrow-up' : tone === 'lost' || tone === 'loss' ? 'arrow-down' : 'minus';
    return h('div', { className: 'ba-ledger' },
      h('div', { className: 'ba-ledger-main' },
        h('span', { className: 'body-strong' }, p.home + ' v ' + p.away),
        h('span', { className: 'caption ba-muted' }, p.date + ' · ' + p.selection + ' @ ' + p.odds.toFixed(2) + ' · stake ' + money(p.stake, cur)),
        h('span', { className: 'ba-ledger-status' }, h(StatusPill, { status: p.status }), p.frozen !== false && h(Icon, { name: 'lock', size: 14, className: 'ba-subtle', label: 'Frozen' }))),
      h('div', { className: 'ba-ledger-nums' },
        profit == null ? h('span', { className: 'odds ba-num ba-muted' }, '—') :
          h('span', { className: cx('odds', 'ba-num', 'ba-tone-' + tone) }, h(Icon, { name: arrow, size: 16, strokeWidth: 2.25 }), signed(profit, cur)),
        h('span', { className: 'caption ba-num ba-subtle' }, 'Bankroll ' + money(p.bankroll, cur))));
  }

  function StatTile(p) {
    return h('div', { className: 'ba-tile' },
      h('span', { className: 'overline ba-over ba-subtle' }, p.label),
      h('span', { className: cx('stat', 'ba-num', p.tone && 'ba-tone-' + p.tone) }, p.tone === 'win' && h(Icon, { name: 'arrow-up', size: 18, strokeWidth: 2.25 }), p.tone === 'loss' && h(Icon, { name: 'arrow-down', size: 18, strokeWidth: 2.25 }), p.value),
      p.hint && h('span', { className: 'caption ba-muted' }, p.hint));
  }

  function BankrollHero(p) {
    var up = p.profit >= 0, cur = p.currency;
    return h('section', { className: 'ba-hero' },
      h('span', { className: 'overline ba-over ba-hero-label' }, p.label || 'Bankroll'),
      h('span', { className: 'bankroll-xl ba-num' }, money(p.bankroll, cur)),
      h('div', { className: 'ba-hero-row' },
        h('span', { className: cx('ba-hero-delta', 'caption', up ? 'ba-tone-win' : 'ba-tone-loss') }, h(Icon, { name: up ? 'arrow-up' : 'arrow-down', size: 14, strokeWidth: 2.25 }), signed(p.profit, cur) + ' (' + (p.profit >= 0 ? '+' : '') + (p.profitPct * 100).toFixed(1) + '%)'),
        h('span', { className: 'caption ba-hero-meta' }, p.openBets + ' open · started with ' + money(p.start, cur))));
  }

  function maxDrawdown(pts) {
    var peak = 0, best = { depth: 0, from: 0, to: 0 };
    for (var i = 0; i < pts.length; i++) {
      if (pts[i] > pts[peak]) peak = i;
      var d = pts[peak] - pts[i];
      if (d > best.depth) best = { depth: d, from: peak, to: i };
    }
    return best;
  }
  function BankrollChart(p) {
    var pts = p.points, W = 320, H = p.height || 150, padL = 8, padR = 8, padT = 12, padB = 18;
    var lo = Math.min.apply(null, pts.concat(p.start)), hi = Math.max.apply(null, pts.concat(p.start));
    var span = (hi - lo) || 1; lo -= span * 0.12; hi += span * 0.12;
    function x(i) { return padL + (W - padL - padR) * (pts.length === 1 ? 0.5 : i / (pts.length - 1)); }
    function y(v) { return padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo)); }
    var line = pts.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
    var area = line + ' L' + x(pts.length - 1).toFixed(1) + ' ' + (H - padB) + ' L' + x(0).toFixed(1) + ' ' + (H - padB) + ' Z';
    var dd = maxDrawdown(pts);
    return h('svg', { className: 'ba-chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Bankroll curve, from ' + money(pts[0], p.currency) + ' to ' + money(pts[pts.length - 1], p.currency) },
      dd.depth > 0 && h('rect', { className: 'ba-chart-dd', x: x(dd.from), y: padT, width: Math.max(x(dd.to) - x(dd.from), 2), height: H - padT - padB }),
      h('path', { className: 'ba-chart-area', d: area }),
      h('line', { className: 'ba-chart-base', x1: padL, x2: W - padR, y1: y(p.start), y2: y(p.start) }),
      h('path', { className: 'ba-chart-line', d: line }),
      h('circle', { className: 'ba-chart-dot', cx: x(pts.length - 1), cy: y(pts[pts.length - 1]), r: 4 }),
      h('text', { className: 'ba-chart-label', x: padL, y: H - 3 }, p.startLabel || 'Start'),
      h('text', { className: 'ba-chart-label', x: W - padR, y: H - 3, textAnchor: 'end' }, p.endLabel || 'Today'));
  }

  function Banner(p) {
    var tone = p.tone || 'info';
    return h('div', { className: cx('ba-banner', 'ba-banner-' + tone), role: tone === 'warn' ? 'alert' : 'status' },
      h(Icon, { name: tone === 'warn' ? 'triangle-alert' : 'info', size: 20 }),
      h('div', { className: 'ba-banner-text' }, p.title && h('span', { className: 'body-strong' }, p.title), h('span', { className: 'caption' }, p.children)),
      p.action && h('button', { type: 'button', className: 'ba-banner-action body-strong', onClick: p.onAction }, p.action));
  }

  function TabBar(p) {
    return h('nav', { className: 'ba-tabbar', 'aria-label': 'Main' },
      p.items.map(function (it) {
        var on = it.key === p.active;
        return h('button', { key: it.key, type: 'button', className: cx('ba-tab', on && 'is-active'), 'aria-current': on ? 'page' : undefined, onClick: function () { p.onChange && p.onChange(it.key); } },
          h('span', { className: 'ba-tab-marker' }), h(Icon, { name: it.icon, size: 22 }), h('span', { className: 'caption' }, it.label));
      }));
  }

  function AppBar(p) {
    return h('header', { className: 'ba-appbar' },
      p.onBack ? h('button', { type: 'button', className: 'ba-iconbtn', 'aria-label': 'Back', onClick: p.onBack }, h(Icon, { name: 'chevron-right', size: 22, style: { transform: 'rotate(180deg)' } })) : null,
      h('div', { className: 'ba-appbar-title' }, h('span', { className: p.large ? 'title-lg' : 'title-md' }, p.title), p.subtitle && h('span', { className: 'caption ba-muted' }, p.subtitle)),
      h('div', { className: 'ba-appbar-actions' }, (p.actions || []).map(function (a) {
        return h('button', { key: a.icon, type: 'button', className: 'ba-iconbtn', 'aria-label': a.label, onClick: a.onClick }, h(Icon, { name: a.icon, size: 22 }));
      })));
  }

  function SessionCard(p) {
    var active = p.status === 'active', cur = p.currency, profit = p.finalBankroll - p.startBudget;
    var roi = p.roi;
    return h('article', { className: cx('ba-card', 'ba-session', active && 'is-active') },
      h('div', { className: 'ba-session-head' },
        h('div', { className: 'ba-session-title' }, h('span', { className: 'headline' }, p.title), h('span', { className: 'caption ba-muted' }, p.dates)),
        active ? h('span', { className: 'ba-pill ba-pill-open caption' }, h(Icon, { name: 'clock', size: 14, strokeWidth: 2 }), 'Active') : h('span', { className: 'ba-pill ba-pill-void caption' }, 'Closed')),
      h('div', { className: 'ba-session-stats' },
        h('div', null, h('span', { className: 'overline ba-over ba-subtle' }, 'Start'), h('span', { className: 'odds ba-num' }, money(p.startBudget, cur))),
        h('div', null, h('span', { className: 'overline ba-over ba-subtle' }, active ? 'Bankroll' : 'Final'), h('span', { className: 'odds ba-num' }, money(p.finalBankroll, cur))),
        h('div', null, h('span', { className: 'overline ba-over ba-subtle' }, 'ROI'),
          h('span', { className: cx('odds', 'ba-num', 'ba-tone-' + (roi >= 0 ? 'win' : 'loss')) }, h(Icon, { name: roi >= 0 ? 'arrow-up' : 'arrow-down', size: 16, strokeWidth: 2.25 }), (roi >= 0 ? '+' : '') + (roi * 100).toFixed(1) + '%')),
        h('div', null, h('span', { className: 'overline ba-over ba-subtle' }, 'Bets'), h('span', { className: 'odds ba-num' }, p.bets))),
      active && p.onReset && h(Button, { variant: 'secondary', icon: 'rotate-ccw', full: true, onClick: p.onReset }, 'Reset budget'));
  }

  function BudgetInput(p) {
    var err = p.error;
    return h('div', { className: 'ba-budget' },
      h('label', { className: 'overline ba-over ba-subtle', htmlFor: 'ba-budget-input' }, p.label || 'Starting budget'),
      h('div', { className: cx('ba-budget-field', err && 'has-error') },
        h('span', { className: 'title-lg ba-muted' }, p.currency == null ? '$' : p.currency),
        h('input', { id: 'ba-budget-input', className: 'bankroll-xl ba-num', inputMode: 'decimal', value: p.value, onChange: function (e) { p.onChange && p.onChange(e.target.value); }, 'aria-invalid': !!err })),
      err ? h('span', { className: 'caption ba-tone-loss ba-err' }, h(Icon, { name: 'x', size: 14, strokeWidth: 2.25 }), err) : h('span', { className: 'caption ba-muted' }, p.hint || 'Between 10 and 1,000,000. Virtual money only.'),
      p.presets && h('div', { className: 'ba-presets' }, p.presets.map(function (v) { return h(Chip, { key: v, onClick: function () { p.onChange && p.onChange(String(v)); } }, money(v, p.currency)); })));
  }

  window.BetAdvisor = { Icon: Icon, Button: Button, Chip: Chip, StatusPill: StatusPill, EdgeBadge: EdgeBadge, TeamBadge: TeamBadge, FormStrip: FormStrip, ProbabilityBar: ProbabilityBar, SignalCard: SignalCard, SkipRow: SkipRow, LedgerRow: LedgerRow, StatTile: StatTile, BankrollHero: BankrollHero, BankrollChart: BankrollChart, Banner: Banner, TabBar: TabBar, AppBar: AppBar, SessionCard: SessionCard, BudgetInput: BudgetInput, format: format };
})();
