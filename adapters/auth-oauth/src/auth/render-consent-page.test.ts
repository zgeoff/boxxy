// Copied from atc: packages/mcp/src/auth/render-consent-page.test.ts at commit 4fe647cf.

import { expect, test } from 'bun:test';
import { renderConsentPage } from './render-consent-page.ts';

test('it escapes a client name that carries markup', () => {
  const page = renderConsentPage({
    oauthQuery: 'q=1',
    clientName: '<script>alert(1)</script>',
    redirectURI: 'https://dots.example/cb',
    scopes: ['read'],
  });

  expect(page).not.toInclude('<script>alert(1)</script>');
  expect(page).toInclude('&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('it starts with only read granted', () => {
  const page = renderConsentPage({
    oauthQuery: 'q=1',
    clientName: 'dots',
    redirectURI: 'https://dots.example/cb',
    scopes: ['read', 'write'],
  });

  expect(page).toInclude('value="read" checked');
  expect(page).toInclude('value="write">');
});

test('it describes the write scope as changing items and the runner', () => {
  const page = renderConsentPage({
    oauthQuery: 'q=1',
    clientName: 'dots',
    redirectURI: 'https://dots.example/cb',
    scopes: ['write'],
  });

  expect(page).toInclude('value="write"> File and change items');
});

test('it escapes the signed query it posts back', () => {
  const page = renderConsentPage({
    oauthQuery: 'a="><b>',
    clientName: 'dots',
    redirectURI: 'https://dots.example/cb',
    scopes: ['read'],
  });

  expect(page).toInclude('name="oauth_query" value="a=&quot;&gt;&lt;b&gt;"');
});
