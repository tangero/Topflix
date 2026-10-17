import { renderTitlePage } from '../_lib/title-page.js';

export function onRequestGet(context) {
  return renderTitlePage(context, 'film');
}

// HEAD (kontroly odkazů, některé nástroje SEO) dostane stejnou odpověď bez těla.
export { onRequestGet as onRequestHead };
