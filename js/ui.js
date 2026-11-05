// A tiny helper for building page elements.
//
//   h('button', { class: 'primary', onclick: go }, 'Start')
//
// Children are always added as text, never as HTML, so nothing in a question
// file can break the page.

export function h(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (name.startsWith('on')) element.addEventListener(name.slice(2), value);
    else if (name === 'class') element.className = value;
    else if (name === 'value') element.value = value;
    else element.setAttribute(name, value === true ? '' : value);
  }
  element.append(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return element;
}

// The same idea for SVG graphics, which browsers create differently.
export function svg(tag, attrs = {}, ...children) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  element.append(...children);
  return element;
}

export function show(root, ...children) {
  root.replaceChildren(...children.flat().filter(Boolean));
  window.scrollTo(0, 0);
}
