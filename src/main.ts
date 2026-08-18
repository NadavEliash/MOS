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

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
