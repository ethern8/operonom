import { html, css, LitElement } from 'lit-element';
import 'prismjs/prism.js';

export class CodeSnippet extends LitElement {
  static get styles() {
    return css`
      :host {
        font-size: 16px;
      }
      pre {
        border-radius: 8px;
      }
      #hidden-code {
        display: none !important;
      }
    `;
  }

  static get properties() {
    return {
      language: {
        type: String,
      },
      theme: {
        type: String,
      },
    };
  }

  constructor() {
    super();
    this.language = 'clike';
    this.theme = 'https://unpkg.com/prismjs/themes/prism.css';
    this.lineNumbers = false;
  }

  async firstUpdated() {
    await this.__loadLanguage();
    const nodes = this.shadowRoot.querySelector('#code').assignedNodes();
    let codeCombined = '';
    // eslint: ignore
    for (let index = 0, len = nodes.length; index < len; ++index) {
      // eslint-disable-line
      codeCombined += nodes[index].nodeValue;
    }

    // strip the lead/end newlines so we don't look horrible
    const codeClean = codeCombined.replace(/^\s+|\s+$/g, '');
    const highlight = Prism.highlight(
      codeClean,
      Prism.languages[this.language],
      this.language
    ); // eslint-disable-line

    // Set to our styled block
    this.shadowRoot.querySelector('#output').innerHTML = highlight;
  }

  async __loadLanguage() {
    await import(
      `https://unpkg.com/prismjs/components/prism-${this.language}.min.js`
    );
  }

  render() {
    return html`
      <link rel="stylesheet" href="${this.theme}" />
      <pre class="language-${this.language}"><code id="output"></code></pre>
      <div id="hidden-code">
        <slot id="code"></slot>
      </div>
    `;
  }
}
