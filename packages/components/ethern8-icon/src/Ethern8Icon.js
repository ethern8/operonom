import { html, LitElement } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { classMap } from 'lit/directives/class-map.js';

export class Ethern8Icon extends LitElement {
  static get properties() {
    return {
      name: { type: String },
      a11yLabel: { type: String },
      iconHref: { type: Number },
    };
  }

  constructor() {
    super();
    this.name = 'alert-circle';
    this._generatedA11yLabelledbyId = null;
  }

  createRenderRoot() {
    return this; // Turn off shadowDOM
  }

  static generateRandomNumber(max = 1000000000000) {
    return Math.floor(Math.random() * Math.floor(max));
  }

  /**
   * Generates a unique ID for the Icon's title
   */
  generatedA11yLabelledbyId() {
    if (!this._generatedA11yLabelledbyId) {
      this._generatedA11yLabelledbyId = `ethern8-icon-title-${Ethern8Icon.generateRandomNumber()}`;
    }

    return this._generatedA11yLabelledbyId;
  }

  get iconHref() {
    return `#asset-icon-${this.name}`;
  }

  render() {
    const classes = { 'ethern8-icon-root': true };
    return html`<svg
      aria-hidden=${this.a11yLabel ? 'false' : 'true'}
      aria-labelledby=${ifDefined(
        this.a11yLabel ? this.generatedA11yLabelledbyId() : undefined
      )}
      class=${classMap(classes)}
      focusable=${this.a11yLabel ? 'true' : 'false'}
      role=${ifDefined(this.a11yLabel ? 'img' : undefined)}
    >
      ${this.a11yLabel
        ? html`
            <title id=${this._generatedA11yLabelledbyId}>
              ${this.a11yLabel}
            </title>
          `
        : ''}
      <use href=${this.iconHref} xlink:href=${this.iconHref} />
    </svg>`;
  }
}
