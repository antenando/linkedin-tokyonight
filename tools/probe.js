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
      if (seen.size > 80) break;
    }
  }

  // the app runs inside a same-origin iframe, so read every document
  out.push('', 'DUMP');
  const dumped = new Set();
  for (const [root] of roots) {
    if (!(root instanceof root.defaultView?.Document) || !root.documentElement) continue;
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
