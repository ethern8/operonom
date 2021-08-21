import { html } from 'lit-html';
import '../code-snippet.js';

export default {
  title: 'CodeSnippet',
  component: 'code-snippet',
  argTypes: {
    title: { control: 'text' },
    counter: { control: 'number' },
    textColor: { control: 'color' },
  },
};

function Template({ title = 'Hello world', counter = 5, textColor, slot }) {
  return html`<code-snippet
    style="--code-snippet-text-color: ${textColor || 'black'}"
    .title=${title}
    .counter=${counter}
    >${slot}</code-snippet
  > `;
}

export const Regular = Template.bind({});

export const CustomTitle = Template.bind({});
CustomTitle.args = {
  title: 'My title',
};

export const CustomCounter = Template.bind({});
CustomCounter.args = {
  counter: 123456,
};

export const SlottedContent = Template.bind({});
SlottedContent.args = {
  slot: html`npx @ethern8/card`,
};
SlottedContent.argTypes = {
  slot: { table: { disable: true } },
};
