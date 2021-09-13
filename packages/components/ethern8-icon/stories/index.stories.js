import { html } from 'lit';
import '../ethern8-icon.js';

export default {
  title: 'Ethern8Icon',
  component: 'ethern8-icon',
  argTypes: {
    name: { control: 'text' },
  },
};

function Template() {
  return html`
    <ethern8-icon name="ethern8-asset-icon-alert-circle"></ethern8-icon>
  `;
}

export const Regular = Template.bind({});

export const CustomTitle = Template.bind({});
CustomTitle.args = {};

export const CustomCounter = Template.bind({});
CustomCounter.args = {};

export const SlottedContent = Template.bind({});
SlottedContent.args = {};
