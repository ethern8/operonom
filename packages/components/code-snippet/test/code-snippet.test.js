import { html, fixture, expect } from '@open-wc/testing';

import '../code-snippet.js';

describe('CodeSnippet', () => {
  it('has a default title "Hey there" and counter 5', async () => {
    const el = await fixture(html`<code-snippet></code-snippet>`);

    expect(el.title).to.equal('Hey there');
    expect(el.counter).to.equal(5);
  });

  it('increases the counter on button click', async () => {
    const el = await fixture(html`<code-snippet></code-snippet>`);
    el.shadowRoot.querySelector('button').click();

    expect(el.counter).to.equal(6);
  });

  it('can override the title via attribute', async () => {
    const el = await fixture(
      html`<code-snippet title="attribute title"></code-snippet>`
    );

    expect(el.title).to.equal('attribute title');
  });

  it('passes the a11y audit', async () => {
    const el = await fixture(html`<code-snippet></code-snippet>`);

    await expect(el).shadowDom.to.be.accessible();
  });
});
