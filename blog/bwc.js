/* Beer World Cup XI — progressive-disclosure interactions.
 *
 * No dependencies, no globals. IIFE only. Every component reads its initial
 * state from the markup (aria-selected="true" on the default tab, .active on
 * the default cycler card) so the HTML is the source of truth.
 *
 * Critical: this script ENHANCES; it must not be required for the page to
 * function. Without JS, the CSS leaves every panel visible (see [data-js]
 * rules in bwc.css). Print, PDF and reader modes all behave correctly.
 *
 * Try/catch wraps every component init so a single bad container can't take
 * out the others. */

(function () {
  'use strict';

  /* ------------------------------------------------------------ Tab pattern
   * Shared between Officials tabs and Roadmap stepper. Wires:
   *   - click activates the tab
   *   - ArrowLeft/Right (and Up/Down) navigates between tabs with auto-activation
   *   - Home/End jumps to first/last
   * Each tab MUST have aria-controls pointing at the panel's id.
   * Each panel MUST have id matching the tab's aria-controls. */
  function wireTabs(container) {
    var tabs = container.querySelectorAll('[role="tab"]');
    if (!tabs.length) return;

    var panels = [];
    tabs.forEach(function (tab) {
      var id = tab.getAttribute('aria-controls');
      var panel = id ? container.querySelector('#' + CSS.escape(id)) : null;
      panels.push(panel);
    });

    function activate(idx, focusTab) {
      tabs.forEach(function (tab, i) {
        var on = i === idx;
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.setAttribute('tabindex', on ? '0' : '-1');
      });
      panels.forEach(function (panel, i) {
        if (!panel) return;
        var on = i === idx;
        if (on) {
          panel.removeAttribute('hidden');
          panel.setAttribute('data-active', 'true');
        } else {
          panel.setAttribute('hidden', '');
          panel.setAttribute('data-active', 'false');
        }
      });
      if (focusTab) tabs[idx].focus();
    }

    tabs.forEach(function (tab, idx) {
      tab.addEventListener('click', function () { activate(idx, false); });
      tab.addEventListener('keydown', function (e) {
        var next = null;
        switch (e.key) {
          case 'ArrowRight':
          case 'ArrowDown': next = (idx + 1) % tabs.length; break;
          case 'ArrowLeft':
          case 'ArrowUp':   next = (idx - 1 + tabs.length) % tabs.length; break;
          case 'Home':      next = 0; break;
          case 'End':       next = tabs.length - 1; break;
        }
        if (next !== null) { e.preventDefault(); activate(next, true); }
      });
    });

    // Initial: respect aria-selected="true" in the markup, else first tab.
    var startIdx = 0;
    tabs.forEach(function (tab, i) {
      if (tab.getAttribute('aria-selected') === 'true') startIdx = i;
    });
    container.setAttribute('data-js', 'ready');
    activate(startIdx, false);
  }

  /* ----------------------------------------------------- Match-cycler pattern
   * Cycles through .bwc-match cards inside a .bwc-match-cycler.
   * Controls: prev / next buttons + per-card dots. No auto-rotate.
   * Default card: first one with .active class, else card[0]. */
  function wireCycler(container) {
    var cards = container.querySelectorAll(':scope > .bwc-match');
    if (cards.length <= 1) return; // pointless with 1 card

    var controls = container.querySelector('.bwc-cycler-controls');
    var prevBtn = container.querySelector('.bwc-cycler-prev');
    var nextBtn = container.querySelector('.bwc-cycler-next');
    var dots = container.querySelectorAll('.bwc-cycler-dot');
    var label = container.querySelector('.bwc-cycler-label');

    var idx = 0;
    cards.forEach(function (card, i) { if (card.classList.contains('active')) idx = i; });

    function show(i) {
      idx = (i + cards.length) % cards.length;
      cards.forEach(function (card, ci) {
        var on = ci === idx;
        card.classList.toggle('active', on);
        card.setAttribute('aria-hidden', on ? 'false' : 'true');
        // Native [hidden] attribute — browser UA stylesheet hides these without
        // needing any custom CSS rule. Same pattern as wireTabs(). This is what
        // actually drives the visual swap; .active is just a styling hook.
        if (on) card.removeAttribute('hidden');
        else    card.setAttribute('hidden', '');
      });
      dots.forEach(function (dot, di) {
        var on = di === idx;
        dot.classList.toggle('active', on);
        dot.setAttribute('aria-selected', on ? 'true' : 'false');
        dot.setAttribute('tabindex', on ? '0' : '-1');
      });
      if (label) label.textContent = 'Example ' + (idx + 1) + ' of ' + cards.length;
    }

    if (prevBtn) prevBtn.addEventListener('click', function () { show(idx - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { show(idx + 1); });
    dots.forEach(function (dot, di) {
      dot.addEventListener('click', function () { show(di); });
      dot.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); show(idx + 1); dots[idx].focus(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); show(idx - 1); dots[idx].focus(); }
      });
    });

    container.setAttribute('data-js', 'ready');
    show(idx);
  }

  /* -------------------------------------------------------------- Print fix
   * Native <details> keeps its body display:none when closed, and that
   * persists in print even with @media print overrides in most browsers.
   * Before-print: open every closed details, remember which ones we touched.
   * After-print: close exactly those again. Belt-and-braces matchMedia
   * fallback for browsers that fire only one or the other event. */
  function setupPrintFix() {
    var openedByPrint = [];
    function openAll() {
      openedByPrint = Array.prototype.slice.call(
        document.querySelectorAll('details:not([open])')
      );
      openedByPrint.forEach(function (d) { d.setAttribute('open', ''); });
    }
    function closeRestored() {
      openedByPrint.forEach(function (d) { d.removeAttribute('open'); });
      openedByPrint = [];
    }
    window.addEventListener('beforeprint', openAll);
    window.addEventListener('afterprint', closeRestored);
    if (window.matchMedia) {
      var mql = window.matchMedia('print');
      if (mql && typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', function (e) {
          if (e.matches) openAll(); else closeRestored();
        });
      }
    }
  }

  /* ------------------------------------------------------------------ Bootstrap */
  function init() {
    var ranks = [
      { selector: '.bwc-officials-tabs', fn: wireTabs, name: 'officials tabs' },
      { selector: '.bwc-stepper',        fn: wireTabs, name: 'roadmap stepper' },
      { selector: '.bwc-match-cycler',   fn: wireCycler, name: 'match cycler' },
    ];
    ranks.forEach(function (r) {
      document.querySelectorAll(r.selector).forEach(function (el) {
        try { r.fn(el); }
        catch (err) { console.warn('[bwc] init failed for ' + r.name, err); }
      });
    });
    try { setupPrintFix(); }
    catch (err) { console.warn('[bwc] print-fix setup failed', err); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
