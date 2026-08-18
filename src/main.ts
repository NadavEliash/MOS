import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

/* Temporary CSP diagnostic. Reports the directive, the source location and the first
   characters of the blocked code for every violation, plus the offending element.
   Remove once the 'script-src' inline-handler violation is accounted for. */
document.addEventListener('securitypolicyviolation', (event) => {
  console.error('[CSP violation]', {
    directive: event.effectiveDirective || event.violatedDirective,
    sample: event.sample,
    blockedURI: event.blockedURI,
    source: `${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`,
    element: (event.target as Element)?.outerHTML?.slice(0, 300)
  });
});

/* Temporary companion to the listener above. CSP blocks a handler from *running* but leaves
   the attribute in the DOM, so this finds the offender even when the violation fired before
   this bundle executed. Call findInlineHandlers() from the console at any time - e.g. after
   hovering a graph - to re-scan. */
function findInlineHandlers(): Element[] {
  const hits = Array.from(document.querySelectorAll('*')).filter((el) =>
    Array.from(el.attributes).some((attr) => /^on[a-z]+$/i.test(attr.name))
  );
  if (hits.length) {
    console.error('[CSP] inline handler attributes in the live DOM:',
      hits.map((el) => el.outerHTML.slice(0, 300)));
  } else {
    console.info('[CSP] no inline handler attributes found in the live DOM');
  }
  return hits;
}
(window as any).findInlineHandlers = findInlineHandlers;

bootstrapApplication(App, appConfig)
  .then(() => findInlineHandlers())
  .catch((err) => console.error(err));
