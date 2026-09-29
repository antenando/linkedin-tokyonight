// paste into the DevTools console on a signed-in LinkedIn page. It downloads
// a report: light elements (searching shadow roots and
// same-origin iframes) and the page's colour custom properties, which
// linkedin-tokyonight-gen.py reads with --dump
(() => {
  const nums = c => (c.match(/[\d.]+/g) || []).map(Number);
  const lum = c => { const [r, g, b, a = 1] = nums(c); return a < 0.5 ? -1 : (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
  const out = [`URL ${location.pathname}`];
  const html = document.documentElement;
  out.push(`HTML class="${html.className}" data-color-scheme=${html.getAttribute('data-color-scheme')} scheme=${getComputedStyle(html).colorScheme}`);
  out.push(`BODY class="${document.body.className}"`);

  const roots = [];
  const walk = (root, label) => {
    roots.push([root, label]);
    out.push(`ROOT ${label} stylus-styles=${root.querySelectorAll('style.stylus, style[id^="stylus"]').length}`);
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) walk(el.shadowRoot, `${label} > ${el.tagName.toLowerCase()}#shadow`);
      if (el.tagName === 'IFRAME') {
        let d = null;
        try { d = el.contentDocument; } catch (e) {}
        const r = el.getBoundingClientRect();
        out.push(`IFRAME ${d ? 'same-origin' : 'cross-origin'} ${Math.round(r.width)}x${Math.round(r.height)} src=${(el.src || '').slice(0, 90)}`);
        if (d && d.documentElement) walk(d, `${label} > iframe`);
      }
    }
  };
  walk(document, 'doc');

  out.push('', 'LIGHT ELEMENTS');
  const seen = new Set();
  for (const [root, label] of roots) {
    for (const el of root.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 16) continue;
      const cs = (el.ownerDocument.defaultView || window).getComputedStyle(el);
      if (lum(cs.backgroundColor) < 0.7) continue;
      const key = `${label} ${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 5).join('.')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`${key}\n    bg=${cs.backgroundColor} scheme=${cs.colorScheme} ${Math.round(r.width)}x${Math.round(r.height)}`);
      // name the variables that produce this colour: a child inherits them
      const doc = el.ownerDocument, probe = doc.createElement('i');
      probe.style.cssText = 'position:absolute;width:0;height:0;';
      el.appendChild(probe);
      const pcs = doc.defaultView.getComputedStyle(probe), via = [];
      for (let i = 0; i < cs.length; i++) {
        const n = cs[i];
        if (!n.startsWith('--')) continue;
        probe.style.backgroundColor = `var(${n})`;
        if (pcs.backgroundColor === cs.backgroundColor) via.push(n);
      }
      probe.remove();
      // readable names first: they are the stable ones worth fixing
      via.sort((a, b) => (a.slice(2).includes('-') ? 0 : 1) - (b.slice(2).includes('-') ? 0 : 1));
      out.push(`    vars(${via.length})=[${via.slice(0, 30).join(' ')}]`);
      if (seen.size > 80) break;
    }
  }

  // the stylesheets are public, so the generator and fixes can read them offline
  out.push('', 'STYLESHEETS');
  for (const [root, label] of roots) {
    for (const s of root.styleSheets || []) if (s.href) out.push(`${label} ${s.href}`);
  }

  // notification counters: small, saturated red boxes, whatever their class
  out.push('', 'RED BADGES');
  const toHsl = c => {
    const [r, g, b] = nums(c).map(v => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
    return [(h + 360) % 360, s, l];
  };
  let badges = 0;
  for (const [root, label] of roots) {
    for (const el of root.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (!r.width || r.width > 40 || r.height > 30) continue;
      const cs = (el.ownerDocument.defaultView || window).getComputedStyle(el);
      if (nums(cs.backgroundColor)[3] === 0) continue;
      const [h, s] = toHsl(cs.backgroundColor);
      if (s < 0.5 || (h > 20 && h < 330)) continue;
      const chain = [];
      for (let e = el; e && chain.length < 4; e = e.parentElement) chain.push(`${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 4).join('.')}`);
      out.push(`${label} ${chain.join(' < ')}\n    bg=${cs.backgroundColor} color=${cs.color} ${Math.round(r.width)}x${Math.round(r.height)} text="${el.textContent.trim().slice(0, 5)}"`);
      if (++badges > 20) break;
    }
  }

  // the app runs inside a same-origin iframe, so read every document
  out.push('', 'DUMP');
  const dumped = new Set();
  for (const [root] of roots) {
    // shadow roots have no window; only documents carry the palette
    if (root.nodeType !== Node.DOCUMENT_NODE || !root.documentElement) continue;
    const cs = root.defaultView.getComputedStyle(root.documentElement);
    for (let i = 0; i < cs.length; i++) {
      const n = cs[i];
      if (!n.startsWith('--') || dumped.has(n) || /^--(ln|vimium|jer)/.test(n)) continue;
      const v = cs.getPropertyValue(n).trim();
      if (/^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|light-dark\()/i.test(v)) { dumped.add(n); out.push(`${n}: ${v}`); }
    }
  }
  // a download survives clipboard managers that overwrite the clipboard
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/plain' }));
  a.download = `linkedin-probe-${location.pathname.split('/')[1] || 'home'}.txt`;
  a.click();
  return `saved ${a.download} (${out.length} lines)`;
})()
