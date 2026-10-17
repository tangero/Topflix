import { renderTitlePage } from '../_lib/title-page.js';

export function onRequestGet(context) {
  return renderTitlePage(context, 'serial');
}
