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
        // Inline style.display wins over any stylesheet rule, including
        // !important from other origins. Belt-and-braces with [hidden] +
        // [data-active] so style hooks still work.
        panel.style.display = on ? '' : 'none';
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

  /* ------------------------------------------------------ Match-deck pattern
   * Horizontal scroll-snap container with prev/next + dot navigation +
   * "n of N" label. The CSS scroll-snap is what actually drives the swipe
   * behaviour (native, touch-friendly). JS adds:
   *   - prev/next button → scrollTo on the previous/next sibling card
   *   - dot click → scrollTo on the matching card
   *   - IntersectionObserver on each card → updates the active dot + label
   *     when the user scrolls/swipes, so the indicator stays in sync. */
  function wireMatchDeck(container) {
    var track = container.querySelector('.bwc-deck-track');
    var cards = track ? track.querySelectorAll(':scope > .bwc-match') : [];
    if (!track || cards.length <= 1) return;
    var prevBtn = container.querySelector('.bwc-deck-prev');
    var nextBtn = container.querySelector('.bwc-deck-next');
    var dots = container.querySelectorAll('.bwc-deck-dot');
    var label = container.querySelector('.bwc-deck-label');
    var idx = 0;

    function setActive(i) {
      idx = Math.max(0, Math.min(cards.length - 1, i));
      dots.forEach(function (dot, di) {
        var on = di === idx;
        dot.classList.toggle('active', on);
        dot.setAttribute('aria-selected', on ? 'true' : 'false');
        dot.setAttribute('tabindex', on ? '0' : '-1');
      });
      if (label) label.textContent = 'Match ' + (idx + 1) + ' of ' + cards.length;
      if (prevBtn) prevBtn.disabled = idx === 0;
      if (nextBtn) nextBtn.disabled = idx === cards.length - 1;
    }

    function scrollToCard(i) {
      var target = cards[Math.max(0, Math.min(cards.length - 1, i))];
      if (!target) return;
      // Use scrollLeft directly rather than scrollIntoView to avoid the page
      // jumping vertically when the card isn't already in the viewport.
      track.scrollTo({ left: target.offsetLeft - track.offsetLeft, behavior: 'smooth' });
    }

    if (prevBtn) prevBtn.addEventListener('click', function () { scrollToCard(idx - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { scrollToCard(idx + 1); });
    dots.forEach(function (dot, di) {
      dot.addEventListener('click', function () { scrollToCard(di); });
      dot.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); scrollToCard(idx + 1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); scrollToCard(idx - 1); }
      });
    });

    // IntersectionObserver keeps the dot/label in sync with whatever the
    // user is actually viewing — including after a touch swipe, a scrollbar
    // drag, or arrow-key scrolling on the track.
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        // Pick the entry with the largest visible ratio. Native scroll-snap
        // means usually only one card is fully visible, but during a scroll
        // we want the dot to track the most-visible card.
        var best = null;
        entries.forEach(function (e) {
          if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
        });
        if (best && best.intersectionRatio > 0.55) {
          var i = Array.prototype.indexOf.call(cards, best.target);
          if (i >= 0 && i !== idx) setActive(i);
        }
      }, { root: track, threshold: [0.5, 0.75, 1.0] });
      cards.forEach(function (c) { io.observe(c); });
    }

    container.setAttribute('data-js', 'ready');
    setActive(0);
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
        // Inline style.display wins over every stylesheet rule unconditionally.
        // This is what actually drives the visual swap; [hidden], .active and
        // aria-hidden are kept in sync for styling hooks + accessibility.
        card.style.display = on ? '' : 'none';
        card.classList.toggle('active', on);
        card.setAttribute('aria-hidden', on ? 'false' : 'true');
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

  /* --------------------------------------------------- Filterable list/grid
   * Generic — used for Stadium Map venue filter (data-country) AND Fixtures
   * day filter (data-when). The button container reads data-target=".selector"
   * to know which items to filter, and data-attr="country|when" to know which
   * attribute on the items to compare against the button's data-filter. */
  function wireFilter(container) {
    var buttons = container.querySelectorAll('.bwc-filter-btn');
    if (!buttons.length) return;
    var targetSel = container.getAttribute('data-target');
    var attr = container.getAttribute('data-attr') || 'country';
    // Default scope: same container. Fixtures filter uses data-target to
    // reach into the sibling .bwc-fixture-list / individual .bwc-venue cards.
    var scope = targetSel ? document : container;
    var items = targetSel ? scope.querySelectorAll(targetSel) : container.querySelectorAll('.bwc-venue');
    if (!items.length) return;

    function apply(filter) {
      items.forEach(function (item) {
        var match = filter === 'all' || item.getAttribute('data-' + attr) === filter;
        // Inline style.display + [hidden]: same belt-and-braces as wireCycler.
        // Reads as '' (empty string = inherit display) when shown, 'none' when hidden.
        item.style.display = match ? '' : 'none';
        if (match) item.removeAttribute('hidden');
        else       item.setAttribute('hidden', '');
      });
      buttons.forEach(function (b) {
        var on = b.getAttribute('data-filter') === filter;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    buttons.forEach(function (b) {
      b.addEventListener('click', function () { apply(b.getAttribute('data-filter') || 'all'); });
    });
    var startFilter = 'all';
    buttons.forEach(function (b) { if (b.classList.contains('active')) startFilter = b.getAttribute('data-filter') || 'all'; });
    container.setAttribute('data-js', 'ready');
    apply(startFilter);
  }

  // Backwards-compatible alias for the Stadium Map markup that came before
  // this filter was generalised. data-attr defaults to 'country'.
  function wireVenueFilter(container) { return wireFilter(container); }

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

  /* ------------------------------------------------------------------ Slot overlay
     The bracket back-face verdicts truncate to 3 lines to preserve
     uniform cell sizing. Since knockout rounds don't have a wall-chart
     home like the group stage does, we inject a "Read full" chip into
     every played/previewable back face and pop an overlay with the
     full text. Slot markup stays unchanged — this reads from the DOM. */
  function wireSlotOverlay() {
    var overlay = document.getElementById('bwcSlotOverlay');
    if (!overlay) return;
    var matchEl   = overlay.querySelector('[data-overlay-match]');
    var winnerEl  = overlay.querySelector('[data-overlay-winner]');
    var verdictEl = overlay.querySelector('[data-overlay-verdict]');

    function open(slot) {
      var num       = (slot.querySelector('.bwc-slot-num')     || {}).textContent || '';
      var teamsRaw  = (slot.querySelector('.bwc-slot-teams')   || {}).textContent || '';
      var teams     = teamsRaw.replace(/\s+/g, ' ').trim();
      var winner    = (slot.querySelector('.bwc-slot-winner')  || {}).textContent || '';
      var verdictEl2= slot.querySelector('.bwc-slot-verdict') || slot.querySelector('.bwc-slot-preview');
      var verdict   = verdictEl2 ? verdictEl2.textContent : '';

      matchEl.textContent   = num + (teams ? ' · ' + teams : '');
      winnerEl.textContent  = winner || (slot.classList.contains('bwc-slot--previewable') ? 'Preview' : '');
      verdictEl.textContent = verdict;
      overlay.setAttribute('data-open', 'true');
      document.body.style.overflow = 'hidden';
    }
    function close() {
      overlay.setAttribute('data-open', 'false');
      document.body.style.overflow = '';
    }

    /* Inject "Read full ›" chip into every back face + make the whole
       back face clickable as a backup affordance. Any click anywhere on
       the visible verdict opens the modal. preventDefault stops the label
       from toggling the checkbox (flipping the card) — once the user is
       on the back face, there's nothing on the front worth returning to,
       and the modal is what they actually want. */
    var backs = document.querySelectorAll('.bwc-slot--played .bwc-slot-back, .bwc-slot--previewable .bwc-slot-back');
    backs.forEach(function (back) {
      /* Whole back-face click → modal */
      back.addEventListener('click', function (e) {
        e.preventDefault();
        var slot = back.closest('.bwc-slot');
        if (slot) open(slot);
      });

      /* Explicit chip (visible affordance) */
      if (back.querySelector('.bwc-slot-readmore')) return; /* idempotent */
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'bwc-slot-readmore';
      chip.setAttribute('aria-label', 'Read full match report');
      chip.textContent = 'Read full ›';
      chip.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var slot = back.closest('.bwc-slot');
        if (slot) open(slot);
      });
      back.appendChild(chip);
    });

    /* Close bindings — backdrop click, close button, Escape */
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.hasAttribute('data-close')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.getAttribute('data-open') === 'true') close();
    });
  }

  /* ------------------------------------------------------------------ Bootstrap */
  function init() {
    var ranks = [
      { selector: '.bwc-officials-tabs', fn: wireTabs, name: 'officials tabs' },
      { selector: '.bwc-stepper',        fn: wireTabs, name: 'roadmap stepper' },
      { selector: '.bwc-match-cycler',   fn: wireCycler, name: 'match cycler' },
      { selector: '.bwc-match-deck',     fn: wireMatchDeck, name: 'match deck' },
      { selector: '.bwc-venue-filter',   fn: wireVenueFilter, name: 'venue filter' },
      { selector: '.bwc-day-filter',     fn: wireFilter,      name: 'day filter' },
    ];
    ranks.forEach(function (r) {
      document.querySelectorAll(r.selector).forEach(function (el) {
        try { r.fn(el); }
        catch (err) { console.warn('[bwc] init failed for ' + r.name, err); }
      });
    });
    try { wireSlotOverlay(); }
    catch (err) { console.warn('[bwc] slot overlay setup failed', err); }
    try { setupPrintFix(); }
    catch (err) { console.warn('[bwc] print-fix setup failed', err); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
