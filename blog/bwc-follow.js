/* Beer World Cup XI — follow-a-team progressive enhancement.
 *
 * Click a team's row in the standings to follow them. Non-followed matches
 * and standings rows dim; the followed team's journey strip appears below
 * the sticky tab bar.
 *
 * Pure progressive enhancement: every score, verdict, standings cell stays
 * fully visible when JS is off — this script only adds opacity dimming and
 * a journey summary. localStorage persists the chosen team across visits.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'bwc-follow';
  var html = document.documentElement;
  var followBar = null;

  // --- Team name → 3-letter code map (mirror of standings-render.mjs) ---
  var nameToCode = {
    'Mexico': 'MEX', 'South Africa': 'RSA', 'South Korea': 'KOR', 'Czech Republic': 'CZE',
    'Canada': 'CAN', 'Bosnia & Herzegovina': 'BIH', 'Qatar': 'QAT', 'Switzerland': 'SUI',
    'Brazil': 'BRA', 'Morocco': 'MAR', 'Haiti': 'HAI', 'Scotland': 'SCO',
    'USA': 'USA', 'Paraguay': 'PAR', 'Australia': 'AUS', 'Turkey': 'TUR',
    'Germany': 'GER', 'Curaçao': 'CUW', 'Ivory Coast': 'CIV', 'Ecuador': 'ECU',
    'Netherlands': 'NED', 'Japan': 'JPN', 'Sweden': 'SWE', 'Cape Verde': 'CPV',
    'Belgium': 'BEL', 'Iran': 'IRN', 'Senegal': 'SEN', 'Egypt': 'EGY',
    'Spain': 'ESP', 'Saudi Arabia': 'KSA', 'Uruguay': 'URU', 'Tunisia': 'TUN',
    'France': 'FRA', 'New Zealand': 'NZL', 'Uzbekistan': 'UZB', 'Panama': 'PAN',
    'Austria': 'AUT', 'Argentina': 'ARG', 'Algeria': 'ALG', 'DR Congo': 'COD',
    'Portugal': 'POR', 'Colombia': 'COL', 'Ghana': 'GHA', 'Italy': 'ITA',
    'Croatia': 'CRO', 'England': 'ENG', 'Nigeria': 'NGA', 'Norway': 'NOR',
    'Jordan': 'JOR', 'Ukraine': 'UKR', 'Costa Rica': 'CRC', 'Cameroon': 'CMR',
    'Iraq': 'IRQ', 'Mali': 'MLI', 'Wales': 'WAL',
  };
  var codeToName = {};
  Object.keys(nameToCode).forEach(function (n) { codeToName[nameToCode[n]] = n; });
  var codeToFlag = {};

  // --- Annotate matches with data-teams + cache details ---
  // Each .bwc-m gets data-teams="CODE1 CODE2" and the match info goes
  // into matchesByCode[code] = [{day, opp, score, winner, verdict, flag}].
  var matchesByCode = {};

  function teamFromCell(cell) {
    if (!cell) return null;
    var html = cell.innerHTML;
    var m = html.match(/<span class="flag">([^<]+)<\/span>\s*([A-Z]{3})\s*<em>v<\/em>\s*<span class="flag">([^<]+)<\/span>\s*([A-Z]{3})/);
    if (!m) return null;
    return { flagH: m[1], codeH: m[2], flagA: m[3], codeA: m[4] };
  }

  function indexMatches() {
    var matches = document.querySelectorAll('.bwc-m');
    matches.forEach(function (el) {
      var teamsCell = el.querySelector('.bwc-m-teams');
      var info = teamFromCell(teamsCell);
      if (!info) return;
      el.setAttribute('data-teams', info.codeH + ' ' + info.codeA);
      codeToFlag[info.codeH] = info.flagH;
      codeToFlag[info.codeA] = info.flagA;

      // Cache for journey rendering — only played matches with a score.
      var scoreEl = el.querySelector('.bwc-m-score');
      var winnerEl = el.querySelector('.bwc-m-winner');
      var verdictEl = el.querySelector('.bwc-m-verdict');
      if (!scoreEl) return;
      var day = parseInt(el.getAttribute('data-day') || '0', 10);
      var entry = {
        day: day,
        codeH: info.codeH, flagH: info.flagH,
        codeA: info.codeA, flagA: info.flagA,
        score: scoreEl.textContent.trim(),
        winner: winnerEl ? winnerEl.textContent.replace(/^🏆\s*/, '').trim() : null,
        verdict: verdictEl ? verdictEl.textContent.trim() : null,
      };
      (matchesByCode[info.codeH] = matchesByCode[info.codeH] || []).push(entry);
      (matchesByCode[info.codeA] = matchesByCode[info.codeA] || []).push(entry);
    });
  }

  // --- Annotate standings rows with data-team ---
  function indexStandings() {
    var rows = document.querySelectorAll('.bwc-st-row:not(.bwc-st-head)');
    rows.forEach(function (row) {
      var nameEl = row.querySelector('.bwc-st-team');
      if (!nameEl) return;
      var name = nameEl.textContent.trim();
      var code = nameToCode[name];
      if (code) row.setAttribute('data-team', code);
    });
  }

  // --- Render or hide the follow strip ---
  function ensureFollowBar() {
    if (followBar) return followBar;
    followBar = document.createElement('div');
    followBar.className = 'bwc-follow';
    followBar.setAttribute('aria-live', 'polite');
    // Insert just below the sticky stage so it's the first thing under the tabs.
    var stage = document.querySelector('.bwc-stage');
    if (stage && stage.parentNode) {
      stage.parentNode.insertBefore(followBar, stage.nextSibling);
    } else {
      document.body.appendChild(followBar);
    }
    return followBar;
  }

  function renderFollow(code) {
    if (!code) {
      if (followBar) followBar.innerHTML = '';
      return;
    }
    var bar = ensureFollowBar();
    var name = codeToName[code] || code;
    var flag = codeToFlag[code] || '';
    var games = (matchesByCode[code] || []).slice().sort(function (a, b) { return a.day - b.day; });
    var football = games.reduce(function (acc, g) {
      var parts = g.score.split(/[–-]/);
      var hs = parseInt(parts[0], 10), as = parseInt(parts[1], 10);
      var us = g.codeH === code ? hs : as;
      var them = g.codeH === code ? as : hs;
      if (us > them) acc.W += 1;
      else if (us < them) acc.L += 1;
      else acc.D += 1;
      acc.GF += us; acc.GA += them;
      return acc;
    }, { W: 0, D: 0, L: 0, GF: 0, GA: 0 });

    var beerW = 0, beerL = 0;
    games.forEach(function (g) {
      if (!g.winner) return;
      var winUpper = g.winner.toUpperCase();
      var meName = (codeToName[code] || '').toUpperCase();
      if (winUpper === meName) beerW += 1;
      else beerL += 1;
    });

    var summaryParts = [];
    summaryParts.push(games.length + ' played');
    summaryParts.push(football.W + 'W ' + football.D + 'D ' + football.L + 'L');
    summaryParts.push('cellar ' + beerW + '–' + beerL);

    var journeyHtml = games.map(function (g) {
      var oppCode = g.codeH === code ? g.codeA : g.codeH;
      var oppFlag = g.codeH === code ? g.flagA : g.flagH;
      var meWon = g.winner && g.winner.toUpperCase() === (codeToName[code] || '').toUpperCase();
      return '<div class="bwc-follow__game' + (meWon ? ' is-cellar-win' : '') + '">' +
        '<span class="bwc-follow__day">D' + g.day + '</span>' +
        '<span class="bwc-follow__opp"><span class="flag">' + oppFlag + '</span> ' + oppCode + '</span>' +
        '<span class="bwc-follow__score">' + g.score + '</span>' +
        (g.winner ? '<span class="bwc-follow__cellar">' + (meWon ? '🍺' : '·') + '</span>' : '') +
        '</div>';
    }).join('');

    bar.innerHTML =
      '<div class="bwc-follow__inner">' +
        '<div class="bwc-follow__head">' +
          '<span class="flag bwc-follow__flag">' + flag + '</span>' +
          '<div class="bwc-follow__id">' +
            '<strong>' + name.toUpperCase() + '</strong>' +
            '<span class="bwc-follow__summary">' + summaryParts.join(' · ') + '</span>' +
          '</div>' +
          '<button type="button" class="bwc-follow__clear" aria-label="Stop following">Clear</button>' +
        '</div>' +
        (games.length ? '<div class="bwc-follow__journey">' + journeyHtml + '</div>' : '') +
      '</div>';

    bar.querySelector('.bwc-follow__clear').addEventListener('click', function () {
      setFollow(null);
    });
  }

  function setFollow(code) {
    if (code) {
      html.setAttribute('data-follow', code);
      try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* private mode */ }
    } else {
      html.removeAttribute('data-follow');
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    }
    renderFollow(code);
  }

  function wireStandingsClicks() {
    document.addEventListener('click', function (e) {
      var row = e.target.closest && e.target.closest('.bwc-st-row');
      if (!row || row.classList.contains('bwc-st-head')) return;
      var code = row.getAttribute('data-team');
      if (!code) return;
      // Toggle: click the followed team's row again to clear.
      var current = html.getAttribute('data-follow');
      setFollow(current === code ? null : code);
    });
  }

  // --- Boot ---
  function init() {
    indexMatches();
    indexStandings();
    wireStandingsClicks();

    // Mark every standings row as cursor-pointer so users discover they're clickable.
    document.querySelectorAll('.bwc-st-row:not(.bwc-st-head)').forEach(function (row) {
      row.setAttribute('tabindex', '0');
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', 'Follow ' + (row.querySelector('.bwc-st-team') || {}).textContent);
    });

    // Restore from storage.
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (saved) setFollow(saved);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
