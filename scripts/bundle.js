(function () {
    'use strict';

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * True if the custom elements polyfill is in use.
     */
    const isCEPolyfill = typeof window !== 'undefined' &&
        window.customElements != null &&
        window.customElements.polyfillWrapFlushCallback !==
            undefined;
    /**
     * Removes nodes, starting from `start` (inclusive) to `end` (exclusive), from
     * `container`.
     */
    const removeNodes = (container, start, end = null) => {
        while (start !== end) {
            const n = start.nextSibling;
            container.removeChild(start);
            start = n;
        }
    };

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * An expression marker with embedded unique key to avoid collision with
     * possible text in templates.
     */
    const marker = `{{lit-${String(Math.random()).slice(2)}}}`;
    /**
     * An expression marker used text-positions, multi-binding attributes, and
     * attributes with markup-like text values.
     */
    const nodeMarker = `<!--${marker}-->`;
    const markerRegex = new RegExp(`${marker}|${nodeMarker}`);
    /**
     * Suffix appended to all bound attribute names.
     */
    const boundAttributeSuffix = '$lit$';
    /**
     * An updatable Template that tracks the location of dynamic parts.
     */
    class Template {
        constructor(result, element) {
            this.parts = [];
            this.element = element;
            const nodesToRemove = [];
            const stack = [];
            // Edge needs all 4 parameters present; IE11 needs 3rd parameter to be null
            const walker = document.createTreeWalker(element.content, 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */, null, false);
            // Keeps track of the last index associated with a part. We try to delete
            // unnecessary nodes, but we never want to associate two different parts
            // to the same index. They must have a constant node between.
            let lastPartIndex = 0;
            let index = -1;
            let partIndex = 0;
            const { strings, values: { length } } = result;
            while (partIndex < length) {
                const node = walker.nextNode();
                if (node === null) {
                    // We've exhausted the content inside a nested template element.
                    // Because we still have parts (the outer for-loop), we know:
                    // - There is a template in the stack
                    // - The walker will find a nextNode outside the template
                    walker.currentNode = stack.pop();
                    continue;
                }
                index++;
                if (node.nodeType === 1 /* Node.ELEMENT_NODE */) {
                    if (node.hasAttributes()) {
                        const attributes = node.attributes;
                        const { length } = attributes;
                        // Per
                        // https://developer.mozilla.org/en-US/docs/Web/API/NamedNodeMap,
                        // attributes are not guaranteed to be returned in document order.
                        // In particular, Edge/IE can return them out of order, so we cannot
                        // assume a correspondence between part index and attribute index.
                        let count = 0;
                        for (let i = 0; i < length; i++) {
                            if (endsWith(attributes[i].name, boundAttributeSuffix)) {
                                count++;
                            }
                        }
                        while (count-- > 0) {
                            // Get the template literal section leading up to the first
                            // expression in this attribute
                            const stringForPart = strings[partIndex];
                            // Find the attribute name
                            const name = lastAttributeNameRegex.exec(stringForPart)[2];
                            // Find the corresponding attribute
                            // All bound attributes have had a suffix added in
                            // TemplateResult#getHTML to opt out of special attribute
                            // handling. To look up the attribute value we also need to add
                            // the suffix.
                            const attributeLookupName = name.toLowerCase() + boundAttributeSuffix;
                            const attributeValue = node.getAttribute(attributeLookupName);
                            node.removeAttribute(attributeLookupName);
                            const statics = attributeValue.split(markerRegex);
                            this.parts.push({ type: 'attribute', index, name, strings: statics });
                            partIndex += statics.length - 1;
                        }
                    }
                    if (node.tagName === 'TEMPLATE') {
                        stack.push(node);
                        walker.currentNode = node.content;
                    }
                }
                else if (node.nodeType === 3 /* Node.TEXT_NODE */) {
                    const data = node.data;
                    if (data.indexOf(marker) >= 0) {
                        const parent = node.parentNode;
                        const strings = data.split(markerRegex);
                        const lastIndex = strings.length - 1;
                        // Generate a new text node for each literal section
                        // These nodes are also used as the markers for node parts
                        for (let i = 0; i < lastIndex; i++) {
                            let insert;
                            let s = strings[i];
                            if (s === '') {
                                insert = createMarker();
                            }
                            else {
                                const match = lastAttributeNameRegex.exec(s);
                                if (match !== null && endsWith(match[2], boundAttributeSuffix)) {
                                    s = s.slice(0, match.index) + match[1] +
                                        match[2].slice(0, -boundAttributeSuffix.length) + match[3];
                                }
                                insert = document.createTextNode(s);
                            }
                            parent.insertBefore(insert, node);
                            this.parts.push({ type: 'node', index: ++index });
                        }
                        // If there's no text, we must insert a comment to mark our place.
                        // Else, we can trust it will stick around after cloning.
                        if (strings[lastIndex] === '') {
                            parent.insertBefore(createMarker(), node);
                            nodesToRemove.push(node);
                        }
                        else {
                            node.data = strings[lastIndex];
                        }
                        // We have a part for each match found
                        partIndex += lastIndex;
                    }
                }
                else if (node.nodeType === 8 /* Node.COMMENT_NODE */) {
                    if (node.data === marker) {
                        const parent = node.parentNode;
                        // Add a new marker node to be the startNode of the Part if any of
                        // the following are true:
                        //  * We don't have a previousSibling
                        //  * The previousSibling is already the start of a previous part
                        if (node.previousSibling === null || index === lastPartIndex) {
                            index++;
                            parent.insertBefore(createMarker(), node);
                        }
                        lastPartIndex = index;
                        this.parts.push({ type: 'node', index });
                        // If we don't have a nextSibling, keep this node so we have an end.
                        // Else, we can remove it to save future costs.
                        if (node.nextSibling === null) {
                            node.data = '';
                        }
                        else {
                            nodesToRemove.push(node);
                            index--;
                        }
                        partIndex++;
                    }
                    else {
                        let i = -1;
                        while ((i = node.data.indexOf(marker, i + 1)) !== -1) {
                            // Comment node has a binding marker inside, make an inactive part
                            // The binding won't work, but subsequent bindings will
                            // TODO (justinfagnani): consider whether it's even worth it to
                            // make bindings in comments work
                            this.parts.push({ type: 'node', index: -1 });
                            partIndex++;
                        }
                    }
                }
            }
            // Remove text binding nodes after the walk to not disturb the TreeWalker
            for (const n of nodesToRemove) {
                n.parentNode.removeChild(n);
            }
        }
    }
    const endsWith = (str, suffix) => {
        const index = str.length - suffix.length;
        return index >= 0 && str.slice(index) === suffix;
    };
    const isTemplatePartActive = (part) => part.index !== -1;
    // Allows `document.createComment('')` to be renamed for a
    // small manual size-savings.
    const createMarker = () => document.createComment('');
    /**
     * This regex extracts the attribute name preceding an attribute-position
     * expression. It does this by matching the syntax allowed for attributes
     * against the string literal directly preceding the expression, assuming that
     * the expression is in an attribute-value position.
     *
     * See attributes in the HTML spec:
     * https://www.w3.org/TR/html5/syntax.html#elements-attributes
     *
     * " \x09\x0a\x0c\x0d" are HTML space characters:
     * https://www.w3.org/TR/html5/infrastructure.html#space-characters
     *
     * "\0-\x1F\x7F-\x9F" are Unicode control characters, which includes every
     * space character except " ".
     *
     * So an attribute is:
     *  * The name: any character except a control character, space character, ('),
     *    ("), ">", "=", or "/"
     *  * Followed by zero or more space characters
     *  * Followed by "="
     *  * Followed by zero or more space characters
     *  * Followed by:
     *    * Any character except space, ('), ("), "<", ">", "=", (`), or
     *    * (") then any non-("), or
     *    * (') then any non-(')
     */
    const lastAttributeNameRegex = 
    // eslint-disable-next-line no-control-regex
    /([ \x09\x0a\x0c\x0d])([^\0-\x1F\x7F-\x9F "'>=/]+)([ \x09\x0a\x0c\x0d]*=[ \x09\x0a\x0c\x0d]*(?:[^ \x09\x0a\x0c\x0d"'`<>=]*|"[^"]*|'[^']*))$/;

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    const walkerNodeFilter = 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */;
    /**
     * Removes the list of nodes from a Template safely. In addition to removing
     * nodes from the Template, the Template part indices are updated to match
     * the mutated Template DOM.
     *
     * As the template is walked the removal state is tracked and
     * part indices are adjusted as needed.
     *
     * div
     *   div#1 (remove) <-- start removing (removing node is div#1)
     *     div
     *       div#2 (remove)  <-- continue removing (removing node is still div#1)
     *         div
     * div <-- stop removing since previous sibling is the removing node (div#1,
     * removed 4 nodes)
     */
    function removeNodesFromTemplate(template, nodesToRemove) {
        const { element: { content }, parts } = template;
        const walker = document.createTreeWalker(content, walkerNodeFilter, null, false);
        let partIndex = nextActiveIndexInTemplateParts(parts);
        let part = parts[partIndex];
        let nodeIndex = -1;
        let removeCount = 0;
        const nodesToRemoveInTemplate = [];
        let currentRemovingNode = null;
        while (walker.nextNode()) {
            nodeIndex++;
            const node = walker.currentNode;
            // End removal if stepped past the removing node
            if (node.previousSibling === currentRemovingNode) {
                currentRemovingNode = null;
            }
            // A node to remove was found in the template
            if (nodesToRemove.has(node)) {
                nodesToRemoveInTemplate.push(node);
                // Track node we're removing
                if (currentRemovingNode === null) {
                    currentRemovingNode = node;
                }
            }
            // When removing, increment count by which to adjust subsequent part indices
            if (currentRemovingNode !== null) {
                removeCount++;
            }
            while (part !== undefined && part.index === nodeIndex) {
                // If part is in a removed node deactivate it by setting index to -1 or
                // adjust the index as needed.
                part.index = currentRemovingNode !== null ? -1 : part.index - removeCount;
                // go to the next active part.
                partIndex = nextActiveIndexInTemplateParts(parts, partIndex);
                part = parts[partIndex];
            }
        }
        nodesToRemoveInTemplate.forEach((n) => n.parentNode.removeChild(n));
    }
    const countNodes = (node) => {
        let count = (node.nodeType === 11 /* Node.DOCUMENT_FRAGMENT_NODE */) ? 0 : 1;
        const walker = document.createTreeWalker(node, walkerNodeFilter, null, false);
        while (walker.nextNode()) {
            count++;
        }
        return count;
    };
    const nextActiveIndexInTemplateParts = (parts, startIndex = -1) => {
        for (let i = startIndex + 1; i < parts.length; i++) {
            const part = parts[i];
            if (isTemplatePartActive(part)) {
                return i;
            }
        }
        return -1;
    };
    /**
     * Inserts the given node into the Template, optionally before the given
     * refNode. In addition to inserting the node into the Template, the Template
     * part indices are updated to match the mutated Template DOM.
     */
    function insertNodeIntoTemplate(template, node, refNode = null) {
        const { element: { content }, parts } = template;
        // If there's no refNode, then put node at end of template.
        // No part indices need to be shifted in this case.
        if (refNode === null || refNode === undefined) {
            content.appendChild(node);
            return;
        }
        const walker = document.createTreeWalker(content, walkerNodeFilter, null, false);
        let partIndex = nextActiveIndexInTemplateParts(parts);
        let insertCount = 0;
        let walkerIndex = -1;
        while (walker.nextNode()) {
            walkerIndex++;
            const walkerNode = walker.currentNode;
            if (walkerNode === refNode) {
                insertCount = countNodes(node);
                refNode.parentNode.insertBefore(node, refNode);
            }
            while (partIndex !== -1 && parts[partIndex].index === walkerIndex) {
                // If we've inserted the node, simply adjust all subsequent parts
                if (insertCount > 0) {
                    while (partIndex !== -1) {
                        parts[partIndex].index += insertCount;
                        partIndex = nextActiveIndexInTemplateParts(parts, partIndex);
                    }
                    return;
                }
                partIndex = nextActiveIndexInTemplateParts(parts, partIndex);
            }
        }
    }

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    const directives = new WeakMap();
    const isDirective = (o) => {
        return typeof o === 'function' && directives.has(o);
    };

    /**
     * @license
     * Copyright (c) 2018 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * A sentinel value that signals that a value was handled by a directive and
     * should not be written to the DOM.
     */
    const noChange = {};
    /**
     * A sentinel value that signals a NodePart to fully clear its content.
     */
    const nothing = {};

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * An instance of a `Template` that can be attached to the DOM and updated
     * with new values.
     */
    class TemplateInstance {
        constructor(template, processor, options) {
            this.__parts = [];
            this.template = template;
            this.processor = processor;
            this.options = options;
        }
        update(values) {
            let i = 0;
            for (const part of this.__parts) {
                if (part !== undefined) {
                    part.setValue(values[i]);
                }
                i++;
            }
            for (const part of this.__parts) {
                if (part !== undefined) {
                    part.commit();
                }
            }
        }
        _clone() {
            // There are a number of steps in the lifecycle of a template instance's
            // DOM fragment:
            //  1. Clone - create the instance fragment
            //  2. Adopt - adopt into the main document
            //  3. Process - find part markers and create parts
            //  4. Upgrade - upgrade custom elements
            //  5. Update - set node, attribute, property, etc., values
            //  6. Connect - connect to the document. Optional and outside of this
            //     method.
            //
            // We have a few constraints on the ordering of these steps:
            //  * We need to upgrade before updating, so that property values will pass
            //    through any property setters.
            //  * We would like to process before upgrading so that we're sure that the
            //    cloned fragment is inert and not disturbed by self-modifying DOM.
            //  * We want custom elements to upgrade even in disconnected fragments.
            //
            // Given these constraints, with full custom elements support we would
            // prefer the order: Clone, Process, Adopt, Upgrade, Update, Connect
            //
            // But Safari does not implement CustomElementRegistry#upgrade, so we
            // can not implement that order and still have upgrade-before-update and
            // upgrade disconnected fragments. So we instead sacrifice the
            // process-before-upgrade constraint, since in Custom Elements v1 elements
            // must not modify their light DOM in the constructor. We still have issues
            // when co-existing with CEv0 elements like Polymer 1, and with polyfills
            // that don't strictly adhere to the no-modification rule because shadow
            // DOM, which may be created in the constructor, is emulated by being placed
            // in the light DOM.
            //
            // The resulting order is on native is: Clone, Adopt, Upgrade, Process,
            // Update, Connect. document.importNode() performs Clone, Adopt, and Upgrade
            // in one step.
            //
            // The Custom Elements v1 polyfill supports upgrade(), so the order when
            // polyfilled is the more ideal: Clone, Process, Adopt, Upgrade, Update,
            // Connect.
            const fragment = isCEPolyfill ?
                this.template.element.content.cloneNode(true) :
                document.importNode(this.template.element.content, true);
            const stack = [];
            const parts = this.template.parts;
            // Edge needs all 4 parameters present; IE11 needs 3rd parameter to be null
            const walker = document.createTreeWalker(fragment, 133 /* NodeFilter.SHOW_{ELEMENT|COMMENT|TEXT} */, null, false);
            let partIndex = 0;
            let nodeIndex = 0;
            let part;
            let node = walker.nextNode();
            // Loop through all the nodes and parts of a template
            while (partIndex < parts.length) {
                part = parts[partIndex];
                if (!isTemplatePartActive(part)) {
                    this.__parts.push(undefined);
                    partIndex++;
                    continue;
                }
                // Progress the tree walker until we find our next part's node.
                // Note that multiple parts may share the same node (attribute parts
                // on a single element), so this loop may not run at all.
                while (nodeIndex < part.index) {
                    nodeIndex++;
                    if (node.nodeName === 'TEMPLATE') {
                        stack.push(node);
                        walker.currentNode = node.content;
                    }
                    if ((node = walker.nextNode()) === null) {
                        // We've exhausted the content inside a nested template element.
                        // Because we still have parts (the outer for-loop), we know:
                        // - There is a template in the stack
                        // - The walker will find a nextNode outside the template
                        walker.currentNode = stack.pop();
                        node = walker.nextNode();
                    }
                }
                // We've arrived at our part's node.
                if (part.type === 'node') {
                    const part = this.processor.handleTextExpression(this.options);
                    part.insertAfterNode(node.previousSibling);
                    this.__parts.push(part);
                }
                else {
                    this.__parts.push(...this.processor.handleAttributeExpressions(node, part.name, part.strings, this.options));
                }
                partIndex++;
            }
            if (isCEPolyfill) {
                document.adoptNode(fragment);
                customElements.upgrade(fragment);
            }
            return fragment;
        }
    }

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * Our TrustedTypePolicy for HTML which is declared using the html template
     * tag function.
     *
     * That HTML is a developer-authored constant, and is parsed with innerHTML
     * before any untrusted expressions have been mixed in. Therefor it is
     * considered safe by construction.
     */
    const policy = window.trustedTypes &&
        trustedTypes.createPolicy('lit-html', { createHTML: (s) => s });
    const commentMarker = ` ${marker} `;
    /**
     * The return type of `html`, which holds a Template and the values from
     * interpolated expressions.
     */
    class TemplateResult {
        constructor(strings, values, type, processor) {
            this.strings = strings;
            this.values = values;
            this.type = type;
            this.processor = processor;
        }
        /**
         * Returns a string of HTML used to create a `<template>` element.
         */
        getHTML() {
            const l = this.strings.length - 1;
            let html = '';
            let isCommentBinding = false;
            for (let i = 0; i < l; i++) {
                const s = this.strings[i];
                // For each binding we want to determine the kind of marker to insert
                // into the template source before it's parsed by the browser's HTML
                // parser. The marker type is based on whether the expression is in an
                // attribute, text, or comment position.
                //   * For node-position bindings we insert a comment with the marker
                //     sentinel as its text content, like <!--{{lit-guid}}-->.
                //   * For attribute bindings we insert just the marker sentinel for the
                //     first binding, so that we support unquoted attribute bindings.
                //     Subsequent bindings can use a comment marker because multi-binding
                //     attributes must be quoted.
                //   * For comment bindings we insert just the marker sentinel so we don't
                //     close the comment.
                //
                // The following code scans the template source, but is *not* an HTML
                // parser. We don't need to track the tree structure of the HTML, only
                // whether a binding is inside a comment, and if not, if it appears to be
                // the first binding in an attribute.
                const commentOpen = s.lastIndexOf('<!--');
                // We're in comment position if we have a comment open with no following
                // comment close. Because <-- can appear in an attribute value there can
                // be false positives.
                isCommentBinding = (commentOpen > -1 || isCommentBinding) &&
                    s.indexOf('-->', commentOpen + 1) === -1;
                // Check to see if we have an attribute-like sequence preceding the
                // expression. This can match "name=value" like structures in text,
                // comments, and attribute values, so there can be false-positives.
                const attributeMatch = lastAttributeNameRegex.exec(s);
                if (attributeMatch === null) {
                    // We're only in this branch if we don't have a attribute-like
                    // preceding sequence. For comments, this guards against unusual
                    // attribute values like <div foo="<!--${'bar'}">. Cases like
                    // <!-- foo=${'bar'}--> are handled correctly in the attribute branch
                    // below.
                    html += s + (isCommentBinding ? commentMarker : nodeMarker);
                }
                else {
                    // For attributes we use just a marker sentinel, and also append a
                    // $lit$ suffix to the name to opt-out of attribute-specific parsing
                    // that IE and Edge do for style and certain SVG attributes.
                    html += s.substr(0, attributeMatch.index) + attributeMatch[1] +
                        attributeMatch[2] + boundAttributeSuffix + attributeMatch[3] +
                        marker;
                }
            }
            html += this.strings[l];
            return html;
        }
        getTemplateElement() {
            const template = document.createElement('template');
            let value = this.getHTML();
            if (policy !== undefined) {
                // this is secure because `this.strings` is a TemplateStringsArray.
                // TODO: validate this when
                // https://github.com/tc39/proposal-array-is-template-object is
                // implemented.
                value = policy.createHTML(value);
            }
            template.innerHTML = value;
            return template;
        }
    }

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    const isPrimitive = (value) => {
        return (value === null ||
            !(typeof value === 'object' || typeof value === 'function'));
    };
    const isIterable = (value) => {
        return Array.isArray(value) ||
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            !!(value && value[Symbol.iterator]);
    };
    /**
     * Writes attribute values to the DOM for a group of AttributeParts bound to a
     * single attribute. The value is only set once even if there are multiple parts
     * for an attribute.
     */
    class AttributeCommitter {
        constructor(element, name, strings) {
            this.dirty = true;
            this.element = element;
            this.name = name;
            this.strings = strings;
            this.parts = [];
            for (let i = 0; i < strings.length - 1; i++) {
                this.parts[i] = this._createPart();
            }
        }
        /**
         * Creates a single part. Override this to create a differnt type of part.
         */
        _createPart() {
            return new AttributePart(this);
        }
        _getValue() {
            const strings = this.strings;
            const l = strings.length - 1;
            const parts = this.parts;
            // If we're assigning an attribute via syntax like:
            //    attr="${foo}"  or  attr=${foo}
            // but not
            //    attr="${foo} ${bar}" or attr="${foo} baz"
            // then we don't want to coerce the attribute value into one long
            // string. Instead we want to just return the value itself directly,
            // so that sanitizeDOMValue can get the actual value rather than
            // String(value)
            // The exception is if v is an array, in which case we do want to smash
            // it together into a string without calling String() on the array.
            //
            // This also allows trusted values (when using TrustedTypes) being
            // assigned to DOM sinks without being stringified in the process.
            if (l === 1 && strings[0] === '' && strings[1] === '') {
                const v = parts[0].value;
                if (typeof v === 'symbol') {
                    return String(v);
                }
                if (typeof v === 'string' || !isIterable(v)) {
                    return v;
                }
            }
            let text = '';
            for (let i = 0; i < l; i++) {
                text += strings[i];
                const part = parts[i];
                if (part !== undefined) {
                    const v = part.value;
                    if (isPrimitive(v) || !isIterable(v)) {
                        text += typeof v === 'string' ? v : String(v);
                    }
                    else {
                        for (const t of v) {
                            text += typeof t === 'string' ? t : String(t);
                        }
                    }
                }
            }
            text += strings[l];
            return text;
        }
        commit() {
            if (this.dirty) {
                this.dirty = false;
                this.element.setAttribute(this.name, this._getValue());
            }
        }
    }
    /**
     * A Part that controls all or part of an attribute value.
     */
    class AttributePart {
        constructor(committer) {
            this.value = undefined;
            this.committer = committer;
        }
        setValue(value) {
            if (value !== noChange && (!isPrimitive(value) || value !== this.value)) {
                this.value = value;
                // If the value is a not a directive, dirty the committer so that it'll
                // call setAttribute. If the value is a directive, it'll dirty the
                // committer if it calls setValue().
                if (!isDirective(value)) {
                    this.committer.dirty = true;
                }
            }
        }
        commit() {
            while (isDirective(this.value)) {
                const directive = this.value;
                this.value = noChange;
                directive(this);
            }
            if (this.value === noChange) {
                return;
            }
            this.committer.commit();
        }
    }
    /**
     * A Part that controls a location within a Node tree. Like a Range, NodePart
     * has start and end locations and can set and update the Nodes between those
     * locations.
     *
     * NodeParts support several value types: primitives, Nodes, TemplateResults,
     * as well as arrays and iterables of those types.
     */
    class NodePart {
        constructor(options) {
            this.value = undefined;
            this.__pendingValue = undefined;
            this.options = options;
        }
        /**
         * Appends this part into a container.
         *
         * This part must be empty, as its contents are not automatically moved.
         */
        appendInto(container) {
            this.startNode = container.appendChild(createMarker());
            this.endNode = container.appendChild(createMarker());
        }
        /**
         * Inserts this part after the `ref` node (between `ref` and `ref`'s next
         * sibling). Both `ref` and its next sibling must be static, unchanging nodes
         * such as those that appear in a literal section of a template.
         *
         * This part must be empty, as its contents are not automatically moved.
         */
        insertAfterNode(ref) {
            this.startNode = ref;
            this.endNode = ref.nextSibling;
        }
        /**
         * Appends this part into a parent part.
         *
         * This part must be empty, as its contents are not automatically moved.
         */
        appendIntoPart(part) {
            part.__insert(this.startNode = createMarker());
            part.__insert(this.endNode = createMarker());
        }
        /**
         * Inserts this part after the `ref` part.
         *
         * This part must be empty, as its contents are not automatically moved.
         */
        insertAfterPart(ref) {
            ref.__insert(this.startNode = createMarker());
            this.endNode = ref.endNode;
            ref.endNode = this.startNode;
        }
        setValue(value) {
            this.__pendingValue = value;
        }
        commit() {
            if (this.startNode.parentNode === null) {
                return;
            }
            while (isDirective(this.__pendingValue)) {
                const directive = this.__pendingValue;
                this.__pendingValue = noChange;
                directive(this);
            }
            const value = this.__pendingValue;
            if (value === noChange) {
                return;
            }
            if (isPrimitive(value)) {
                if (value !== this.value) {
                    this.__commitText(value);
                }
            }
            else if (value instanceof TemplateResult) {
                this.__commitTemplateResult(value);
            }
            else if (value instanceof Node) {
                this.__commitNode(value);
            }
            else if (isIterable(value)) {
                this.__commitIterable(value);
            }
            else if (value === nothing) {
                this.value = nothing;
                this.clear();
            }
            else {
                // Fallback, will render the string representation
                this.__commitText(value);
            }
        }
        __insert(node) {
            this.endNode.parentNode.insertBefore(node, this.endNode);
        }
        __commitNode(value) {
            if (this.value === value) {
                return;
            }
            this.clear();
            this.__insert(value);
            this.value = value;
        }
        __commitText(value) {
            const node = this.startNode.nextSibling;
            value = value == null ? '' : value;
            // If `value` isn't already a string, we explicitly convert it here in case
            // it can't be implicitly converted - i.e. it's a symbol.
            const valueAsString = typeof value === 'string' ? value : String(value);
            if (node === this.endNode.previousSibling &&
                node.nodeType === 3 /* Node.TEXT_NODE */) {
                // If we only have a single text node between the markers, we can just
                // set its value, rather than replacing it.
                // TODO(justinfagnani): Can we just check if this.value is primitive?
                node.data = valueAsString;
            }
            else {
                this.__commitNode(document.createTextNode(valueAsString));
            }
            this.value = value;
        }
        __commitTemplateResult(value) {
            const template = this.options.templateFactory(value);
            if (this.value instanceof TemplateInstance &&
                this.value.template === template) {
                this.value.update(value.values);
            }
            else {
                // Make sure we propagate the template processor from the TemplateResult
                // so that we use its syntax extension, etc. The template factory comes
                // from the render function options so that it can control template
                // caching and preprocessing.
                const instance = new TemplateInstance(template, value.processor, this.options);
                const fragment = instance._clone();
                instance.update(value.values);
                this.__commitNode(fragment);
                this.value = instance;
            }
        }
        __commitIterable(value) {
            // For an Iterable, we create a new InstancePart per item, then set its
            // value to the item. This is a little bit of overhead for every item in
            // an Iterable, but it lets us recurse easily and efficiently update Arrays
            // of TemplateResults that will be commonly returned from expressions like:
            // array.map((i) => html`${i}`), by reusing existing TemplateInstances.
            // If _value is an array, then the previous render was of an
            // iterable and _value will contain the NodeParts from the previous
            // render. If _value is not an array, clear this part and make a new
            // array for NodeParts.
            if (!Array.isArray(this.value)) {
                this.value = [];
                this.clear();
            }
            // Lets us keep track of how many items we stamped so we can clear leftover
            // items from a previous render
            const itemParts = this.value;
            let partIndex = 0;
            let itemPart;
            for (const item of value) {
                // Try to reuse an existing part
                itemPart = itemParts[partIndex];
                // If no existing part, create a new one
                if (itemPart === undefined) {
                    itemPart = new NodePart(this.options);
                    itemParts.push(itemPart);
                    if (partIndex === 0) {
                        itemPart.appendIntoPart(this);
                    }
                    else {
                        itemPart.insertAfterPart(itemParts[partIndex - 1]);
                    }
                }
                itemPart.setValue(item);
                itemPart.commit();
                partIndex++;
            }
            if (partIndex < itemParts.length) {
                // Truncate the parts array so _value reflects the current state
                itemParts.length = partIndex;
                this.clear(itemPart && itemPart.endNode);
            }
        }
        clear(startNode = this.startNode) {
            removeNodes(this.startNode.parentNode, startNode.nextSibling, this.endNode);
        }
    }
    /**
     * Implements a boolean attribute, roughly as defined in the HTML
     * specification.
     *
     * If the value is truthy, then the attribute is present with a value of
     * ''. If the value is falsey, the attribute is removed.
     */
    class BooleanAttributePart {
        constructor(element, name, strings) {
            this.value = undefined;
            this.__pendingValue = undefined;
            if (strings.length !== 2 || strings[0] !== '' || strings[1] !== '') {
                throw new Error('Boolean attributes can only contain a single expression');
            }
            this.element = element;
            this.name = name;
            this.strings = strings;
        }
        setValue(value) {
            this.__pendingValue = value;
        }
        commit() {
            while (isDirective(this.__pendingValue)) {
                const directive = this.__pendingValue;
                this.__pendingValue = noChange;
                directive(this);
            }
            if (this.__pendingValue === noChange) {
                return;
            }
            const value = !!this.__pendingValue;
            if (this.value !== value) {
                if (value) {
                    this.element.setAttribute(this.name, '');
                }
                else {
                    this.element.removeAttribute(this.name);
                }
                this.value = value;
            }
            this.__pendingValue = noChange;
        }
    }
    /**
     * Sets attribute values for PropertyParts, so that the value is only set once
     * even if there are multiple parts for a property.
     *
     * If an expression controls the whole property value, then the value is simply
     * assigned to the property under control. If there are string literals or
     * multiple expressions, then the strings are expressions are interpolated into
     * a string first.
     */
    class PropertyCommitter extends AttributeCommitter {
        constructor(element, name, strings) {
            super(element, name, strings);
            this.single =
                (strings.length === 2 && strings[0] === '' && strings[1] === '');
        }
        _createPart() {
            return new PropertyPart(this);
        }
        _getValue() {
            if (this.single) {
                return this.parts[0].value;
            }
            return super._getValue();
        }
        commit() {
            if (this.dirty) {
                this.dirty = false;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                this.element[this.name] = this._getValue();
            }
        }
    }
    class PropertyPart extends AttributePart {
    }
    // Detect event listener options support. If the `capture` property is read
    // from the options object, then options are supported. If not, then the third
    // argument to add/removeEventListener is interpreted as the boolean capture
    // value so we should only pass the `capture` property.
    let eventOptionsSupported = false;
    // Wrap into an IIFE because MS Edge <= v41 does not support having try/catch
    // blocks right into the body of a module
    (() => {
        try {
            const options = {
                get capture() {
                    eventOptionsSupported = true;
                    return false;
                }
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            window.addEventListener('test', options, options);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            window.removeEventListener('test', options, options);
        }
        catch (_e) {
            // event options not supported
        }
    })();
    class EventPart {
        constructor(element, eventName, eventContext) {
            this.value = undefined;
            this.__pendingValue = undefined;
            this.element = element;
            this.eventName = eventName;
            this.eventContext = eventContext;
            this.__boundHandleEvent = (e) => this.handleEvent(e);
        }
        setValue(value) {
            this.__pendingValue = value;
        }
        commit() {
            while (isDirective(this.__pendingValue)) {
                const directive = this.__pendingValue;
                this.__pendingValue = noChange;
                directive(this);
            }
            if (this.__pendingValue === noChange) {
                return;
            }
            const newListener = this.__pendingValue;
            const oldListener = this.value;
            const shouldRemoveListener = newListener == null ||
                oldListener != null &&
                    (newListener.capture !== oldListener.capture ||
                        newListener.once !== oldListener.once ||
                        newListener.passive !== oldListener.passive);
            const shouldAddListener = newListener != null && (oldListener == null || shouldRemoveListener);
            if (shouldRemoveListener) {
                this.element.removeEventListener(this.eventName, this.__boundHandleEvent, this.__options);
            }
            if (shouldAddListener) {
                this.__options = getOptions(newListener);
                this.element.addEventListener(this.eventName, this.__boundHandleEvent, this.__options);
            }
            this.value = newListener;
            this.__pendingValue = noChange;
        }
        handleEvent(event) {
            if (typeof this.value === 'function') {
                this.value.call(this.eventContext || this.element, event);
            }
            else {
                this.value.handleEvent(event);
            }
        }
    }
    // We copy options because of the inconsistent behavior of browsers when reading
    // the third argument of add/removeEventListener. IE11 doesn't support options
    // at all. Chrome 41 only reads `capture` if the argument is an object.
    const getOptions = (o) => o &&
        (eventOptionsSupported ?
            { capture: o.capture, passive: o.passive, once: o.once } :
            o.capture);

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * The default TemplateFactory which caches Templates keyed on
     * result.type and result.strings.
     */
    function templateFactory(result) {
        let templateCache = templateCaches.get(result.type);
        if (templateCache === undefined) {
            templateCache = {
                stringsArray: new WeakMap(),
                keyString: new Map()
            };
            templateCaches.set(result.type, templateCache);
        }
        let template = templateCache.stringsArray.get(result.strings);
        if (template !== undefined) {
            return template;
        }
        // If the TemplateStringsArray is new, generate a key from the strings
        // This key is shared between all templates with identical content
        const key = result.strings.join(marker);
        // Check if we already have a Template for this key
        template = templateCache.keyString.get(key);
        if (template === undefined) {
            // If we have not seen this key before, create a new Template
            template = new Template(result, result.getTemplateElement());
            // Cache the Template for this key
            templateCache.keyString.set(key, template);
        }
        // Cache all future queries for this TemplateStringsArray
        templateCache.stringsArray.set(result.strings, template);
        return template;
    }
    const templateCaches = new Map();

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    const parts = new WeakMap();
    /**
     * Renders a template result or other value to a container.
     *
     * To update a container with new values, reevaluate the template literal and
     * call `render` with the new result.
     *
     * @param result Any value renderable by NodePart - typically a TemplateResult
     *     created by evaluating a template tag like `html` or `svg`.
     * @param container A DOM parent to render to. The entire contents are either
     *     replaced, or efficiently updated if the same result type was previous
     *     rendered there.
     * @param options RenderOptions for the entire render tree rendered to this
     *     container. Render options must *not* change between renders to the same
     *     container, as those changes will not effect previously rendered DOM.
     */
    const render$1 = (result, container, options) => {
        let part = parts.get(container);
        if (part === undefined) {
            removeNodes(container, container.firstChild);
            parts.set(container, part = new NodePart(Object.assign({ templateFactory }, options)));
            part.appendInto(container);
        }
        part.setValue(result);
        part.commit();
    };

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    /**
     * Creates Parts when a template is instantiated.
     */
    class DefaultTemplateProcessor {
        /**
         * Create parts for an attribute-position binding, given the event, attribute
         * name, and string literals.
         *
         * @param element The element containing the binding
         * @param name  The attribute name
         * @param strings The string literals. There are always at least two strings,
         *   event for fully-controlled bindings with a single expression.
         */
        handleAttributeExpressions(element, name, strings, options) {
            const prefix = name[0];
            if (prefix === '.') {
                const committer = new PropertyCommitter(element, name.slice(1), strings);
                return committer.parts;
            }
            if (prefix === '@') {
                return [new EventPart(element, name.slice(1), options.eventContext)];
            }
            if (prefix === '?') {
                return [new BooleanAttributePart(element, name.slice(1), strings)];
            }
            const committer = new AttributeCommitter(element, name, strings);
            return committer.parts;
        }
        /**
         * Create parts for a text-position binding.
         * @param templateFactory
         */
        handleTextExpression(options) {
            return new NodePart(options);
        }
    }
    const defaultTemplateProcessor = new DefaultTemplateProcessor();

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    // IMPORTANT: do not change the property name or the assignment expression.
    // This line will be used in regexes to search for lit-html usage.
    // TODO(justinfagnani): inject version number at build time
    if (typeof window !== 'undefined') {
        (window['litHtmlVersions'] || (window['litHtmlVersions'] = [])).push('1.4.1');
    }
    /**
     * Interprets a template literal as an HTML template that can efficiently
     * render to and update a container.
     */
    const html = (strings, ...values) => new TemplateResult(strings, values, 'html', defaultTemplateProcessor);

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    // Get a key to lookup in `templateCaches`.
    const getTemplateCacheKey = (type, scopeName) => `${type}--${scopeName}`;
    let compatibleShadyCSSVersion = true;
    if (typeof window.ShadyCSS === 'undefined') {
        compatibleShadyCSSVersion = false;
    }
    else if (typeof window.ShadyCSS.prepareTemplateDom === 'undefined') {
        console.warn(`Incompatible ShadyCSS version detected. ` +
            `Please update to at least @webcomponents/webcomponentsjs@2.0.2 and ` +
            `@webcomponents/shadycss@1.3.1.`);
        compatibleShadyCSSVersion = false;
    }
    /**
     * Template factory which scopes template DOM using ShadyCSS.
     * @param scopeName {string}
     */
    const shadyTemplateFactory = (scopeName) => (result) => {
        const cacheKey = getTemplateCacheKey(result.type, scopeName);
        let templateCache = templateCaches.get(cacheKey);
        if (templateCache === undefined) {
            templateCache = {
                stringsArray: new WeakMap(),
                keyString: new Map()
            };
            templateCaches.set(cacheKey, templateCache);
        }
        let template = templateCache.stringsArray.get(result.strings);
        if (template !== undefined) {
            return template;
        }
        const key = result.strings.join(marker);
        template = templateCache.keyString.get(key);
        if (template === undefined) {
            const element = result.getTemplateElement();
            if (compatibleShadyCSSVersion) {
                window.ShadyCSS.prepareTemplateDom(element, scopeName);
            }
            template = new Template(result, element);
            templateCache.keyString.set(key, template);
        }
        templateCache.stringsArray.set(result.strings, template);
        return template;
    };
    const TEMPLATE_TYPES = ['html', 'svg'];
    /**
     * Removes all style elements from Templates for the given scopeName.
     */
    const removeStylesFromLitTemplates = (scopeName) => {
        TEMPLATE_TYPES.forEach((type) => {
            const templates = templateCaches.get(getTemplateCacheKey(type, scopeName));
            if (templates !== undefined) {
                templates.keyString.forEach((template) => {
                    const { element: { content } } = template;
                    // IE 11 doesn't support the iterable param Set constructor
                    const styles = new Set();
                    Array.from(content.querySelectorAll('style')).forEach((s) => {
                        styles.add(s);
                    });
                    removeNodesFromTemplate(template, styles);
                });
            }
        });
    };
    const shadyRenderSet = new Set();
    /**
     * For the given scope name, ensures that ShadyCSS style scoping is performed.
     * This is done just once per scope name so the fragment and template cannot
     * be modified.
     * (1) extracts styles from the rendered fragment and hands them to ShadyCSS
     * to be scoped and appended to the document
     * (2) removes style elements from all lit-html Templates for this scope name.
     *
     * Note, <style> elements can only be placed into templates for the
     * initial rendering of the scope. If <style> elements are included in templates
     * dynamically rendered to the scope (after the first scope render), they will
     * not be scoped and the <style> will be left in the template and rendered
     * output.
     */
    const prepareTemplateStyles = (scopeName, renderedDOM, template) => {
        shadyRenderSet.add(scopeName);
        // If `renderedDOM` is stamped from a Template, then we need to edit that
        // Template's underlying template element. Otherwise, we create one here
        // to give to ShadyCSS, which still requires one while scoping.
        const templateElement = !!template ? template.element : document.createElement('template');
        // Move styles out of rendered DOM and store.
        const styles = renderedDOM.querySelectorAll('style');
        const { length } = styles;
        // If there are no styles, skip unnecessary work
        if (length === 0) {
            // Ensure prepareTemplateStyles is called to support adding
            // styles via `prepareAdoptedCssText` since that requires that
            // `prepareTemplateStyles` is called.
            //
            // ShadyCSS will only update styles containing @apply in the template
            // given to `prepareTemplateStyles`. If no lit Template was given,
            // ShadyCSS will not be able to update uses of @apply in any relevant
            // template. However, this is not a problem because we only create the
            // template for the purpose of supporting `prepareAdoptedCssText`,
            // which doesn't support @apply at all.
            window.ShadyCSS.prepareTemplateStyles(templateElement, scopeName);
            return;
        }
        const condensedStyle = document.createElement('style');
        // Collect styles into a single style. This helps us make sure ShadyCSS
        // manipulations will not prevent us from being able to fix up template
        // part indices.
        // NOTE: collecting styles is inefficient for browsers but ShadyCSS
        // currently does this anyway. When it does not, this should be changed.
        for (let i = 0; i < length; i++) {
            const style = styles[i];
            style.parentNode.removeChild(style);
            condensedStyle.textContent += style.textContent;
        }
        // Remove styles from nested templates in this scope.
        removeStylesFromLitTemplates(scopeName);
        // And then put the condensed style into the "root" template passed in as
        // `template`.
        const content = templateElement.content;
        if (!!template) {
            insertNodeIntoTemplate(template, condensedStyle, content.firstChild);
        }
        else {
            content.insertBefore(condensedStyle, content.firstChild);
        }
        // Note, it's important that ShadyCSS gets the template that `lit-html`
        // will actually render so that it can update the style inside when
        // needed (e.g. @apply native Shadow DOM case).
        window.ShadyCSS.prepareTemplateStyles(templateElement, scopeName);
        const style = content.querySelector('style');
        if (window.ShadyCSS.nativeShadow && style !== null) {
            // When in native Shadow DOM, ensure the style created by ShadyCSS is
            // included in initially rendered output (`renderedDOM`).
            renderedDOM.insertBefore(style.cloneNode(true), renderedDOM.firstChild);
        }
        else if (!!template) {
            // When no style is left in the template, parts will be broken as a
            // result. To fix this, we put back the style node ShadyCSS removed
            // and then tell lit to remove that node from the template.
            // There can be no style in the template in 2 cases (1) when Shady DOM
            // is in use, ShadyCSS removes all styles, (2) when native Shadow DOM
            // is in use ShadyCSS removes the style if it contains no content.
            // NOTE, ShadyCSS creates its own style so we can safely add/remove
            // `condensedStyle` here.
            content.insertBefore(condensedStyle, content.firstChild);
            const removes = new Set();
            removes.add(condensedStyle);
            removeNodesFromTemplate(template, removes);
        }
    };
    /**
     * Extension to the standard `render` method which supports rendering
     * to ShadowRoots when the ShadyDOM (https://github.com/webcomponents/shadydom)
     * and ShadyCSS (https://github.com/webcomponents/shadycss) polyfills are used
     * or when the webcomponentsjs
     * (https://github.com/webcomponents/webcomponentsjs) polyfill is used.
     *
     * Adds a `scopeName` option which is used to scope element DOM and stylesheets
     * when native ShadowDOM is unavailable. The `scopeName` will be added to
     * the class attribute of all rendered DOM. In addition, any style elements will
     * be automatically re-written with this `scopeName` selector and moved out
     * of the rendered DOM and into the document `<head>`.
     *
     * It is common to use this render method in conjunction with a custom element
     * which renders a shadowRoot. When this is done, typically the element's
     * `localName` should be used as the `scopeName`.
     *
     * In addition to DOM scoping, ShadyCSS also supports a basic shim for css
     * custom properties (needed only on older browsers like IE11) and a shim for
     * a deprecated feature called `@apply` that supports applying a set of css
     * custom properties to a given location.
     *
     * Usage considerations:
     *
     * * Part values in `<style>` elements are only applied the first time a given
     * `scopeName` renders. Subsequent changes to parts in style elements will have
     * no effect. Because of this, parts in style elements should only be used for
     * values that will never change, for example parts that set scope-wide theme
     * values or parts which render shared style elements.
     *
     * * Note, due to a limitation of the ShadyDOM polyfill, rendering in a
     * custom element's `constructor` is not supported. Instead rendering should
     * either done asynchronously, for example at microtask timing (for example
     * `Promise.resolve()`), or be deferred until the first time the element's
     * `connectedCallback` runs.
     *
     * Usage considerations when using shimmed custom properties or `@apply`:
     *
     * * Whenever any dynamic changes are made which affect
     * css custom properties, `ShadyCSS.styleElement(element)` must be called
     * to update the element. There are two cases when this is needed:
     * (1) the element is connected to a new parent, (2) a class is added to the
     * element that causes it to match different custom properties.
     * To address the first case when rendering a custom element, `styleElement`
     * should be called in the element's `connectedCallback`.
     *
     * * Shimmed custom properties may only be defined either for an entire
     * shadowRoot (for example, in a `:host` rule) or via a rule that directly
     * matches an element with a shadowRoot. In other words, instead of flowing from
     * parent to child as do native css custom properties, shimmed custom properties
     * flow only from shadowRoots to nested shadowRoots.
     *
     * * When using `@apply` mixing css shorthand property names with
     * non-shorthand names (for example `border` and `border-width`) is not
     * supported.
     */
    const render = (result, container, options) => {
        if (!options || typeof options !== 'object' || !options.scopeName) {
            throw new Error('The `scopeName` option is required.');
        }
        const scopeName = options.scopeName;
        const hasRendered = parts.has(container);
        const needsScoping = compatibleShadyCSSVersion &&
            container.nodeType === 11 /* Node.DOCUMENT_FRAGMENT_NODE */ &&
            !!container.host;
        // Handle first render to a scope specially...
        const firstScopeRender = needsScoping && !shadyRenderSet.has(scopeName);
        // On first scope render, render into a fragment; this cannot be a single
        // fragment that is reused since nested renders can occur synchronously.
        const renderContainer = firstScopeRender ? document.createDocumentFragment() : container;
        render$1(result, renderContainer, Object.assign({ templateFactory: shadyTemplateFactory(scopeName) }, options));
        // When performing first scope render,
        // (1) We've rendered into a fragment so that there's a chance to
        // `prepareTemplateStyles` before sub-elements hit the DOM
        // (which might cause them to render based on a common pattern of
        // rendering in a custom element's `connectedCallback`);
        // (2) Scope the template with ShadyCSS one time only for this scope.
        // (3) Render the fragment into the container and make sure the
        // container knows its `part` is the one we just rendered. This ensures
        // DOM will be re-used on subsequent renders.
        if (firstScopeRender) {
            const part = parts.get(renderContainer);
            parts.delete(renderContainer);
            // ShadyCSS might have style sheets (e.g. from `prepareAdoptedCssText`)
            // that should apply to `renderContainer` even if the rendered value is
            // not a TemplateInstance. However, it will only insert scoped styles
            // into the document if `prepareTemplateStyles` has already been called
            // for the given scope name.
            const template = part.value instanceof TemplateInstance ?
                part.value.template :
                undefined;
            prepareTemplateStyles(scopeName, renderContainer, template);
            removeNodes(container, container.firstChild);
            container.appendChild(renderContainer);
            parts.set(container, part);
        }
        // After elements have hit the DOM, update styling if this is the
        // initial render to this container.
        // This is needed whenever dynamic changes are made so it would be
        // safest to do every render; however, this would regress performance
        // so we leave it up to the user to call `ShadyCSS.styleElement`
        // for dynamic changes.
        if (!hasRendered && needsScoping) {
            window.ShadyCSS.styleElement(container.host);
        }
    };

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    var _a;
    /**
     * Use this module if you want to create your own base class extending
     * [[UpdatingElement]].
     * @packageDocumentation
     */
    /*
     * When using Closure Compiler, JSCompiler_renameProperty(property, object) is
     * replaced at compile time by the munged name for object[property]. We cannot
     * alias this function, so we have to use a small shim that has the same
     * behavior when not compiling.
     */
    window.JSCompiler_renameProperty =
        (prop, _obj) => prop;
    const defaultConverter = {
        toAttribute(value, type) {
            switch (type) {
                case Boolean:
                    return value ? '' : null;
                case Object:
                case Array:
                    // if the value is `null` or `undefined` pass this through
                    // to allow removing/no change behavior.
                    return value == null ? value : JSON.stringify(value);
            }
            return value;
        },
        fromAttribute(value, type) {
            switch (type) {
                case Boolean:
                    return value !== null;
                case Number:
                    return value === null ? null : Number(value);
                case Object:
                case Array:
                    // Type assert to adhere to Bazel's "must type assert JSON parse" rule.
                    return JSON.parse(value);
            }
            return value;
        }
    };
    /**
     * Change function that returns true if `value` is different from `oldValue`.
     * This method is used as the default for a property's `hasChanged` function.
     */
    const notEqual = (value, old) => {
        // This ensures (old==NaN, value==NaN) always returns false
        return old !== value && (old === old || value === value);
    };
    const defaultPropertyDeclaration = {
        attribute: true,
        type: String,
        converter: defaultConverter,
        reflect: false,
        hasChanged: notEqual
    };
    const STATE_HAS_UPDATED = 1;
    const STATE_UPDATE_REQUESTED = 1 << 2;
    const STATE_IS_REFLECTING_TO_ATTRIBUTE = 1 << 3;
    const STATE_IS_REFLECTING_TO_PROPERTY = 1 << 4;
    /**
     * The Closure JS Compiler doesn't currently have good support for static
     * property semantics where "this" is dynamic (e.g.
     * https://github.com/google/closure-compiler/issues/3177 and others) so we use
     * this hack to bypass any rewriting by the compiler.
     */
    const finalized = 'finalized';
    /**
     * Base element class which manages element properties and attributes. When
     * properties change, the `update` method is asynchronously called. This method
     * should be supplied by subclassers to render updates as desired.
     * @noInheritDoc
     */
    class UpdatingElement extends HTMLElement {
        constructor() {
            super();
            this.initialize();
        }
        /**
         * Returns a list of attributes corresponding to the registered properties.
         * @nocollapse
         */
        static get observedAttributes() {
            // note: piggy backing on this to ensure we're finalized.
            this.finalize();
            const attributes = [];
            // Use forEach so this works even if for/of loops are compiled to for loops
            // expecting arrays
            this._classProperties.forEach((v, p) => {
                const attr = this._attributeNameForProperty(p, v);
                if (attr !== undefined) {
                    this._attributeToPropertyMap.set(attr, p);
                    attributes.push(attr);
                }
            });
            return attributes;
        }
        /**
         * Ensures the private `_classProperties` property metadata is created.
         * In addition to `finalize` this is also called in `createProperty` to
         * ensure the `@property` decorator can add property metadata.
         */
        /** @nocollapse */
        static _ensureClassProperties() {
            // ensure private storage for property declarations.
            if (!this.hasOwnProperty(JSCompiler_renameProperty('_classProperties', this))) {
                this._classProperties = new Map();
                // NOTE: Workaround IE11 not supporting Map constructor argument.
                const superProperties = Object.getPrototypeOf(this)._classProperties;
                if (superProperties !== undefined) {
                    superProperties.forEach((v, k) => this._classProperties.set(k, v));
                }
            }
        }
        /**
         * Creates a property accessor on the element prototype if one does not exist
         * and stores a PropertyDeclaration for the property with the given options.
         * The property setter calls the property's `hasChanged` property option
         * or uses a strict identity check to determine whether or not to request
         * an update.
         *
         * This method may be overridden to customize properties; however,
         * when doing so, it's important to call `super.createProperty` to ensure
         * the property is setup correctly. This method calls
         * `getPropertyDescriptor` internally to get a descriptor to install.
         * To customize what properties do when they are get or set, override
         * `getPropertyDescriptor`. To customize the options for a property,
         * implement `createProperty` like this:
         *
         * static createProperty(name, options) {
         *   options = Object.assign(options, {myOption: true});
         *   super.createProperty(name, options);
         * }
         *
         * @nocollapse
         */
        static createProperty(name, options = defaultPropertyDeclaration) {
            // Note, since this can be called by the `@property` decorator which
            // is called before `finalize`, we ensure storage exists for property
            // metadata.
            this._ensureClassProperties();
            this._classProperties.set(name, options);
            // Do not generate an accessor if the prototype already has one, since
            // it would be lost otherwise and that would never be the user's intention;
            // Instead, we expect users to call `requestUpdate` themselves from
            // user-defined accessors. Note that if the super has an accessor we will
            // still overwrite it
            if (options.noAccessor || this.prototype.hasOwnProperty(name)) {
                return;
            }
            const key = typeof name === 'symbol' ? Symbol() : `__${name}`;
            const descriptor = this.getPropertyDescriptor(name, key, options);
            if (descriptor !== undefined) {
                Object.defineProperty(this.prototype, name, descriptor);
            }
        }
        /**
         * Returns a property descriptor to be defined on the given named property.
         * If no descriptor is returned, the property will not become an accessor.
         * For example,
         *
         *   class MyElement extends LitElement {
         *     static getPropertyDescriptor(name, key, options) {
         *       const defaultDescriptor =
         *           super.getPropertyDescriptor(name, key, options);
         *       const setter = defaultDescriptor.set;
         *       return {
         *         get: defaultDescriptor.get,
         *         set(value) {
         *           setter.call(this, value);
         *           // custom action.
         *         },
         *         configurable: true,
         *         enumerable: true
         *       }
         *     }
         *   }
         *
         * @nocollapse
         */
        static getPropertyDescriptor(name, key, options) {
            return {
                // tslint:disable-next-line:no-any no symbol in index
                get() {
                    return this[key];
                },
                set(value) {
                    const oldValue = this[name];
                    this[key] = value;
                    this
                        .requestUpdateInternal(name, oldValue, options);
                },
                configurable: true,
                enumerable: true
            };
        }
        /**
         * Returns the property options associated with the given property.
         * These options are defined with a PropertyDeclaration via the `properties`
         * object or the `@property` decorator and are registered in
         * `createProperty(...)`.
         *
         * Note, this method should be considered "final" and not overridden. To
         * customize the options for a given property, override `createProperty`.
         *
         * @nocollapse
         * @final
         */
        static getPropertyOptions(name) {
            return this._classProperties && this._classProperties.get(name) ||
                defaultPropertyDeclaration;
        }
        /**
         * Creates property accessors for registered properties and ensures
         * any superclasses are also finalized.
         * @nocollapse
         */
        static finalize() {
            // finalize any superclasses
            const superCtor = Object.getPrototypeOf(this);
            if (!superCtor.hasOwnProperty(finalized)) {
                superCtor.finalize();
            }
            this[finalized] = true;
            this._ensureClassProperties();
            // initialize Map populated in observedAttributes
            this._attributeToPropertyMap = new Map();
            // make any properties
            // Note, only process "own" properties since this element will inherit
            // any properties defined on the superClass, and finalization ensures
            // the entire prototype chain is finalized.
            if (this.hasOwnProperty(JSCompiler_renameProperty('properties', this))) {
                const props = this.properties;
                // support symbols in properties (IE11 does not support this)
                const propKeys = [
                    ...Object.getOwnPropertyNames(props),
                    ...(typeof Object.getOwnPropertySymbols === 'function') ?
                        Object.getOwnPropertySymbols(props) :
                        []
                ];
                // This for/of is ok because propKeys is an array
                for (const p of propKeys) {
                    // note, use of `any` is due to TypeSript lack of support for symbol in
                    // index types
                    // tslint:disable-next-line:no-any no symbol in index
                    this.createProperty(p, props[p]);
                }
            }
        }
        /**
         * Returns the property name for the given attribute `name`.
         * @nocollapse
         */
        static _attributeNameForProperty(name, options) {
            const attribute = options.attribute;
            return attribute === false ?
                undefined :
                (typeof attribute === 'string' ?
                    attribute :
                    (typeof name === 'string' ? name.toLowerCase() : undefined));
        }
        /**
         * Returns true if a property should request an update.
         * Called when a property value is set and uses the `hasChanged`
         * option for the property if present or a strict identity check.
         * @nocollapse
         */
        static _valueHasChanged(value, old, hasChanged = notEqual) {
            return hasChanged(value, old);
        }
        /**
         * Returns the property value for the given attribute value.
         * Called via the `attributeChangedCallback` and uses the property's
         * `converter` or `converter.fromAttribute` property option.
         * @nocollapse
         */
        static _propertyValueFromAttribute(value, options) {
            const type = options.type;
            const converter = options.converter || defaultConverter;
            const fromAttribute = (typeof converter === 'function' ? converter : converter.fromAttribute);
            return fromAttribute ? fromAttribute(value, type) : value;
        }
        /**
         * Returns the attribute value for the given property value. If this
         * returns undefined, the property will *not* be reflected to an attribute.
         * If this returns null, the attribute will be removed, otherwise the
         * attribute will be set to the value.
         * This uses the property's `reflect` and `type.toAttribute` property options.
         * @nocollapse
         */
        static _propertyValueToAttribute(value, options) {
            if (options.reflect === undefined) {
                return;
            }
            const type = options.type;
            const converter = options.converter;
            const toAttribute = converter && converter.toAttribute ||
                defaultConverter.toAttribute;
            return toAttribute(value, type);
        }
        /**
         * Performs element initialization. By default captures any pre-set values for
         * registered properties.
         */
        initialize() {
            this._updateState = 0;
            this._updatePromise =
                new Promise((res) => this._enableUpdatingResolver = res);
            this._changedProperties = new Map();
            this._saveInstanceProperties();
            // ensures first update will be caught by an early access of
            // `updateComplete`
            this.requestUpdateInternal();
        }
        /**
         * Fixes any properties set on the instance before upgrade time.
         * Otherwise these would shadow the accessor and break these properties.
         * The properties are stored in a Map which is played back after the
         * constructor runs. Note, on very old versions of Safari (<=9) or Chrome
         * (<=41), properties created for native platform properties like (`id` or
         * `name`) may not have default values set in the element constructor. On
         * these browsers native properties appear on instances and therefore their
         * default value will overwrite any element default (e.g. if the element sets
         * this.id = 'id' in the constructor, the 'id' will become '' since this is
         * the native platform default).
         */
        _saveInstanceProperties() {
            // Use forEach so this works even if for/of loops are compiled to for loops
            // expecting arrays
            this.constructor
                ._classProperties.forEach((_v, p) => {
                if (this.hasOwnProperty(p)) {
                    const value = this[p];
                    delete this[p];
                    if (!this._instanceProperties) {
                        this._instanceProperties = new Map();
                    }
                    this._instanceProperties.set(p, value);
                }
            });
        }
        /**
         * Applies previously saved instance properties.
         */
        _applyInstanceProperties() {
            // Use forEach so this works even if for/of loops are compiled to for loops
            // expecting arrays
            // tslint:disable-next-line:no-any
            this._instanceProperties.forEach((v, p) => this[p] = v);
            this._instanceProperties = undefined;
        }
        connectedCallback() {
            // Ensure first connection completes an update. Updates cannot complete
            // before connection.
            this.enableUpdating();
        }
        enableUpdating() {
            if (this._enableUpdatingResolver !== undefined) {
                this._enableUpdatingResolver();
                this._enableUpdatingResolver = undefined;
            }
        }
        /**
         * Allows for `super.disconnectedCallback()` in extensions while
         * reserving the possibility of making non-breaking feature additions
         * when disconnecting at some point in the future.
         */
        disconnectedCallback() {
        }
        /**
         * Synchronizes property values when attributes change.
         */
        attributeChangedCallback(name, old, value) {
            if (old !== value) {
                this._attributeToProperty(name, value);
            }
        }
        _propertyToAttribute(name, value, options = defaultPropertyDeclaration) {
            const ctor = this.constructor;
            const attr = ctor._attributeNameForProperty(name, options);
            if (attr !== undefined) {
                const attrValue = ctor._propertyValueToAttribute(value, options);
                // an undefined value does not change the attribute.
                if (attrValue === undefined) {
                    return;
                }
                // Track if the property is being reflected to avoid
                // setting the property again via `attributeChangedCallback`. Note:
                // 1. this takes advantage of the fact that the callback is synchronous.
                // 2. will behave incorrectly if multiple attributes are in the reaction
                // stack at time of calling. However, since we process attributes
                // in `update` this should not be possible (or an extreme corner case
                // that we'd like to discover).
                // mark state reflecting
                this._updateState = this._updateState | STATE_IS_REFLECTING_TO_ATTRIBUTE;
                if (attrValue == null) {
                    this.removeAttribute(attr);
                }
                else {
                    this.setAttribute(attr, attrValue);
                }
                // mark state not reflecting
                this._updateState = this._updateState & ~STATE_IS_REFLECTING_TO_ATTRIBUTE;
            }
        }
        _attributeToProperty(name, value) {
            // Use tracking info to avoid deserializing attribute value if it was
            // just set from a property setter.
            if (this._updateState & STATE_IS_REFLECTING_TO_ATTRIBUTE) {
                return;
            }
            const ctor = this.constructor;
            // Note, hint this as an `AttributeMap` so closure clearly understands
            // the type; it has issues with tracking types through statics
            // tslint:disable-next-line:no-unnecessary-type-assertion
            const propName = ctor._attributeToPropertyMap.get(name);
            if (propName !== undefined) {
                const options = ctor.getPropertyOptions(propName);
                // mark state reflecting
                this._updateState = this._updateState | STATE_IS_REFLECTING_TO_PROPERTY;
                this[propName] =
                    // tslint:disable-next-line:no-any
                    ctor._propertyValueFromAttribute(value, options);
                // mark state not reflecting
                this._updateState = this._updateState & ~STATE_IS_REFLECTING_TO_PROPERTY;
            }
        }
        /**
         * This protected version of `requestUpdate` does not access or return the
         * `updateComplete` promise. This promise can be overridden and is therefore
         * not free to access.
         */
        requestUpdateInternal(name, oldValue, options) {
            let shouldRequestUpdate = true;
            // If we have a property key, perform property update steps.
            if (name !== undefined) {
                const ctor = this.constructor;
                options = options || ctor.getPropertyOptions(name);
                if (ctor._valueHasChanged(this[name], oldValue, options.hasChanged)) {
                    if (!this._changedProperties.has(name)) {
                        this._changedProperties.set(name, oldValue);
                    }
                    // Add to reflecting properties set.
                    // Note, it's important that every change has a chance to add the
                    // property to `_reflectingProperties`. This ensures setting
                    // attribute + property reflects correctly.
                    if (options.reflect === true &&
                        !(this._updateState & STATE_IS_REFLECTING_TO_PROPERTY)) {
                        if (this._reflectingProperties === undefined) {
                            this._reflectingProperties = new Map();
                        }
                        this._reflectingProperties.set(name, options);
                    }
                }
                else {
                    // Abort the request if the property should not be considered changed.
                    shouldRequestUpdate = false;
                }
            }
            if (!this._hasRequestedUpdate && shouldRequestUpdate) {
                this._updatePromise = this._enqueueUpdate();
            }
        }
        /**
         * Requests an update which is processed asynchronously. This should
         * be called when an element should update based on some state not triggered
         * by setting a property. In this case, pass no arguments. It should also be
         * called when manually implementing a property setter. In this case, pass the
         * property `name` and `oldValue` to ensure that any configured property
         * options are honored. Returns the `updateComplete` Promise which is resolved
         * when the update completes.
         *
         * @param name {PropertyKey} (optional) name of requesting property
         * @param oldValue {any} (optional) old value of requesting property
         * @returns {Promise} A Promise that is resolved when the update completes.
         */
        requestUpdate(name, oldValue) {
            this.requestUpdateInternal(name, oldValue);
            return this.updateComplete;
        }
        /**
         * Sets up the element to asynchronously update.
         */
        async _enqueueUpdate() {
            this._updateState = this._updateState | STATE_UPDATE_REQUESTED;
            try {
                // Ensure any previous update has resolved before updating.
                // This `await` also ensures that property changes are batched.
                await this._updatePromise;
            }
            catch (e) {
                // Ignore any previous errors. We only care that the previous cycle is
                // done. Any error should have been handled in the previous update.
            }
            const result = this.performUpdate();
            // If `performUpdate` returns a Promise, we await it. This is done to
            // enable coordinating updates with a scheduler. Note, the result is
            // checked to avoid delaying an additional microtask unless we need to.
            if (result != null) {
                await result;
            }
            return !this._hasRequestedUpdate;
        }
        get _hasRequestedUpdate() {
            return (this._updateState & STATE_UPDATE_REQUESTED);
        }
        get hasUpdated() {
            return (this._updateState & STATE_HAS_UPDATED);
        }
        /**
         * Performs an element update. Note, if an exception is thrown during the
         * update, `firstUpdated` and `updated` will not be called.
         *
         * You can override this method to change the timing of updates. If this
         * method is overridden, `super.performUpdate()` must be called.
         *
         * For instance, to schedule updates to occur just before the next frame:
         *
         * ```
         * protected async performUpdate(): Promise<unknown> {
         *   await new Promise((resolve) => requestAnimationFrame(() => resolve()));
         *   super.performUpdate();
         * }
         * ```
         */
        performUpdate() {
            // Abort any update if one is not pending when this is called.
            // This can happen if `performUpdate` is called early to "flush"
            // the update.
            if (!this._hasRequestedUpdate) {
                return;
            }
            // Mixin instance properties once, if they exist.
            if (this._instanceProperties) {
                this._applyInstanceProperties();
            }
            let shouldUpdate = false;
            const changedProperties = this._changedProperties;
            try {
                shouldUpdate = this.shouldUpdate(changedProperties);
                if (shouldUpdate) {
                    this.update(changedProperties);
                }
                else {
                    this._markUpdated();
                }
            }
            catch (e) {
                // Prevent `firstUpdated` and `updated` from running when there's an
                // update exception.
                shouldUpdate = false;
                // Ensure element can accept additional updates after an exception.
                this._markUpdated();
                throw e;
            }
            if (shouldUpdate) {
                if (!(this._updateState & STATE_HAS_UPDATED)) {
                    this._updateState = this._updateState | STATE_HAS_UPDATED;
                    this.firstUpdated(changedProperties);
                }
                this.updated(changedProperties);
            }
        }
        _markUpdated() {
            this._changedProperties = new Map();
            this._updateState = this._updateState & ~STATE_UPDATE_REQUESTED;
        }
        /**
         * Returns a Promise that resolves when the element has completed updating.
         * The Promise value is a boolean that is `true` if the element completed the
         * update without triggering another update. The Promise result is `false` if
         * a property was set inside `updated()`. If the Promise is rejected, an
         * exception was thrown during the update.
         *
         * To await additional asynchronous work, override the `_getUpdateComplete`
         * method. For example, it is sometimes useful to await a rendered element
         * before fulfilling this Promise. To do this, first await
         * `super._getUpdateComplete()`, then any subsequent state.
         *
         * @returns {Promise} The Promise returns a boolean that indicates if the
         * update resolved without triggering another update.
         */
        get updateComplete() {
            return this._getUpdateComplete();
        }
        /**
         * Override point for the `updateComplete` promise.
         *
         * It is not safe to override the `updateComplete` getter directly due to a
         * limitation in TypeScript which means it is not possible to call a
         * superclass getter (e.g. `super.updateComplete.then(...)`) when the target
         * language is ES5 (https://github.com/microsoft/TypeScript/issues/338).
         * This method should be overridden instead. For example:
         *
         *   class MyElement extends LitElement {
         *     async _getUpdateComplete() {
         *       await super._getUpdateComplete();
         *       await this._myChild.updateComplete;
         *     }
         *   }
         * @deprecated Override `getUpdateComplete()` instead for forward
         *     compatibility with `lit-element` 3.0 / `@lit/reactive-element`.
         */
        _getUpdateComplete() {
            return this.getUpdateComplete();
        }
        /**
         * Override point for the `updateComplete` promise.
         *
         * It is not safe to override the `updateComplete` getter directly due to a
         * limitation in TypeScript which means it is not possible to call a
         * superclass getter (e.g. `super.updateComplete.then(...)`) when the target
         * language is ES5 (https://github.com/microsoft/TypeScript/issues/338).
         * This method should be overridden instead. For example:
         *
         *   class MyElement extends LitElement {
         *     async getUpdateComplete() {
         *       await super.getUpdateComplete();
         *       await this._myChild.updateComplete;
         *     }
         *   }
         */
        getUpdateComplete() {
            return this._updatePromise;
        }
        /**
         * Controls whether or not `update` should be called when the element requests
         * an update. By default, this method always returns `true`, but this can be
         * customized to control when to update.
         *
         * @param _changedProperties Map of changed properties with old values
         */
        shouldUpdate(_changedProperties) {
            return true;
        }
        /**
         * Updates the element. This method reflects property values to attributes.
         * It can be overridden to render and keep updated element DOM.
         * Setting properties inside this method will *not* trigger
         * another update.
         *
         * @param _changedProperties Map of changed properties with old values
         */
        update(_changedProperties) {
            if (this._reflectingProperties !== undefined &&
                this._reflectingProperties.size > 0) {
                // Use forEach so this works even if for/of loops are compiled to for
                // loops expecting arrays
                this._reflectingProperties.forEach((v, k) => this._propertyToAttribute(k, this[k], v));
                this._reflectingProperties = undefined;
            }
            this._markUpdated();
        }
        /**
         * Invoked whenever the element is updated. Implement to perform
         * post-updating tasks via DOM APIs, for example, focusing an element.
         *
         * Setting properties inside this method will trigger the element to update
         * again after this update cycle completes.
         *
         * @param _changedProperties Map of changed properties with old values
         */
        updated(_changedProperties) {
        }
        /**
         * Invoked when the element is first updated. Implement to perform one time
         * work on the element after update.
         *
         * Setting properties inside this method will trigger the element to update
         * again after this update cycle completes.
         *
         * @param _changedProperties Map of changed properties with old values
         */
        firstUpdated(_changedProperties) {
        }
    }
    _a = finalized;
    /**
     * Marks class as having finished creating properties.
     */
    UpdatingElement[_a] = true;

    /**
    @license
    Copyright (c) 2019 The Polymer Project Authors. All rights reserved.
    This code may only be used under the BSD style license found at
    http://polymer.github.io/LICENSE.txt The complete set of authors may be found at
    http://polymer.github.io/AUTHORS.txt The complete set of contributors may be
    found at http://polymer.github.io/CONTRIBUTORS.txt Code distributed by Google as
    part of the polymer project is also subject to an additional IP rights grant
    found at http://polymer.github.io/PATENTS.txt
    */
    /**
     * Whether the current browser supports `adoptedStyleSheets`.
     */
    const supportsAdoptingStyleSheets = (window.ShadowRoot) &&
        (window.ShadyCSS === undefined || window.ShadyCSS.nativeShadow) &&
        ('adoptedStyleSheets' in Document.prototype) &&
        ('replace' in CSSStyleSheet.prototype);
    const constructionToken = Symbol();
    class CSSResult {
        constructor(cssText, safeToken) {
            if (safeToken !== constructionToken) {
                throw new Error('CSSResult is not constructable. Use `unsafeCSS` or `css` instead.');
            }
            this.cssText = cssText;
        }
        // Note, this is a getter so that it's lazy. In practice, this means
        // stylesheets are not created until the first element instance is made.
        get styleSheet() {
            if (this._styleSheet === undefined) {
                // Note, if `supportsAdoptingStyleSheets` is true then we assume
                // CSSStyleSheet is constructable.
                if (supportsAdoptingStyleSheets) {
                    this._styleSheet = new CSSStyleSheet();
                    this._styleSheet.replaceSync(this.cssText);
                }
                else {
                    this._styleSheet = null;
                }
            }
            return this._styleSheet;
        }
        toString() {
            return this.cssText;
        }
    }
    /**
     * Wrap a value for interpolation in a [[`css`]] tagged template literal.
     *
     * This is unsafe because untrusted CSS text can be used to phone home
     * or exfiltrate data to an attacker controlled site. Take care to only use
     * this with trusted input.
     */
    const unsafeCSS = (value) => {
        return new CSSResult(String(value), constructionToken);
    };
    const textFromCSSResult = (value) => {
        if (value instanceof CSSResult) {
            return value.cssText;
        }
        else if (typeof value === 'number') {
            return value;
        }
        else {
            throw new Error(`Value passed to 'css' function must be a 'css' function result: ${value}. Use 'unsafeCSS' to pass non-literal values, but
            take care to ensure page security.`);
        }
    };
    /**
     * Template tag which which can be used with LitElement's [[LitElement.styles |
     * `styles`]] property to set element styles. For security reasons, only literal
     * string values may be used. To incorporate non-literal values [[`unsafeCSS`]]
     * may be used inside a template string part.
     */
    const css = (strings, ...values) => {
        const cssText = values.reduce((acc, v, idx) => acc + textFromCSSResult(v) + strings[idx + 1], strings[0]);
        return new CSSResult(cssText, constructionToken);
    };

    /**
     * @license
     * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
     * This code may only be used under the BSD style license found at
     * http://polymer.github.io/LICENSE.txt
     * The complete set of authors may be found at
     * http://polymer.github.io/AUTHORS.txt
     * The complete set of contributors may be found at
     * http://polymer.github.io/CONTRIBUTORS.txt
     * Code distributed by Google as part of the polymer project is also
     * subject to an additional IP rights grant found at
     * http://polymer.github.io/PATENTS.txt
     */
    // IMPORTANT: do not change the property name or the assignment expression.
    // This line will be used in regexes to search for LitElement usage.
    // TODO(justinfagnani): inject version number at build time
    (window['litElementVersions'] || (window['litElementVersions'] = []))
        .push('2.5.1');
    /**
     * Sentinal value used to avoid calling lit-html's render function when
     * subclasses do not implement `render`
     */
    const renderNotImplemented = {};
    /**
     * Base element class that manages element properties and attributes, and
     * renders a lit-html template.
     *
     * To define a component, subclass `LitElement` and implement a
     * `render` method to provide the component's template. Define properties
     * using the [[`properties`]] property or the [[`property`]] decorator.
     */
    class LitElement extends UpdatingElement {
        /**
         * Return the array of styles to apply to the element.
         * Override this method to integrate into a style management system.
         *
         * @nocollapse
         */
        static getStyles() {
            return this.styles;
        }
        /** @nocollapse */
        static _getUniqueStyles() {
            // Only gather styles once per class
            if (this.hasOwnProperty(JSCompiler_renameProperty('_styles', this))) {
                return;
            }
            // Take care not to call `this.getStyles()` multiple times since this
            // generates new CSSResults each time.
            // TODO(sorvell): Since we do not cache CSSResults by input, any
            // shared styles will generate new stylesheet objects, which is wasteful.
            // This should be addressed when a browser ships constructable
            // stylesheets.
            const userStyles = this.getStyles();
            if (Array.isArray(userStyles)) {
                // De-duplicate styles preserving the _last_ instance in the set.
                // This is a performance optimization to avoid duplicated styles that can
                // occur especially when composing via subclassing.
                // The last item is kept to try to preserve the cascade order with the
                // assumption that it's most important that last added styles override
                // previous styles.
                const addStyles = (styles, set) => styles.reduceRight((set, s) => 
                // Note: On IE set.add() does not return the set
                Array.isArray(s) ? addStyles(s, set) : (set.add(s), set), set);
                // Array.from does not work on Set in IE, otherwise return
                // Array.from(addStyles(userStyles, new Set<CSSResult>())).reverse()
                const set = addStyles(userStyles, new Set());
                const styles = [];
                set.forEach((v) => styles.unshift(v));
                this._styles = styles;
            }
            else {
                this._styles = userStyles === undefined ? [] : [userStyles];
            }
            // Ensure that there are no invalid CSSStyleSheet instances here. They are
            // invalid in two conditions.
            // (1) the sheet is non-constructible (`sheet` of a HTMLStyleElement), but
            //     this is impossible to check except via .replaceSync or use
            // (2) the ShadyCSS polyfill is enabled (:. supportsAdoptingStyleSheets is
            //     false)
            this._styles = this._styles.map((s) => {
                if (s instanceof CSSStyleSheet && !supportsAdoptingStyleSheets) {
                    // Flatten the cssText from the passed constructible stylesheet (or
                    // undetectable non-constructible stylesheet). The user might have
                    // expected to update their stylesheets over time, but the alternative
                    // is a crash.
                    const cssText = Array.prototype.slice.call(s.cssRules)
                        .reduce((css, rule) => css + rule.cssText, '');
                    return unsafeCSS(cssText);
                }
                return s;
            });
        }
        /**
         * Performs element initialization. By default this calls
         * [[`createRenderRoot`]] to create the element [[`renderRoot`]] node and
         * captures any pre-set values for registered properties.
         */
        initialize() {
            super.initialize();
            this.constructor._getUniqueStyles();
            this.renderRoot = this.createRenderRoot();
            // Note, if renderRoot is not a shadowRoot, styles would/could apply to the
            // element's getRootNode(). While this could be done, we're choosing not to
            // support this now since it would require different logic around de-duping.
            if (window.ShadowRoot && this.renderRoot instanceof window.ShadowRoot) {
                this.adoptStyles();
            }
        }
        /**
         * Returns the node into which the element should render and by default
         * creates and returns an open shadowRoot. Implement to customize where the
         * element's DOM is rendered. For example, to render into the element's
         * childNodes, return `this`.
         * @returns {Element|DocumentFragment} Returns a node into which to render.
         */
        createRenderRoot() {
            return this.attachShadow(this.constructor.shadowRootOptions);
        }
        /**
         * Applies styling to the element shadowRoot using the [[`styles`]]
         * property. Styling will apply using `shadowRoot.adoptedStyleSheets` where
         * available and will fallback otherwise. When Shadow DOM is polyfilled,
         * ShadyCSS scopes styles and adds them to the document. When Shadow DOM
         * is available but `adoptedStyleSheets` is not, styles are appended to the
         * end of the `shadowRoot` to [mimic spec
         * behavior](https://wicg.github.io/construct-stylesheets/#using-constructed-stylesheets).
         */
        adoptStyles() {
            const styles = this.constructor._styles;
            if (styles.length === 0) {
                return;
            }
            // There are three separate cases here based on Shadow DOM support.
            // (1) shadowRoot polyfilled: use ShadyCSS
            // (2) shadowRoot.adoptedStyleSheets available: use it
            // (3) shadowRoot.adoptedStyleSheets polyfilled: append styles after
            // rendering
            if (window.ShadyCSS !== undefined && !window.ShadyCSS.nativeShadow) {
                window.ShadyCSS.ScopingShim.prepareAdoptedCssText(styles.map((s) => s.cssText), this.localName);
            }
            else if (supportsAdoptingStyleSheets) {
                this.renderRoot.adoptedStyleSheets =
                    styles.map((s) => s instanceof CSSStyleSheet ? s : s.styleSheet);
            }
            else {
                // This must be done after rendering so the actual style insertion is done
                // in `update`.
                this._needsShimAdoptedStyleSheets = true;
            }
        }
        connectedCallback() {
            super.connectedCallback();
            // Note, first update/render handles styleElement so we only call this if
            // connected after first update.
            if (this.hasUpdated && window.ShadyCSS !== undefined) {
                window.ShadyCSS.styleElement(this);
            }
        }
        /**
         * Updates the element. This method reflects property values to attributes
         * and calls `render` to render DOM via lit-html. Setting properties inside
         * this method will *not* trigger another update.
         * @param _changedProperties Map of changed properties with old values
         */
        update(changedProperties) {
            // Setting properties in `render` should not trigger an update. Since
            // updates are allowed after super.update, it's important to call `render`
            // before that.
            const templateResult = this.render();
            super.update(changedProperties);
            // If render is not implemented by the component, don't call lit-html render
            if (templateResult !== renderNotImplemented) {
                this.constructor
                    .render(templateResult, this.renderRoot, { scopeName: this.localName, eventContext: this });
            }
            // When native Shadow DOM is used but adoptedStyles are not supported,
            // insert styling after rendering to ensure adoptedStyles have highest
            // priority.
            if (this._needsShimAdoptedStyleSheets) {
                this._needsShimAdoptedStyleSheets = false;
                this.constructor._styles.forEach((s) => {
                    const style = document.createElement('style');
                    style.textContent = s.cssText;
                    this.renderRoot.appendChild(style);
                });
            }
        }
        /**
         * Invoked on each update to perform rendering tasks. This method may return
         * any value renderable by lit-html's `NodePart` - typically a
         * `TemplateResult`. Setting properties inside this method will *not* trigger
         * the element to update.
         */
        render() {
            return renderNotImplemented;
        }
    }
    /**
     * Ensure this class is marked as `finalized` as an optimization ensuring
     * it will not needlessly try to `finalize`.
     *
     * Note this property name is a string to prevent breaking Closure JS Compiler
     * optimizations. See updating-element.ts for more information.
     */
    LitElement['finalized'] = true;
    /**
     * Reference to the underlying library method used to render the element's
     * DOM. By default, points to the `render` method from lit-html's shady-render
     * module.
     *
     * **Most users will never need to touch this property.**
     *
     * This  property should not be confused with the `render` instance method,
     * which should be overridden to define a template for the element.
     *
     * Advanced users creating a new base class based on LitElement can override
     * this property to point to a custom render method with a signature that
     * matches [shady-render's `render`
     * method](https://lit-html.polymer-project.org/api/modules/shady_render.html#render).
     *
     * @nocollapse
     */
    LitElement.render = render;
    /** @nocollapse */
    LitElement.shadowRootOptions = { mode: 'open' };

    /* **********************************************
         Begin prism-core.js
    ********************************************** */

    /// <reference lib="WebWorker"/>

    var _self = (typeof window !== 'undefined')
    	? window   // if in browser
    	: (
    		(typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope)
    			? self // if in worker
    			: {}   // if in node js
    	);

    /**
     * Prism: Lightweight, robust, elegant syntax highlighting
     *
     * @license MIT <https://opensource.org/licenses/MIT>
     * @author Lea Verou <https://lea.verou.me>
     * @namespace
     * @public
     */
    var Prism$1 = (function (_self) {

    	// Private helper vars
    	var lang = /\blang(?:uage)?-([\w-]+)\b/i;
    	var uniqueId = 0;

    	// The grammar object for plaintext
    	var plainTextGrammar = {};


    	var _ = {
    		/**
    		 * By default, Prism will attempt to highlight all code elements (by calling {@link Prism.highlightAll}) on the
    		 * current page after the page finished loading. This might be a problem if e.g. you wanted to asynchronously load
    		 * additional languages or plugins yourself.
    		 *
    		 * By setting this value to `true`, Prism will not automatically highlight all code elements on the page.
    		 *
    		 * You obviously have to change this value before the automatic highlighting started. To do this, you can add an
    		 * empty Prism object into the global scope before loading the Prism script like this:
    		 *
    		 * ```js
    		 * window.Prism = window.Prism || {};
    		 * Prism.manual = true;
    		 * // add a new <script> to load Prism's script
    		 * ```
    		 *
    		 * @default false
    		 * @type {boolean}
    		 * @memberof Prism
    		 * @public
    		 */
    		manual: _self.Prism && _self.Prism.manual,
    		disableWorkerMessageHandler: _self.Prism && _self.Prism.disableWorkerMessageHandler,

    		/**
    		 * A namespace for utility methods.
    		 *
    		 * All function in this namespace that are not explicitly marked as _public_ are for __internal use only__ and may
    		 * change or disappear at any time.
    		 *
    		 * @namespace
    		 * @memberof Prism
    		 */
    		util: {
    			encode: function encode(tokens) {
    				if (tokens instanceof Token) {
    					return new Token(tokens.type, encode(tokens.content), tokens.alias);
    				} else if (Array.isArray(tokens)) {
    					return tokens.map(encode);
    				} else {
    					return tokens.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\u00a0/g, ' ');
    				}
    			},

    			/**
    			 * Returns the name of the type of the given value.
    			 *
    			 * @param {any} o
    			 * @returns {string}
    			 * @example
    			 * type(null)      === 'Null'
    			 * type(undefined) === 'Undefined'
    			 * type(123)       === 'Number'
    			 * type('foo')     === 'String'
    			 * type(true)      === 'Boolean'
    			 * type([1, 2])    === 'Array'
    			 * type({})        === 'Object'
    			 * type(String)    === 'Function'
    			 * type(/abc+/)    === 'RegExp'
    			 */
    			type: function (o) {
    				return Object.prototype.toString.call(o).slice(8, -1);
    			},

    			/**
    			 * Returns a unique number for the given object. Later calls will still return the same number.
    			 *
    			 * @param {Object} obj
    			 * @returns {number}
    			 */
    			objId: function (obj) {
    				if (!obj['__id']) {
    					Object.defineProperty(obj, '__id', { value: ++uniqueId });
    				}
    				return obj['__id'];
    			},

    			/**
    			 * Creates a deep clone of the given object.
    			 *
    			 * The main intended use of this function is to clone language definitions.
    			 *
    			 * @param {T} o
    			 * @param {Record<number, any>} [visited]
    			 * @returns {T}
    			 * @template T
    			 */
    			clone: function deepClone(o, visited) {
    				visited = visited || {};

    				var clone; var id;
    				switch (_.util.type(o)) {
    					case 'Object':
    						id = _.util.objId(o);
    						if (visited[id]) {
    							return visited[id];
    						}
    						clone = /** @type {Record<string, any>} */ ({});
    						visited[id] = clone;

    						for (var key in o) {
    							if (o.hasOwnProperty(key)) {
    								clone[key] = deepClone(o[key], visited);
    							}
    						}

    						return /** @type {any} */ (clone);

    					case 'Array':
    						id = _.util.objId(o);
    						if (visited[id]) {
    							return visited[id];
    						}
    						clone = [];
    						visited[id] = clone;

    						(/** @type {Array} */(/** @type {any} */(o))).forEach(function (v, i) {
    							clone[i] = deepClone(v, visited);
    						});

    						return /** @type {any} */ (clone);

    					default:
    						return o;
    				}
    			},

    			/**
    			 * Returns the Prism language of the given element set by a `language-xxxx` or `lang-xxxx` class.
    			 *
    			 * If no language is set for the element or the element is `null` or `undefined`, `none` will be returned.
    			 *
    			 * @param {Element} element
    			 * @returns {string}
    			 */
    			getLanguage: function (element) {
    				while (element && !lang.test(element.className)) {
    					element = element.parentElement;
    				}
    				if (element) {
    					return (element.className.match(lang) || [, 'none'])[1].toLowerCase();
    				}
    				return 'none';
    			},

    			/**
    			 * Returns the script element that is currently executing.
    			 *
    			 * This does __not__ work for line script element.
    			 *
    			 * @returns {HTMLScriptElement | null}
    			 */
    			currentScript: function () {
    				if (typeof document === 'undefined') {
    					return null;
    				}
    				if ('currentScript' in document && 1 < 2 /* hack to trip TS' flow analysis */) {
    					return /** @type {any} */ (document.currentScript);
    				}

    				// IE11 workaround
    				// we'll get the src of the current script by parsing IE11's error stack trace
    				// this will not work for inline scripts

    				try {
    					throw new Error();
    				} catch (err) {
    					// Get file src url from stack. Specifically works with the format of stack traces in IE.
    					// A stack will look like this:
    					//
    					// Error
    					//    at _.util.currentScript (http://localhost/components/prism-core.js:119:5)
    					//    at Global code (http://localhost/components/prism-core.js:606:1)

    					var src = (/at [^(\r\n]*\((.*):.+:.+\)$/i.exec(err.stack) || [])[1];
    					if (src) {
    						var scripts = document.getElementsByTagName('script');
    						for (var i in scripts) {
    							if (scripts[i].src == src) {
    								return scripts[i];
    							}
    						}
    					}
    					return null;
    				}
    			},

    			/**
    			 * Returns whether a given class is active for `element`.
    			 *
    			 * The class can be activated if `element` or one of its ancestors has the given class and it can be deactivated
    			 * if `element` or one of its ancestors has the negated version of the given class. The _negated version_ of the
    			 * given class is just the given class with a `no-` prefix.
    			 *
    			 * Whether the class is active is determined by the closest ancestor of `element` (where `element` itself is
    			 * closest ancestor) that has the given class or the negated version of it. If neither `element` nor any of its
    			 * ancestors have the given class or the negated version of it, then the default activation will be returned.
    			 *
    			 * In the paradoxical situation where the closest ancestor contains __both__ the given class and the negated
    			 * version of it, the class is considered active.
    			 *
    			 * @param {Element} element
    			 * @param {string} className
    			 * @param {boolean} [defaultActivation=false]
    			 * @returns {boolean}
    			 */
    			isActive: function (element, className, defaultActivation) {
    				var no = 'no-' + className;

    				while (element) {
    					var classList = element.classList;
    					if (classList.contains(className)) {
    						return true;
    					}
    					if (classList.contains(no)) {
    						return false;
    					}
    					element = element.parentElement;
    				}
    				return !!defaultActivation;
    			}
    		},

    		/**
    		 * This namespace contains all currently loaded languages and the some helper functions to create and modify languages.
    		 *
    		 * @namespace
    		 * @memberof Prism
    		 * @public
    		 */
    		languages: {
    			/**
    			 * The grammar for plain, unformatted text.
    			 */
    			plain: plainTextGrammar,
    			plaintext: plainTextGrammar,
    			text: plainTextGrammar,
    			txt: plainTextGrammar,

    			/**
    			 * Creates a deep copy of the language with the given id and appends the given tokens.
    			 *
    			 * If a token in `redef` also appears in the copied language, then the existing token in the copied language
    			 * will be overwritten at its original position.
    			 *
    			 * ## Best practices
    			 *
    			 * Since the position of overwriting tokens (token in `redef` that overwrite tokens in the copied language)
    			 * doesn't matter, they can technically be in any order. However, this can be confusing to others that trying to
    			 * understand the language definition because, normally, the order of tokens matters in Prism grammars.
    			 *
    			 * Therefore, it is encouraged to order overwriting tokens according to the positions of the overwritten tokens.
    			 * Furthermore, all non-overwriting tokens should be placed after the overwriting ones.
    			 *
    			 * @param {string} id The id of the language to extend. This has to be a key in `Prism.languages`.
    			 * @param {Grammar} redef The new tokens to append.
    			 * @returns {Grammar} The new language created.
    			 * @public
    			 * @example
    			 * Prism.languages['css-with-colors'] = Prism.languages.extend('css', {
    			 *     // Prism.languages.css already has a 'comment' token, so this token will overwrite CSS' 'comment' token
    			 *     // at its original position
    			 *     'comment': { ... },
    			 *     // CSS doesn't have a 'color' token, so this token will be appended
    			 *     'color': /\b(?:red|green|blue)\b/
    			 * });
    			 */
    			extend: function (id, redef) {
    				var lang = _.util.clone(_.languages[id]);

    				for (var key in redef) {
    					lang[key] = redef[key];
    				}

    				return lang;
    			},

    			/**
    			 * Inserts tokens _before_ another token in a language definition or any other grammar.
    			 *
    			 * ## Usage
    			 *
    			 * This helper method makes it easy to modify existing languages. For example, the CSS language definition
    			 * not only defines CSS highlighting for CSS documents, but also needs to define highlighting for CSS embedded
    			 * in HTML through `<style>` elements. To do this, it needs to modify `Prism.languages.markup` and add the
    			 * appropriate tokens. However, `Prism.languages.markup` is a regular JavaScript object literal, so if you do
    			 * this:
    			 *
    			 * ```js
    			 * Prism.languages.markup.style = {
    			 *     // token
    			 * };
    			 * ```
    			 *
    			 * then the `style` token will be added (and processed) at the end. `insertBefore` allows you to insert tokens
    			 * before existing tokens. For the CSS example above, you would use it like this:
    			 *
    			 * ```js
    			 * Prism.languages.insertBefore('markup', 'cdata', {
    			 *     'style': {
    			 *         // token
    			 *     }
    			 * });
    			 * ```
    			 *
    			 * ## Special cases
    			 *
    			 * If the grammars of `inside` and `insert` have tokens with the same name, the tokens in `inside`'s grammar
    			 * will be ignored.
    			 *
    			 * This behavior can be used to insert tokens after `before`:
    			 *
    			 * ```js
    			 * Prism.languages.insertBefore('markup', 'comment', {
    			 *     'comment': Prism.languages.markup.comment,
    			 *     // tokens after 'comment'
    			 * });
    			 * ```
    			 *
    			 * ## Limitations
    			 *
    			 * The main problem `insertBefore` has to solve is iteration order. Since ES2015, the iteration order for object
    			 * properties is guaranteed to be the insertion order (except for integer keys) but some browsers behave
    			 * differently when keys are deleted and re-inserted. So `insertBefore` can't be implemented by temporarily
    			 * deleting properties which is necessary to insert at arbitrary positions.
    			 *
    			 * To solve this problem, `insertBefore` doesn't actually insert the given tokens into the target object.
    			 * Instead, it will create a new object and replace all references to the target object with the new one. This
    			 * can be done without temporarily deleting properties, so the iteration order is well-defined.
    			 *
    			 * However, only references that can be reached from `Prism.languages` or `insert` will be replaced. I.e. if
    			 * you hold the target object in a variable, then the value of the variable will not change.
    			 *
    			 * ```js
    			 * var oldMarkup = Prism.languages.markup;
    			 * var newMarkup = Prism.languages.insertBefore('markup', 'comment', { ... });
    			 *
    			 * assert(oldMarkup !== Prism.languages.markup);
    			 * assert(newMarkup === Prism.languages.markup);
    			 * ```
    			 *
    			 * @param {string} inside The property of `root` (e.g. a language id in `Prism.languages`) that contains the
    			 * object to be modified.
    			 * @param {string} before The key to insert before.
    			 * @param {Grammar} insert An object containing the key-value pairs to be inserted.
    			 * @param {Object<string, any>} [root] The object containing `inside`, i.e. the object that contains the
    			 * object to be modified.
    			 *
    			 * Defaults to `Prism.languages`.
    			 * @returns {Grammar} The new grammar object.
    			 * @public
    			 */
    			insertBefore: function (inside, before, insert, root) {
    				root = root || /** @type {any} */ (_.languages);
    				var grammar = root[inside];
    				/** @type {Grammar} */
    				var ret = {};

    				for (var token in grammar) {
    					if (grammar.hasOwnProperty(token)) {

    						if (token == before) {
    							for (var newToken in insert) {
    								if (insert.hasOwnProperty(newToken)) {
    									ret[newToken] = insert[newToken];
    								}
    							}
    						}

    						// Do not insert token which also occur in insert. See #1525
    						if (!insert.hasOwnProperty(token)) {
    							ret[token] = grammar[token];
    						}
    					}
    				}

    				var old = root[inside];
    				root[inside] = ret;

    				// Update references in other language definitions
    				_.languages.DFS(_.languages, function (key, value) {
    					if (value === old && key != inside) {
    						this[key] = ret;
    					}
    				});

    				return ret;
    			},

    			// Traverse a language definition with Depth First Search
    			DFS: function DFS(o, callback, type, visited) {
    				visited = visited || {};

    				var objId = _.util.objId;

    				for (var i in o) {
    					if (o.hasOwnProperty(i)) {
    						callback.call(o, i, o[i], type || i);

    						var property = o[i];
    						var propertyType = _.util.type(property);

    						if (propertyType === 'Object' && !visited[objId(property)]) {
    							visited[objId(property)] = true;
    							DFS(property, callback, null, visited);
    						} else if (propertyType === 'Array' && !visited[objId(property)]) {
    							visited[objId(property)] = true;
    							DFS(property, callback, i, visited);
    						}
    					}
    				}
    			}
    		},

    		plugins: {},

    		/**
    		 * This is the most high-level function in Prism’s API.
    		 * It fetches all the elements that have a `.language-xxxx` class and then calls {@link Prism.highlightElement} on
    		 * each one of them.
    		 *
    		 * This is equivalent to `Prism.highlightAllUnder(document, async, callback)`.
    		 *
    		 * @param {boolean} [async=false] Same as in {@link Prism.highlightAllUnder}.
    		 * @param {HighlightCallback} [callback] Same as in {@link Prism.highlightAllUnder}.
    		 * @memberof Prism
    		 * @public
    		 */
    		highlightAll: function (async, callback) {
    			_.highlightAllUnder(document, async, callback);
    		},

    		/**
    		 * Fetches all the descendants of `container` that have a `.language-xxxx` class and then calls
    		 * {@link Prism.highlightElement} on each one of them.
    		 *
    		 * The following hooks will be run:
    		 * 1. `before-highlightall`
    		 * 2. `before-all-elements-highlight`
    		 * 3. All hooks of {@link Prism.highlightElement} for each element.
    		 *
    		 * @param {ParentNode} container The root element, whose descendants that have a `.language-xxxx` class will be highlighted.
    		 * @param {boolean} [async=false] Whether each element is to be highlighted asynchronously using Web Workers.
    		 * @param {HighlightCallback} [callback] An optional callback to be invoked on each element after its highlighting is done.
    		 * @memberof Prism
    		 * @public
    		 */
    		highlightAllUnder: function (container, async, callback) {
    			var env = {
    				callback: callback,
    				container: container,
    				selector: 'code[class*="language-"], [class*="language-"] code, code[class*="lang-"], [class*="lang-"] code'
    			};

    			_.hooks.run('before-highlightall', env);

    			env.elements = Array.prototype.slice.apply(env.container.querySelectorAll(env.selector));

    			_.hooks.run('before-all-elements-highlight', env);

    			for (var i = 0, element; (element = env.elements[i++]);) {
    				_.highlightElement(element, async === true, env.callback);
    			}
    		},

    		/**
    		 * Highlights the code inside a single element.
    		 *
    		 * The following hooks will be run:
    		 * 1. `before-sanity-check`
    		 * 2. `before-highlight`
    		 * 3. All hooks of {@link Prism.highlight}. These hooks will be run by an asynchronous worker if `async` is `true`.
    		 * 4. `before-insert`
    		 * 5. `after-highlight`
    		 * 6. `complete`
    		 *
    		 * Some the above hooks will be skipped if the element doesn't contain any text or there is no grammar loaded for
    		 * the element's language.
    		 *
    		 * @param {Element} element The element containing the code.
    		 * It must have a class of `language-xxxx` to be processed, where `xxxx` is a valid language identifier.
    		 * @param {boolean} [async=false] Whether the element is to be highlighted asynchronously using Web Workers
    		 * to improve performance and avoid blocking the UI when highlighting very large chunks of code. This option is
    		 * [disabled by default](https://prismjs.com/faq.html#why-is-asynchronous-highlighting-disabled-by-default).
    		 *
    		 * Note: All language definitions required to highlight the code must be included in the main `prism.js` file for
    		 * asynchronous highlighting to work. You can build your own bundle on the
    		 * [Download page](https://prismjs.com/download.html).
    		 * @param {HighlightCallback} [callback] An optional callback to be invoked after the highlighting is done.
    		 * Mostly useful when `async` is `true`, since in that case, the highlighting is done asynchronously.
    		 * @memberof Prism
    		 * @public
    		 */
    		highlightElement: function (element, async, callback) {
    			// Find language
    			var language = _.util.getLanguage(element);
    			var grammar = _.languages[language];

    			// Set language on the element, if not present
    			element.className = element.className.replace(lang, '').replace(/\s+/g, ' ') + ' language-' + language;

    			// Set language on the parent, for styling
    			var parent = element.parentElement;
    			if (parent && parent.nodeName.toLowerCase() === 'pre') {
    				parent.className = parent.className.replace(lang, '').replace(/\s+/g, ' ') + ' language-' + language;
    			}

    			var code = element.textContent;

    			var env = {
    				element: element,
    				language: language,
    				grammar: grammar,
    				code: code
    			};

    			function insertHighlightedCode(highlightedCode) {
    				env.highlightedCode = highlightedCode;

    				_.hooks.run('before-insert', env);

    				env.element.innerHTML = env.highlightedCode;

    				_.hooks.run('after-highlight', env);
    				_.hooks.run('complete', env);
    				callback && callback.call(env.element);
    			}

    			_.hooks.run('before-sanity-check', env);

    			// plugins may change/add the parent/element
    			parent = env.element.parentElement;
    			if (parent && parent.nodeName.toLowerCase() === 'pre' && !parent.hasAttribute('tabindex')) {
    				parent.setAttribute('tabindex', '0');
    			}

    			if (!env.code) {
    				_.hooks.run('complete', env);
    				callback && callback.call(env.element);
    				return;
    			}

    			_.hooks.run('before-highlight', env);

    			if (!env.grammar) {
    				insertHighlightedCode(_.util.encode(env.code));
    				return;
    			}

    			if (async && _self.Worker) {
    				var worker = new Worker(_.filename);

    				worker.onmessage = function (evt) {
    					insertHighlightedCode(evt.data);
    				};

    				worker.postMessage(JSON.stringify({
    					language: env.language,
    					code: env.code,
    					immediateClose: true
    				}));
    			} else {
    				insertHighlightedCode(_.highlight(env.code, env.grammar, env.language));
    			}
    		},

    		/**
    		 * Low-level function, only use if you know what you’re doing. It accepts a string of text as input
    		 * and the language definitions to use, and returns a string with the HTML produced.
    		 *
    		 * The following hooks will be run:
    		 * 1. `before-tokenize`
    		 * 2. `after-tokenize`
    		 * 3. `wrap`: On each {@link Token}.
    		 *
    		 * @param {string} text A string with the code to be highlighted.
    		 * @param {Grammar} grammar An object containing the tokens to use.
    		 *
    		 * Usually a language definition like `Prism.languages.markup`.
    		 * @param {string} language The name of the language definition passed to `grammar`.
    		 * @returns {string} The highlighted HTML.
    		 * @memberof Prism
    		 * @public
    		 * @example
    		 * Prism.highlight('var foo = true;', Prism.languages.javascript, 'javascript');
    		 */
    		highlight: function (text, grammar, language) {
    			var env = {
    				code: text,
    				grammar: grammar,
    				language: language
    			};
    			_.hooks.run('before-tokenize', env);
    			env.tokens = _.tokenize(env.code, env.grammar);
    			_.hooks.run('after-tokenize', env);
    			return Token.stringify(_.util.encode(env.tokens), env.language);
    		},

    		/**
    		 * This is the heart of Prism, and the most low-level function you can use. It accepts a string of text as input
    		 * and the language definitions to use, and returns an array with the tokenized code.
    		 *
    		 * When the language definition includes nested tokens, the function is called recursively on each of these tokens.
    		 *
    		 * This method could be useful in other contexts as well, as a very crude parser.
    		 *
    		 * @param {string} text A string with the code to be highlighted.
    		 * @param {Grammar} grammar An object containing the tokens to use.
    		 *
    		 * Usually a language definition like `Prism.languages.markup`.
    		 * @returns {TokenStream} An array of strings and tokens, a token stream.
    		 * @memberof Prism
    		 * @public
    		 * @example
    		 * let code = `var foo = 0;`;
    		 * let tokens = Prism.tokenize(code, Prism.languages.javascript);
    		 * tokens.forEach(token => {
    		 *     if (token instanceof Prism.Token && token.type === 'number') {
    		 *         console.log(`Found numeric literal: ${token.content}`);
    		 *     }
    		 * });
    		 */
    		tokenize: function (text, grammar) {
    			var rest = grammar.rest;
    			if (rest) {
    				for (var token in rest) {
    					grammar[token] = rest[token];
    				}

    				delete grammar.rest;
    			}

    			var tokenList = new LinkedList();
    			addAfter(tokenList, tokenList.head, text);

    			matchGrammar(text, tokenList, grammar, tokenList.head, 0);

    			return toArray(tokenList);
    		},

    		/**
    		 * @namespace
    		 * @memberof Prism
    		 * @public
    		 */
    		hooks: {
    			all: {},

    			/**
    			 * Adds the given callback to the list of callbacks for the given hook.
    			 *
    			 * The callback will be invoked when the hook it is registered for is run.
    			 * Hooks are usually directly run by a highlight function but you can also run hooks yourself.
    			 *
    			 * One callback function can be registered to multiple hooks and the same hook multiple times.
    			 *
    			 * @param {string} name The name of the hook.
    			 * @param {HookCallback} callback The callback function which is given environment variables.
    			 * @public
    			 */
    			add: function (name, callback) {
    				var hooks = _.hooks.all;

    				hooks[name] = hooks[name] || [];

    				hooks[name].push(callback);
    			},

    			/**
    			 * Runs a hook invoking all registered callbacks with the given environment variables.
    			 *
    			 * Callbacks will be invoked synchronously and in the order in which they were registered.
    			 *
    			 * @param {string} name The name of the hook.
    			 * @param {Object<string, any>} env The environment variables of the hook passed to all callbacks registered.
    			 * @public
    			 */
    			run: function (name, env) {
    				var callbacks = _.hooks.all[name];

    				if (!callbacks || !callbacks.length) {
    					return;
    				}

    				for (var i = 0, callback; (callback = callbacks[i++]);) {
    					callback(env);
    				}
    			}
    		},

    		Token: Token
    	};
    	_self.Prism = _;


    	// Typescript note:
    	// The following can be used to import the Token type in JSDoc:
    	//
    	//   @typedef {InstanceType<import("./prism-core")["Token"]>} Token

    	/**
    	 * Creates a new token.
    	 *
    	 * @param {string} type See {@link Token#type type}
    	 * @param {string | TokenStream} content See {@link Token#content content}
    	 * @param {string|string[]} [alias] The alias(es) of the token.
    	 * @param {string} [matchedStr=""] A copy of the full string this token was created from.
    	 * @class
    	 * @global
    	 * @public
    	 */
    	function Token(type, content, alias, matchedStr) {
    		/**
    		 * The type of the token.
    		 *
    		 * This is usually the key of a pattern in a {@link Grammar}.
    		 *
    		 * @type {string}
    		 * @see GrammarToken
    		 * @public
    		 */
    		this.type = type;
    		/**
    		 * The strings or tokens contained by this token.
    		 *
    		 * This will be a token stream if the pattern matched also defined an `inside` grammar.
    		 *
    		 * @type {string | TokenStream}
    		 * @public
    		 */
    		this.content = content;
    		/**
    		 * The alias(es) of the token.
    		 *
    		 * @type {string|string[]}
    		 * @see GrammarToken
    		 * @public
    		 */
    		this.alias = alias;
    		// Copy of the full string this token was created from
    		this.length = (matchedStr || '').length | 0;
    	}

    	/**
    	 * A token stream is an array of strings and {@link Token Token} objects.
    	 *
    	 * Token streams have to fulfill a few properties that are assumed by most functions (mostly internal ones) that process
    	 * them.
    	 *
    	 * 1. No adjacent strings.
    	 * 2. No empty strings.
    	 *
    	 *    The only exception here is the token stream that only contains the empty string and nothing else.
    	 *
    	 * @typedef {Array<string | Token>} TokenStream
    	 * @global
    	 * @public
    	 */

    	/**
    	 * Converts the given token or token stream to an HTML representation.
    	 *
    	 * The following hooks will be run:
    	 * 1. `wrap`: On each {@link Token}.
    	 *
    	 * @param {string | Token | TokenStream} o The token or token stream to be converted.
    	 * @param {string} language The name of current language.
    	 * @returns {string} The HTML representation of the token or token stream.
    	 * @memberof Token
    	 * @static
    	 */
    	Token.stringify = function stringify(o, language) {
    		if (typeof o == 'string') {
    			return o;
    		}
    		if (Array.isArray(o)) {
    			var s = '';
    			o.forEach(function (e) {
    				s += stringify(e, language);
    			});
    			return s;
    		}

    		var env = {
    			type: o.type,
    			content: stringify(o.content, language),
    			tag: 'span',
    			classes: ['token', o.type],
    			attributes: {},
    			language: language
    		};

    		var aliases = o.alias;
    		if (aliases) {
    			if (Array.isArray(aliases)) {
    				Array.prototype.push.apply(env.classes, aliases);
    			} else {
    				env.classes.push(aliases);
    			}
    		}

    		_.hooks.run('wrap', env);

    		var attributes = '';
    		for (var name in env.attributes) {
    			attributes += ' ' + name + '="' + (env.attributes[name] || '').replace(/"/g, '&quot;') + '"';
    		}

    		return '<' + env.tag + ' class="' + env.classes.join(' ') + '"' + attributes + '>' + env.content + '</' + env.tag + '>';
    	};

    	/**
    	 * @param {RegExp} pattern
    	 * @param {number} pos
    	 * @param {string} text
    	 * @param {boolean} lookbehind
    	 * @returns {RegExpExecArray | null}
    	 */
    	function matchPattern(pattern, pos, text, lookbehind) {
    		pattern.lastIndex = pos;
    		var match = pattern.exec(text);
    		if (match && lookbehind && match[1]) {
    			// change the match to remove the text matched by the Prism lookbehind group
    			var lookbehindLength = match[1].length;
    			match.index += lookbehindLength;
    			match[0] = match[0].slice(lookbehindLength);
    		}
    		return match;
    	}

    	/**
    	 * @param {string} text
    	 * @param {LinkedList<string | Token>} tokenList
    	 * @param {any} grammar
    	 * @param {LinkedListNode<string | Token>} startNode
    	 * @param {number} startPos
    	 * @param {RematchOptions} [rematch]
    	 * @returns {void}
    	 * @private
    	 *
    	 * @typedef RematchOptions
    	 * @property {string} cause
    	 * @property {number} reach
    	 */
    	function matchGrammar(text, tokenList, grammar, startNode, startPos, rematch) {
    		for (var token in grammar) {
    			if (!grammar.hasOwnProperty(token) || !grammar[token]) {
    				continue;
    			}

    			var patterns = grammar[token];
    			patterns = Array.isArray(patterns) ? patterns : [patterns];

    			for (var j = 0; j < patterns.length; ++j) {
    				if (rematch && rematch.cause == token + ',' + j) {
    					return;
    				}

    				var patternObj = patterns[j];
    				var inside = patternObj.inside;
    				var lookbehind = !!patternObj.lookbehind;
    				var greedy = !!patternObj.greedy;
    				var alias = patternObj.alias;

    				if (greedy && !patternObj.pattern.global) {
    					// Without the global flag, lastIndex won't work
    					var flags = patternObj.pattern.toString().match(/[imsuy]*$/)[0];
    					patternObj.pattern = RegExp(patternObj.pattern.source, flags + 'g');
    				}

    				/** @type {RegExp} */
    				var pattern = patternObj.pattern || patternObj;

    				for ( // iterate the token list and keep track of the current token/string position
    					var currentNode = startNode.next, pos = startPos;
    					currentNode !== tokenList.tail;
    					pos += currentNode.value.length, currentNode = currentNode.next
    				) {

    					if (rematch && pos >= rematch.reach) {
    						break;
    					}

    					var str = currentNode.value;

    					if (tokenList.length > text.length) {
    						// Something went terribly wrong, ABORT, ABORT!
    						return;
    					}

    					if (str instanceof Token) {
    						continue;
    					}

    					var removeCount = 1; // this is the to parameter of removeBetween
    					var match;

    					if (greedy) {
    						match = matchPattern(pattern, pos, text, lookbehind);
    						if (!match) {
    							break;
    						}

    						var from = match.index;
    						var to = match.index + match[0].length;
    						var p = pos;

    						// find the node that contains the match
    						p += currentNode.value.length;
    						while (from >= p) {
    							currentNode = currentNode.next;
    							p += currentNode.value.length;
    						}
    						// adjust pos (and p)
    						p -= currentNode.value.length;
    						pos = p;

    						// the current node is a Token, then the match starts inside another Token, which is invalid
    						if (currentNode.value instanceof Token) {
    							continue;
    						}

    						// find the last node which is affected by this match
    						for (
    							var k = currentNode;
    							k !== tokenList.tail && (p < to || typeof k.value === 'string');
    							k = k.next
    						) {
    							removeCount++;
    							p += k.value.length;
    						}
    						removeCount--;

    						// replace with the new match
    						str = text.slice(pos, p);
    						match.index -= pos;
    					} else {
    						match = matchPattern(pattern, 0, str, lookbehind);
    						if (!match) {
    							continue;
    						}
    					}

    					// eslint-disable-next-line no-redeclare
    					var from = match.index;
    					var matchStr = match[0];
    					var before = str.slice(0, from);
    					var after = str.slice(from + matchStr.length);

    					var reach = pos + str.length;
    					if (rematch && reach > rematch.reach) {
    						rematch.reach = reach;
    					}

    					var removeFrom = currentNode.prev;

    					if (before) {
    						removeFrom = addAfter(tokenList, removeFrom, before);
    						pos += before.length;
    					}

    					removeRange(tokenList, removeFrom, removeCount);

    					var wrapped = new Token(token, inside ? _.tokenize(matchStr, inside) : matchStr, alias, matchStr);
    					currentNode = addAfter(tokenList, removeFrom, wrapped);

    					if (after) {
    						addAfter(tokenList, currentNode, after);
    					}

    					if (removeCount > 1) {
    						// at least one Token object was removed, so we have to do some rematching
    						// this can only happen if the current pattern is greedy

    						/** @type {RematchOptions} */
    						var nestedRematch = {
    							cause: token + ',' + j,
    							reach: reach
    						};
    						matchGrammar(text, tokenList, grammar, currentNode.prev, pos, nestedRematch);

    						// the reach might have been extended because of the rematching
    						if (rematch && nestedRematch.reach > rematch.reach) {
    							rematch.reach = nestedRematch.reach;
    						}
    					}
    				}
    			}
    		}
    	}

    	/**
    	 * @typedef LinkedListNode
    	 * @property {T} value
    	 * @property {LinkedListNode<T> | null} prev The previous node.
    	 * @property {LinkedListNode<T> | null} next The next node.
    	 * @template T
    	 * @private
    	 */

    	/**
    	 * @template T
    	 * @private
    	 */
    	function LinkedList() {
    		/** @type {LinkedListNode<T>} */
    		var head = { value: null, prev: null, next: null };
    		/** @type {LinkedListNode<T>} */
    		var tail = { value: null, prev: head, next: null };
    		head.next = tail;

    		/** @type {LinkedListNode<T>} */
    		this.head = head;
    		/** @type {LinkedListNode<T>} */
    		this.tail = tail;
    		this.length = 0;
    	}

    	/**
    	 * Adds a new node with the given value to the list.
    	 *
    	 * @param {LinkedList<T>} list
    	 * @param {LinkedListNode<T>} node
    	 * @param {T} value
    	 * @returns {LinkedListNode<T>} The added node.
    	 * @template T
    	 */
    	function addAfter(list, node, value) {
    		// assumes that node != list.tail && values.length >= 0
    		var next = node.next;

    		var newNode = { value: value, prev: node, next: next };
    		node.next = newNode;
    		next.prev = newNode;
    		list.length++;

    		return newNode;
    	}
    	/**
    	 * Removes `count` nodes after the given node. The given node will not be removed.
    	 *
    	 * @param {LinkedList<T>} list
    	 * @param {LinkedListNode<T>} node
    	 * @param {number} count
    	 * @template T
    	 */
    	function removeRange(list, node, count) {
    		var next = node.next;
    		for (var i = 0; i < count && next !== list.tail; i++) {
    			next = next.next;
    		}
    		node.next = next;
    		next.prev = node;
    		list.length -= i;
    	}
    	/**
    	 * @param {LinkedList<T>} list
    	 * @returns {T[]}
    	 * @template T
    	 */
    	function toArray(list) {
    		var array = [];
    		var node = list.head.next;
    		while (node !== list.tail) {
    			array.push(node.value);
    			node = node.next;
    		}
    		return array;
    	}


    	if (!_self.document) {
    		if (!_self.addEventListener) {
    			// in Node.js
    			return _;
    		}

    		if (!_.disableWorkerMessageHandler) {
    			// In worker
    			_self.addEventListener('message', function (evt) {
    				var message = JSON.parse(evt.data);
    				var lang = message.language;
    				var code = message.code;
    				var immediateClose = message.immediateClose;

    				_self.postMessage(_.highlight(code, _.languages[lang], lang));
    				if (immediateClose) {
    					_self.close();
    				}
    			}, false);
    		}

    		return _;
    	}

    	// Get current script and highlight
    	var script = _.util.currentScript();

    	if (script) {
    		_.filename = script.src;

    		if (script.hasAttribute('data-manual')) {
    			_.manual = true;
    		}
    	}

    	function highlightAutomaticallyCallback() {
    		if (!_.manual) {
    			_.highlightAll();
    		}
    	}

    	if (!_.manual) {
    		// If the document state is "loading", then we'll use DOMContentLoaded.
    		// If the document state is "interactive" and the prism.js script is deferred, then we'll also use the
    		// DOMContentLoaded event because there might be some plugins or languages which have also been deferred and they
    		// might take longer one animation frame to execute which can create a race condition where only some plugins have
    		// been loaded when Prism.highlightAll() is executed, depending on how fast resources are loaded.
    		// See https://github.com/PrismJS/prism/issues/2102
    		var readyState = document.readyState;
    		if (readyState === 'loading' || readyState === 'interactive' && script && script.defer) {
    			document.addEventListener('DOMContentLoaded', highlightAutomaticallyCallback);
    		} else {
    			if (window.requestAnimationFrame) {
    				window.requestAnimationFrame(highlightAutomaticallyCallback);
    			} else {
    				window.setTimeout(highlightAutomaticallyCallback, 16);
    			}
    		}
    	}

    	return _;

    }(_self));

    if (typeof module !== 'undefined' && module.exports) {
    	module.exports = Prism$1;
    }

    // hack for components to work correctly in node.js
    if (typeof global !== 'undefined') {
    	global.Prism = Prism$1;
    }

    // some additional documentation/types

    /**
     * The expansion of a simple `RegExp` literal to support additional properties.
     *
     * @typedef GrammarToken
     * @property {RegExp} pattern The regular expression of the token.
     * @property {boolean} [lookbehind=false] If `true`, then the first capturing group of `pattern` will (effectively)
     * behave as a lookbehind group meaning that the captured text will not be part of the matched text of the new token.
     * @property {boolean} [greedy=false] Whether the token is greedy.
     * @property {string|string[]} [alias] An optional alias or list of aliases.
     * @property {Grammar} [inside] The nested grammar of this token.
     *
     * The `inside` grammar will be used to tokenize the text value of each token of this kind.
     *
     * This can be used to make nested and even recursive language definitions.
     *
     * Note: This can cause infinite recursion. Be careful when you embed different languages or even the same language into
     * each another.
     * @global
     * @public
     */

    /**
     * @typedef Grammar
     * @type {Object<string, RegExp | GrammarToken | Array<RegExp | GrammarToken>>}
     * @property {Grammar} [rest] An optional grammar object that will be appended to this grammar.
     * @global
     * @public
     */

    /**
     * A function which will invoked after an element was successfully highlighted.
     *
     * @callback HighlightCallback
     * @param {Element} element The element successfully highlighted.
     * @returns {void}
     * @global
     * @public
     */

    /**
     * @callback HookCallback
     * @param {Object<string, any>} env The environment variables of the hook.
     * @returns {void}
     * @global
     * @public
     */


    /* **********************************************
         Begin prism-markup.js
    ********************************************** */

    Prism$1.languages.markup = {
    	'comment': /<!--[\s\S]*?-->/,
    	'prolog': /<\?[\s\S]+?\?>/,
    	'doctype': {
    		// https://www.w3.org/TR/xml/#NT-doctypedecl
    		pattern: /<!DOCTYPE(?:[^>"'[\]]|"[^"]*"|'[^']*')+(?:\[(?:[^<"'\]]|"[^"]*"|'[^']*'|<(?!!--)|<!--(?:[^-]|-(?!->))*-->)*\]\s*)?>/i,
    		greedy: true,
    		inside: {
    			'internal-subset': {
    				pattern: /(^[^\[]*\[)[\s\S]+(?=\]>$)/,
    				lookbehind: true,
    				greedy: true,
    				inside: null // see below
    			},
    			'string': {
    				pattern: /"[^"]*"|'[^']*'/,
    				greedy: true
    			},
    			'punctuation': /^<!|>$|[[\]]/,
    			'doctype-tag': /^DOCTYPE/,
    			'name': /[^\s<>'"]+/
    		}
    	},
    	'cdata': /<!\[CDATA\[[\s\S]*?\]\]>/i,
    	'tag': {
    		pattern: /<\/?(?!\d)[^\s>\/=$<%]+(?:\s(?:\s*[^\s>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+(?=[\s>]))|(?=[\s/>])))+)?\s*\/?>/,
    		greedy: true,
    		inside: {
    			'tag': {
    				pattern: /^<\/?[^\s>\/]+/,
    				inside: {
    					'punctuation': /^<\/?/,
    					'namespace': /^[^\s>\/:]+:/
    				}
    			},
    			'special-attr': [],
    			'attr-value': {
    				pattern: /=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+)/,
    				inside: {
    					'punctuation': [
    						{
    							pattern: /^=/,
    							alias: 'attr-equals'
    						},
    						/"|'/
    					]
    				}
    			},
    			'punctuation': /\/?>/,
    			'attr-name': {
    				pattern: /[^\s>\/]+/,
    				inside: {
    					'namespace': /^[^\s>\/:]+:/
    				}
    			}

    		}
    	},
    	'entity': [
    		{
    			pattern: /&[\da-z]{1,8};/i,
    			alias: 'named-entity'
    		},
    		/&#x?[\da-f]{1,8};/i
    	]
    };

    Prism$1.languages.markup['tag'].inside['attr-value'].inside['entity'] =
    	Prism$1.languages.markup['entity'];
    Prism$1.languages.markup['doctype'].inside['internal-subset'].inside = Prism$1.languages.markup;

    // Plugin to make entity title show the real entity, idea by Roman Komarov
    Prism$1.hooks.add('wrap', function (env) {

    	if (env.type === 'entity') {
    		env.attributes['title'] = env.content.replace(/&amp;/, '&');
    	}
    });

    Object.defineProperty(Prism$1.languages.markup.tag, 'addInlined', {
    	/**
    	 * Adds an inlined language to markup.
    	 *
    	 * An example of an inlined language is CSS with `<style>` tags.
    	 *
    	 * @param {string} tagName The name of the tag that contains the inlined language. This name will be treated as
    	 * case insensitive.
    	 * @param {string} lang The language key.
    	 * @example
    	 * addInlined('style', 'css');
    	 */
    	value: function addInlined(tagName, lang) {
    		var includedCdataInside = {};
    		includedCdataInside['language-' + lang] = {
    			pattern: /(^<!\[CDATA\[)[\s\S]+?(?=\]\]>$)/i,
    			lookbehind: true,
    			inside: Prism$1.languages[lang]
    		};
    		includedCdataInside['cdata'] = /^<!\[CDATA\[|\]\]>$/i;

    		var inside = {
    			'included-cdata': {
    				pattern: /<!\[CDATA\[[\s\S]*?\]\]>/i,
    				inside: includedCdataInside
    			}
    		};
    		inside['language-' + lang] = {
    			pattern: /[\s\S]+/,
    			inside: Prism$1.languages[lang]
    		};

    		var def = {};
    		def[tagName] = {
    			pattern: RegExp(/(<__[^>]*>)(?:<!\[CDATA\[(?:[^\]]|\](?!\]>))*\]\]>|(?!<!\[CDATA\[)[\s\S])*?(?=<\/__>)/.source.replace(/__/g, function () { return tagName; }), 'i'),
    			lookbehind: true,
    			greedy: true,
    			inside: inside
    		};

    		Prism$1.languages.insertBefore('markup', 'cdata', def);
    	}
    });
    Object.defineProperty(Prism$1.languages.markup.tag, 'addAttribute', {
    	/**
    	 * Adds an pattern to highlight languages embedded in HTML attributes.
    	 *
    	 * An example of an inlined language is CSS with `style` attributes.
    	 *
    	 * @param {string} attrName The name of the tag that contains the inlined language. This name will be treated as
    	 * case insensitive.
    	 * @param {string} lang The language key.
    	 * @example
    	 * addAttribute('style', 'css');
    	 */
    	value: function (attrName, lang) {
    		Prism$1.languages.markup.tag.inside['special-attr'].push({
    			pattern: RegExp(
    				/(^|["'\s])/.source + '(?:' + attrName + ')' + /\s*=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+(?=[\s>]))/.source,
    				'i'
    			),
    			lookbehind: true,
    			inside: {
    				'attr-name': /^[^\s=]+/,
    				'attr-value': {
    					pattern: /=[\s\S]+/,
    					inside: {
    						'value': {
    							pattern: /(^=\s*(["']|(?!["'])))\S[\s\S]*(?=\2$)/,
    							lookbehind: true,
    							alias: [lang, 'language-' + lang],
    							inside: Prism$1.languages[lang]
    						},
    						'punctuation': [
    							{
    								pattern: /^=/,
    								alias: 'attr-equals'
    							},
    							/"|'/
    						]
    					}
    				}
    			}
    		});
    	}
    });

    Prism$1.languages.html = Prism$1.languages.markup;
    Prism$1.languages.mathml = Prism$1.languages.markup;
    Prism$1.languages.svg = Prism$1.languages.markup;

    Prism$1.languages.xml = Prism$1.languages.extend('markup', {});
    Prism$1.languages.ssml = Prism$1.languages.xml;
    Prism$1.languages.atom = Prism$1.languages.xml;
    Prism$1.languages.rss = Prism$1.languages.xml;


    /* **********************************************
         Begin prism-css.js
    ********************************************** */

    (function (Prism) {

    	var string = /(?:"(?:\\(?:\r\n|[\s\S])|[^"\\\r\n])*"|'(?:\\(?:\r\n|[\s\S])|[^'\\\r\n])*')/;

    	Prism.languages.css = {
    		'comment': /\/\*[\s\S]*?\*\//,
    		'atrule': {
    			pattern: /@[\w-](?:[^;{\s]|\s+(?![\s{]))*(?:;|(?=\s*\{))/,
    			inside: {
    				'rule': /^@[\w-]+/,
    				'selector-function-argument': {
    					pattern: /(\bselector\s*\(\s*(?![\s)]))(?:[^()\s]|\s+(?![\s)])|\((?:[^()]|\([^()]*\))*\))+(?=\s*\))/,
    					lookbehind: true,
    					alias: 'selector'
    				},
    				'keyword': {
    					pattern: /(^|[^\w-])(?:and|not|only|or)(?![\w-])/,
    					lookbehind: true
    				}
    				// See rest below
    			}
    		},
    		'url': {
    			// https://drafts.csswg.org/css-values-3/#urls
    			pattern: RegExp('\\burl\\((?:' + string.source + '|' + /(?:[^\\\r\n()"']|\\[\s\S])*/.source + ')\\)', 'i'),
    			greedy: true,
    			inside: {
    				'function': /^url/i,
    				'punctuation': /^\(|\)$/,
    				'string': {
    					pattern: RegExp('^' + string.source + '$'),
    					alias: 'url'
    				}
    			}
    		},
    		'selector': {
    			pattern: RegExp('(^|[{}\\s])[^{}\\s](?:[^{};"\'\\s]|\\s+(?![\\s{])|' + string.source + ')*(?=\\s*\\{)'),
    			lookbehind: true
    		},
    		'string': {
    			pattern: string,
    			greedy: true
    		},
    		'property': {
    			pattern: /(^|[^-\w\xA0-\uFFFF])(?!\s)[-_a-z\xA0-\uFFFF](?:(?!\s)[-\w\xA0-\uFFFF])*(?=\s*:)/i,
    			lookbehind: true
    		},
    		'important': /!important\b/i,
    		'function': {
    			pattern: /(^|[^-a-z0-9])[-a-z0-9]+(?=\()/i,
    			lookbehind: true
    		},
    		'punctuation': /[(){};:,]/
    	};

    	Prism.languages.css['atrule'].inside.rest = Prism.languages.css;

    	var markup = Prism.languages.markup;
    	if (markup) {
    		markup.tag.addInlined('style', 'css');
    		markup.tag.addAttribute('style', 'css');
    	}

    }(Prism$1));


    /* **********************************************
         Begin prism-clike.js
    ********************************************** */

    Prism$1.languages.clike = {
    	'comment': [
    		{
    			pattern: /(^|[^\\])\/\*[\s\S]*?(?:\*\/|$)/,
    			lookbehind: true,
    			greedy: true
    		},
    		{
    			pattern: /(^|[^\\:])\/\/.*/,
    			lookbehind: true,
    			greedy: true
    		}
    	],
    	'string': {
    		pattern: /(["'])(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,
    		greedy: true
    	},
    	'class-name': {
    		pattern: /(\b(?:class|interface|extends|implements|trait|instanceof|new)\s+|\bcatch\s+\()[\w.\\]+/i,
    		lookbehind: true,
    		inside: {
    			'punctuation': /[.\\]/
    		}
    	},
    	'keyword': /\b(?:if|else|while|do|for|return|in|instanceof|function|new|try|throw|catch|finally|null|break|continue)\b/,
    	'boolean': /\b(?:true|false)\b/,
    	'function': /\b\w+(?=\()/,
    	'number': /\b0x[\da-f]+\b|(?:\b\d+(?:\.\d*)?|\B\.\d+)(?:e[+-]?\d+)?/i,
    	'operator': /[<>]=?|[!=]=?=?|--?|\+\+?|&&?|\|\|?|[?*/~^%]/,
    	'punctuation': /[{}[\];(),.:]/
    };


    /* **********************************************
         Begin prism-javascript.js
    ********************************************** */

    Prism$1.languages.javascript = Prism$1.languages.extend('clike', {
    	'class-name': [
    		Prism$1.languages.clike['class-name'],
    		{
    			pattern: /(^|[^$\w\xA0-\uFFFF])(?!\s)[_$A-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\.(?:prototype|constructor))/,
    			lookbehind: true
    		}
    	],
    	'keyword': [
    		{
    			pattern: /((?:^|\})\s*)catch\b/,
    			lookbehind: true
    		},
    		{
    			pattern: /(^|[^.]|\.\.\.\s*)\b(?:as|assert(?=\s*\{)|async(?=\s*(?:function\b|\(|[$\w\xA0-\uFFFF]|$))|await|break|case|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally(?=\s*(?:\{|$))|for|from(?=\s*(?:['"]|$))|function|(?:get|set)(?=\s*(?:[#\[$\w\xA0-\uFFFF]|$))|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)\b/,
    			lookbehind: true
    		},
    	],
    	// Allow for all non-ASCII characters (See http://stackoverflow.com/a/2008444)
    	'function': /#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*(?:\.\s*(?:apply|bind|call)\s*)?\()/,
    	'number': /\b(?:(?:0[xX](?:[\dA-Fa-f](?:_[\dA-Fa-f])?)+|0[bB](?:[01](?:_[01])?)+|0[oO](?:[0-7](?:_[0-7])?)+)n?|(?:\d(?:_\d)?)+n|NaN|Infinity)\b|(?:\b(?:\d(?:_\d)?)+\.?(?:\d(?:_\d)?)*|\B\.(?:\d(?:_\d)?)+)(?:[Ee][+-]?(?:\d(?:_\d)?)+)?/,
    	'operator': /--|\+\+|\*\*=?|=>|&&=?|\|\|=?|[!=]==|<<=?|>>>?=?|[-+*/%&|^!=<>]=?|\.{3}|\?\?=?|\?\.?|[~:]/
    });

    Prism$1.languages.javascript['class-name'][0].pattern = /(\b(?:class|interface|extends|implements|instanceof|new)\s+)[\w.\\]+/;

    Prism$1.languages.insertBefore('javascript', 'keyword', {
    	'regex': {
    		// eslint-disable-next-line regexp/no-dupe-characters-character-class
    		pattern: /((?:^|[^$\w\xA0-\uFFFF."'\])\s]|\b(?:return|yield))\s*)\/(?:\[(?:[^\]\\\r\n]|\\.)*\]|\\.|[^/\\\[\r\n])+\/[dgimyus]{0,7}(?=(?:\s|\/\*(?:[^*]|\*(?!\/))*\*\/)*(?:$|[\r\n,.;:})\]]|\/\/))/,
    		lookbehind: true,
    		greedy: true,
    		inside: {
    			'regex-source': {
    				pattern: /^(\/)[\s\S]+(?=\/[a-z]*$)/,
    				lookbehind: true,
    				alias: 'language-regex',
    				inside: Prism$1.languages.regex
    			},
    			'regex-delimiter': /^\/|\/$/,
    			'regex-flags': /^[a-z]+$/,
    		}
    	},
    	// This must be declared before keyword because we use "function" inside the look-forward
    	'function-variable': {
    		pattern: /#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*[=:]\s*(?:async\s*)?(?:\bfunction\b|(?:\((?:[^()]|\([^()]*\))*\)|(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*)\s*=>))/,
    		alias: 'function'
    	},
    	'parameter': [
    		{
    			pattern: /(function(?:\s+(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*)?\s*\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\))/,
    			lookbehind: true,
    			inside: Prism$1.languages.javascript
    		},
    		{
    			pattern: /(^|[^$\w\xA0-\uFFFF])(?!\s)[_$a-z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*=>)/i,
    			lookbehind: true,
    			inside: Prism$1.languages.javascript
    		},
    		{
    			pattern: /(\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\)\s*=>)/,
    			lookbehind: true,
    			inside: Prism$1.languages.javascript
    		},
    		{
    			pattern: /((?:\b|\s|^)(?!(?:as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)(?![$\w\xA0-\uFFFF]))(?:(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*\s*)\(\s*|\]\s*\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\)\s*\{)/,
    			lookbehind: true,
    			inside: Prism$1.languages.javascript
    		}
    	],
    	'constant': /\b[A-Z](?:[A-Z_]|\dx?)*\b/
    });

    Prism$1.languages.insertBefore('javascript', 'string', {
    	'hashbang': {
    		pattern: /^#!.*/,
    		greedy: true,
    		alias: 'comment'
    	},
    	'template-string': {
    		pattern: /`(?:\\[\s\S]|\$\{(?:[^{}]|\{(?:[^{}]|\{[^}]*\})*\})+\}|(?!\$\{)[^\\`])*`/,
    		greedy: true,
    		inside: {
    			'template-punctuation': {
    				pattern: /^`|`$/,
    				alias: 'string'
    			},
    			'interpolation': {
    				pattern: /((?:^|[^\\])(?:\\{2})*)\$\{(?:[^{}]|\{(?:[^{}]|\{[^}]*\})*\})+\}/,
    				lookbehind: true,
    				inside: {
    					'interpolation-punctuation': {
    						pattern: /^\$\{|\}$/,
    						alias: 'punctuation'
    					},
    					rest: Prism$1.languages.javascript
    				}
    			},
    			'string': /[\s\S]+/
    		}
    	}
    });

    if (Prism$1.languages.markup) {
    	Prism$1.languages.markup.tag.addInlined('script', 'javascript');

    	// add attribute support for all DOM events.
    	// https://developer.mozilla.org/en-US/docs/Web/Events#Standard_events
    	Prism$1.languages.markup.tag.addAttribute(
    		/on(?:abort|blur|change|click|composition(?:end|start|update)|dblclick|error|focus(?:in|out)?|key(?:down|up)|load|mouse(?:down|enter|leave|move|out|over|up)|reset|resize|scroll|select|slotchange|submit|unload|wheel)/.source,
    		'javascript'
    	);
    }

    Prism$1.languages.js = Prism$1.languages.javascript;


    /* **********************************************
         Begin prism-file-highlight.js
    ********************************************** */

    (function () {

    	if (typeof Prism$1 === 'undefined' || typeof document === 'undefined') {
    		return;
    	}

    	// https://developer.mozilla.org/en-US/docs/Web/API/Element/matches#Polyfill
    	if (!Element.prototype.matches) {
    		Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
    	}

    	var LOADING_MESSAGE = 'Loading…';
    	var FAILURE_MESSAGE = function (status, message) {
    		return '✖ Error ' + status + ' while fetching file: ' + message;
    	};
    	var FAILURE_EMPTY_MESSAGE = '✖ Error: File does not exist or is empty';

    	var EXTENSIONS = {
    		'js': 'javascript',
    		'py': 'python',
    		'rb': 'ruby',
    		'ps1': 'powershell',
    		'psm1': 'powershell',
    		'sh': 'bash',
    		'bat': 'batch',
    		'h': 'c',
    		'tex': 'latex'
    	};

    	var STATUS_ATTR = 'data-src-status';
    	var STATUS_LOADING = 'loading';
    	var STATUS_LOADED = 'loaded';
    	var STATUS_FAILED = 'failed';

    	var SELECTOR = 'pre[data-src]:not([' + STATUS_ATTR + '="' + STATUS_LOADED + '"])'
    		+ ':not([' + STATUS_ATTR + '="' + STATUS_LOADING + '"])';

    	var lang = /\blang(?:uage)?-([\w-]+)\b/i;

    	/**
    	 * Sets the Prism `language-xxxx` or `lang-xxxx` class to the given language.
    	 *
    	 * @param {HTMLElement} element
    	 * @param {string} language
    	 * @returns {void}
    	 */
    	function setLanguageClass(element, language) {
    		var className = element.className;
    		className = className.replace(lang, ' ') + ' language-' + language;
    		element.className = className.replace(/\s+/g, ' ').trim();
    	}


    	Prism$1.hooks.add('before-highlightall', function (env) {
    		env.selector += ', ' + SELECTOR;
    	});

    	Prism$1.hooks.add('before-sanity-check', function (env) {
    		var pre = /** @type {HTMLPreElement} */ (env.element);
    		if (pre.matches(SELECTOR)) {
    			env.code = ''; // fast-path the whole thing and go to complete

    			pre.setAttribute(STATUS_ATTR, STATUS_LOADING); // mark as loading

    			// add code element with loading message
    			var code = pre.appendChild(document.createElement('CODE'));
    			code.textContent = LOADING_MESSAGE;

    			var src = pre.getAttribute('data-src');

    			var language = env.language;
    			if (language === 'none') {
    				// the language might be 'none' because there is no language set;
    				// in this case, we want to use the extension as the language
    				var extension = (/\.(\w+)$/.exec(src) || [, 'none'])[1];
    				language = EXTENSIONS[extension] || extension;
    			}

    			// set language classes
    			setLanguageClass(code, language);
    			setLanguageClass(pre, language);

    			// preload the language
    			var autoloader = Prism$1.plugins.autoloader;
    			if (autoloader) {
    				autoloader.loadLanguages(language);
    			}

    			// load file
    			var xhr = new XMLHttpRequest();
    			xhr.open('GET', src, true);
    			xhr.onreadystatechange = function () {
    				if (xhr.readyState == 4) {
    					if (xhr.status < 400 && xhr.responseText) {
    						// mark as loaded
    						pre.setAttribute(STATUS_ATTR, STATUS_LOADED);

    						// highlight code
    						code.textContent = xhr.responseText;
    						Prism$1.highlightElement(code);

    					} else {
    						// mark as failed
    						pre.setAttribute(STATUS_ATTR, STATUS_FAILED);

    						if (xhr.status >= 400) {
    							code.textContent = FAILURE_MESSAGE(xhr.status, xhr.statusText);
    						} else {
    							code.textContent = FAILURE_EMPTY_MESSAGE;
    						}
    					}
    				}
    			};
    			xhr.send(null);
    		}
    	});

    	Prism$1.plugins.fileHighlight = {
    		/**
    		 * Executes the File Highlight plugin for all matching `pre` elements under the given container.
    		 *
    		 * Note: Elements which are already loaded or currently loading will not be touched by this method.
    		 *
    		 * @param {ParentNode} [container=document]
    		 */
    		highlight: function highlight(container) {
    			var elements = (container || document).querySelectorAll(SELECTOR);

    			for (var i = 0, element; (element = elements[i++]);) {
    				Prism$1.highlightElement(element);
    			}
    		}
    	};

    	var logged = false;
    	/** @deprecated Use `Prism.plugins.fileHighlight.highlight` instead. */
    	Prism$1.fileHighlight = function () {
    		if (!logged) {
    			console.warn('Prism.fileHighlight is deprecated. Use `Prism.plugins.fileHighlight.highlight` instead.');
    			logged = true;
    		}
    		Prism$1.plugins.fileHighlight.highlight.apply(this, arguments);
    	};

    }());

    class CodeSnippet extends LitElement {
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

    /**
     * @license
     * Copyright 2019 Google LLC
     * SPDX-License-Identifier: BSD-3-Clause
     */
    const t$2=window.ShadowRoot&&(void 0===window.ShadyCSS||window.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,e$3=Symbol(),s$2=new Map;class n$3{constructor(t,s){if(this._$cssResult$=!0,s!==e$3)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=t;}get styleSheet(){let e=s$2.get(this.cssText);return t$2&&void 0===e&&(s$2.set(this.cssText,e=new CSSStyleSheet),e.replaceSync(this.cssText)),e}toString(){return this.cssText}}const o$4=t=>new n$3("string"==typeof t?t:t+"",e$3),S$1=(e,s)=>{t$2?e.adoptedStyleSheets=s.map((t=>t instanceof CSSStyleSheet?t:t.styleSheet)):s.forEach((t=>{const s=document.createElement("style");s.textContent=t.cssText,e.appendChild(s);}));},i$2=t$2?t=>t:t=>t instanceof CSSStyleSheet?(t=>{let e="";for(const s of t.cssRules)e+=s.cssText;return o$4(e)})(t):t;

    /**
     * @license
     * Copyright 2017 Google LLC
     * SPDX-License-Identifier: BSD-3-Clause
     */var s$1,e$2;const r$2={toAttribute(t,i){switch(i){case Boolean:t=t?"":null;break;case Object:case Array:t=null==t?t:JSON.stringify(t);}return t},fromAttribute(t,i){let s=t;switch(i){case Boolean:s=null!==t;break;case Number:s=null===t?null:Number(t);break;case Object:case Array:try{s=JSON.parse(t);}catch(t){s=null;}}return s}},h$1=(t,i)=>i!==t&&(i==i||t==t),o$3={attribute:!0,type:String,converter:r$2,reflect:!1,hasChanged:h$1};class n$2 extends HTMLElement{constructor(){super(),this._$Et=new Map,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Ei=null,this.o();}static addInitializer(t){var i;null!==(i=this.l)&&void 0!==i||(this.l=[]),this.l.push(t);}static get observedAttributes(){this.finalize();const t=[];return this.elementProperties.forEach(((i,s)=>{const e=this._$Eh(s,i);void 0!==e&&(this._$Eu.set(e,s),t.push(e));})),t}static createProperty(t,i=o$3){if(i.state&&(i.attribute=!1),this.finalize(),this.elementProperties.set(t,i),!i.noAccessor&&!this.prototype.hasOwnProperty(t)){const s="symbol"==typeof t?Symbol():"__"+t,e=this.getPropertyDescriptor(t,s,i);void 0!==e&&Object.defineProperty(this.prototype,t,e);}}static getPropertyDescriptor(t,i,s){return {get(){return this[i]},set(e){const r=this[t];this[i]=e,this.requestUpdate(t,r,s);},configurable:!0,enumerable:!0}}static getPropertyOptions(t){return this.elementProperties.get(t)||o$3}static finalize(){if(this.hasOwnProperty("finalized"))return !1;this.finalized=!0;const t=Object.getPrototypeOf(this);if(t.finalize(),this.elementProperties=new Map(t.elementProperties),this._$Eu=new Map,this.hasOwnProperty("properties")){const t=this.properties,i=[...Object.getOwnPropertyNames(t),...Object.getOwnPropertySymbols(t)];for(const s of i)this.createProperty(s,t[s]);}return this.elementStyles=this.finalizeStyles(this.styles),!0}static finalizeStyles(i){const s=[];if(Array.isArray(i)){const e=new Set(i.flat(1/0).reverse());for(const i of e)s.unshift(i$2(i));}else void 0!==i&&s.push(i$2(i));return s}static _$Eh(t,i){const s=i.attribute;return !1===s?void 0:"string"==typeof s?s:"string"==typeof t?t.toLowerCase():void 0}o(){var t;this._$Ev=new Promise((t=>this.enableUpdating=t)),this._$AL=new Map,this._$Ep(),this.requestUpdate(),null===(t=this.constructor.l)||void 0===t||t.forEach((t=>t(this)));}addController(t){var i,s;(null!==(i=this._$Em)&&void 0!==i?i:this._$Em=[]).push(t),void 0!==this.renderRoot&&this.isConnected&&(null===(s=t.hostConnected)||void 0===s||s.call(t));}removeController(t){var i;null===(i=this._$Em)||void 0===i||i.splice(this._$Em.indexOf(t)>>>0,1);}_$Ep(){this.constructor.elementProperties.forEach(((t,i)=>{this.hasOwnProperty(i)&&(this._$Et.set(i,this[i]),delete this[i]);}));}createRenderRoot(){var t;const s=null!==(t=this.shadowRoot)&&void 0!==t?t:this.attachShadow(this.constructor.shadowRootOptions);return S$1(s,this.constructor.elementStyles),s}connectedCallback(){var t;void 0===this.renderRoot&&(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),null===(t=this._$Em)||void 0===t||t.forEach((t=>{var i;return null===(i=t.hostConnected)||void 0===i?void 0:i.call(t)}));}enableUpdating(t){}disconnectedCallback(){var t;null===(t=this._$Em)||void 0===t||t.forEach((t=>{var i;return null===(i=t.hostDisconnected)||void 0===i?void 0:i.call(t)}));}attributeChangedCallback(t,i,s){this._$AK(t,s);}_$Eg(t,i,s=o$3){var e,h;const n=this.constructor._$Eh(t,s);if(void 0!==n&&!0===s.reflect){const o=(null!==(h=null===(e=s.converter)||void 0===e?void 0:e.toAttribute)&&void 0!==h?h:r$2.toAttribute)(i,s.type);this._$Ei=t,null==o?this.removeAttribute(n):this.setAttribute(n,o),this._$Ei=null;}}_$AK(t,i){var s,e,h;const o=this.constructor,n=o._$Eu.get(t);if(void 0!==n&&this._$Ei!==n){const t=o.getPropertyOptions(n),l=t.converter,a=null!==(h=null!==(e=null===(s=l)||void 0===s?void 0:s.fromAttribute)&&void 0!==e?e:"function"==typeof l?l:null)&&void 0!==h?h:r$2.fromAttribute;this._$Ei=n,this[n]=a(i,t.type),this._$Ei=null;}}requestUpdate(t,i,s){let e=!0;void 0!==t&&(((s=s||this.constructor.getPropertyOptions(t)).hasChanged||h$1)(this[t],i)?(this._$AL.has(t)||this._$AL.set(t,i),!0===s.reflect&&this._$Ei!==t&&(void 0===this._$ES&&(this._$ES=new Map),this._$ES.set(t,s))):e=!1),!this.isUpdatePending&&e&&(this._$Ev=this._$EC());}async _$EC(){this.isUpdatePending=!0;try{await this._$Ev;}catch(t){Promise.reject(t);}const t=this.scheduleUpdate();return null!=t&&await t,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){var t;if(!this.isUpdatePending)return;this.hasUpdated,this._$Et&&(this._$Et.forEach(((t,i)=>this[i]=t)),this._$Et=void 0);let i=!1;const s=this._$AL;try{i=this.shouldUpdate(s),i?(this.willUpdate(s),null===(t=this._$Em)||void 0===t||t.forEach((t=>{var i;return null===(i=t.hostUpdate)||void 0===i?void 0:i.call(t)})),this.update(s)):this._$ET();}catch(t){throw i=!1,this._$ET(),t}i&&this._$AE(s);}willUpdate(t){}_$AE(t){var i;null===(i=this._$Em)||void 0===i||i.forEach((t=>{var i;return null===(i=t.hostUpdated)||void 0===i?void 0:i.call(t)})),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(t)),this.updated(t);}_$ET(){this._$AL=new Map,this.isUpdatePending=!1;}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$Ev}shouldUpdate(t){return !0}update(t){void 0!==this._$ES&&(this._$ES.forEach(((t,i)=>this._$Eg(i,this[i],t))),this._$ES=void 0),this._$ET();}updated(t){}firstUpdated(t){}}n$2.finalized=!0,n$2.elementProperties=new Map,n$2.elementStyles=[],n$2.shadowRootOptions={mode:"open"},null===(s$1=globalThis.reactiveElementPlatformSupport)||void 0===s$1||s$1.call(globalThis,{ReactiveElement:n$2}),(null!==(e$2=globalThis.reactiveElementVersions)&&void 0!==e$2?e$2:globalThis.reactiveElementVersions=[]).push("1.0.0-rc.4");

    /**
     * @license
     * Copyright 2017 Google LLC
     * SPDX-License-Identifier: BSD-3-Clause
     */
    var t$1,i$1;const s=globalThis.trustedTypes,e$1=s?s.createPolicy("lit-html",{createHTML:t=>t}):void 0,o$2=`lit$${(Math.random()+"").slice(9)}$`,n$1="?"+o$2,l$2=`<${n$1}>`,h=document,r$1=(t="")=>h.createComment(t),d=t=>null===t||"object"!=typeof t&&"function"!=typeof t,u=Array.isArray,c=t=>{var i;return u(t)||"function"==typeof(null===(i=t)||void 0===i?void 0:i[Symbol.iterator])},v=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,a=/-->/g,f=/>/g,_=/>|[ 	\n\r](?:([^\s"'>=/]+)([ 	\n\r]*=[ 	\n\r]*(?:[^ 	\n\r"'`<>=]|("|')|))|$)/g,g=/'/g,m=/"/g,$=/^(?:script|style|textarea)$/i,p=t=>(i,...s)=>({_$litType$:t,strings:i,values:s}),y=p(1),T=Symbol.for("lit-noChange"),x=Symbol.for("lit-nothing"),w=new WeakMap,A=(t,i,s)=>{var e,o;const n=null!==(e=null==s?void 0:s.renderBefore)&&void 0!==e?e:i;let l=n._$litPart$;if(void 0===l){const t=null!==(o=null==s?void 0:s.renderBefore)&&void 0!==o?o:null;n._$litPart$=l=new S(i.insertBefore(r$1(),t),t,void 0,null!=s?s:{});}return l._$AI(t),l},C=h.createTreeWalker(h,129,null,!1),P=(t,i)=>{const s=t.length-1,n=[];let h,r=2===i?"<svg>":"",d=v;for(let i=0;i<s;i++){const s=t[i];let e,u,c=-1,p=0;for(;p<s.length&&(d.lastIndex=p,u=d.exec(s),null!==u);)p=d.lastIndex,d===v?"!--"===u[1]?d=a:void 0!==u[1]?d=f:void 0!==u[2]?($.test(u[2])&&(h=RegExp("</"+u[2],"g")),d=_):void 0!==u[3]&&(d=_):d===_?">"===u[0]?(d=null!=h?h:v,c=-1):void 0===u[1]?c=-2:(c=d.lastIndex-u[2].length,e=u[1],d=void 0===u[3]?_:'"'===u[3]?m:g):d===m||d===g?d=_:d===a||d===f?d=v:(d=_,h=void 0);const y=d===_&&t[i+1].startsWith("/>")?" ":"";r+=d===v?s+l$2:c>=0?(n.push(e),s.slice(0,c)+"$lit$"+s.slice(c)+o$2+y):s+o$2+(-2===c?(n.push(void 0),i):y);}const u=r+(t[s]||"<?>")+(2===i?"</svg>":"");return [void 0!==e$1?e$1.createHTML(u):u,n]};class V{constructor({strings:t,_$litType$:i},e){let l;this.parts=[];let h=0,d=0;const u=t.length-1,c=this.parts,[v,a]=P(t,i);if(this.el=V.createElement(v,e),C.currentNode=this.el.content,2===i){const t=this.el.content,i=t.firstChild;i.remove(),t.append(...i.childNodes);}for(;null!==(l=C.nextNode())&&c.length<u;){if(1===l.nodeType){if(l.hasAttributes()){const t=[];for(const i of l.getAttributeNames())if(i.endsWith("$lit$")||i.startsWith(o$2)){const s=a[d++];if(t.push(i),void 0!==s){const t=l.getAttribute(s.toLowerCase()+"$lit$").split(o$2),i=/([.?@])?(.*)/.exec(s);c.push({type:1,index:h,name:i[2],strings:t,ctor:"."===i[1]?k:"?"===i[1]?H:"@"===i[1]?I:M});}else c.push({type:6,index:h});}for(const i of t)l.removeAttribute(i);}if($.test(l.tagName)){const t=l.textContent.split(o$2),i=t.length-1;if(i>0){l.textContent=s?s.emptyScript:"";for(let s=0;s<i;s++)l.append(t[s],r$1()),C.nextNode(),c.push({type:2,index:++h});l.append(t[i],r$1());}}}else if(8===l.nodeType)if(l.data===n$1)c.push({type:2,index:h});else {let t=-1;for(;-1!==(t=l.data.indexOf(o$2,t+1));)c.push({type:7,index:h}),t+=o$2.length-1;}h++;}}static createElement(t,i){const s=h.createElement("template");return s.innerHTML=t,s}}function E(t,i,s=t,e){var o,n,l,h;if(i===T)return i;let r=void 0!==e?null===(o=s._$Cl)||void 0===o?void 0:o[e]:s._$Cu;const u=d(i)?void 0:i._$litDirective$;return (null==r?void 0:r.constructor)!==u&&(null===(n=null==r?void 0:r._$AO)||void 0===n||n.call(r,!1),void 0===u?r=void 0:(r=new u(t),r._$AT(t,s,e)),void 0!==e?(null!==(l=(h=s)._$Cl)&&void 0!==l?l:h._$Cl=[])[e]=r:s._$Cu=r),void 0!==r&&(i=E(t,r._$AS(t,i.values),r,e)),i}class N{constructor(t,i){this.v=[],this._$AN=void 0,this._$AD=t,this._$AM=i;}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}p(t){var i;const{el:{content:s},parts:e}=this._$AD,o=(null!==(i=null==t?void 0:t.creationScope)&&void 0!==i?i:h).importNode(s,!0);C.currentNode=o;let n=C.nextNode(),l=0,r=0,d=e[0];for(;void 0!==d;){if(l===d.index){let i;2===d.type?i=new S(n,n.nextSibling,this,t):1===d.type?i=new d.ctor(n,d.name,d.strings,this,t):6===d.type&&(i=new L(n,this,t)),this.v.push(i),d=e[++r];}l!==(null==d?void 0:d.index)&&(n=C.nextNode(),l++);}return o}m(t){let i=0;for(const s of this.v)void 0!==s&&(void 0!==s.strings?(s._$AI(t,s,i),i+=s.strings.length-2):s._$AI(t[i])),i++;}}class S{constructor(t,i,s,e){var o;this.type=2,this._$AH=x,this._$AN=void 0,this._$AA=t,this._$AB=i,this._$AM=s,this.options=e,this._$Cg=null===(o=null==e?void 0:e.isConnected)||void 0===o||o;}get _$AU(){var t,i;return null!==(i=null===(t=this._$AM)||void 0===t?void 0:t._$AU)&&void 0!==i?i:this._$Cg}get parentNode(){let t=this._$AA.parentNode;const i=this._$AM;return void 0!==i&&11===t.nodeType&&(t=i.parentNode),t}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(t,i=this){t=E(this,t,i),d(t)?t===x||null==t||""===t?(this._$AH!==x&&this._$AR(),this._$AH=x):t!==this._$AH&&t!==T&&this.$(t):void 0!==t._$litType$?this.T(t):void 0!==t.nodeType?this.S(t):c(t)?this.M(t):this.$(t);}A(t,i=this._$AB){return this._$AA.parentNode.insertBefore(t,i)}S(t){this._$AH!==t&&(this._$AR(),this._$AH=this.A(t));}$(t){this._$AH!==x&&d(this._$AH)?this._$AA.nextSibling.data=t:this.S(h.createTextNode(t)),this._$AH=t;}T(t){var i;const{values:s,_$litType$:e}=t,o="number"==typeof e?this._$AC(t):(void 0===e.el&&(e.el=V.createElement(e.h,this.options)),e);if((null===(i=this._$AH)||void 0===i?void 0:i._$AD)===o)this._$AH.m(s);else {const t=new N(o,this),i=t.p(this.options);t.m(s),this.S(i),this._$AH=t;}}_$AC(t){let i=w.get(t.strings);return void 0===i&&w.set(t.strings,i=new V(t)),i}M(t){u(this._$AH)||(this._$AH=[],this._$AR());const i=this._$AH;let s,e=0;for(const o of t)e===i.length?i.push(s=new S(this.A(r$1()),this.A(r$1()),this,this.options)):s=i[e],s._$AI(o),e++;e<i.length&&(this._$AR(s&&s._$AB.nextSibling,e),i.length=e);}_$AR(t=this._$AA.nextSibling,i){var s;for(null===(s=this._$AP)||void 0===s||s.call(this,!1,!0,i);t&&t!==this._$AB;){const i=t.nextSibling;t.remove(),t=i;}}setConnected(t){var i;void 0===this._$AM&&(this._$Cg=t,null===(i=this._$AP)||void 0===i||i.call(this,t));}}class M{constructor(t,i,s,e,o){this.type=1,this._$AH=x,this._$AN=void 0,this.element=t,this.name=i,this._$AM=e,this.options=o,s.length>2||""!==s[0]||""!==s[1]?(this._$AH=Array(s.length-1).fill(new String),this.strings=s):this._$AH=x;}get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}_$AI(t,i=this,s,e){const o=this.strings;let n=!1;if(void 0===o)t=E(this,t,i,0),n=!d(t)||t!==this._$AH&&t!==T,n&&(this._$AH=t);else {const e=t;let l,h;for(t=o[0],l=0;l<o.length-1;l++)h=E(this,e[s+l],i,l),h===T&&(h=this._$AH[l]),n||(n=!d(h)||h!==this._$AH[l]),h===x?t=x:t!==x&&(t+=(null!=h?h:"")+o[l+1]),this._$AH[l]=h;}n&&!e&&this.k(t);}k(t){t===x?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,null!=t?t:"");}}class k extends M{constructor(){super(...arguments),this.type=3;}k(t){this.element[this.name]=t===x?void 0:t;}}class H extends M{constructor(){super(...arguments),this.type=4;}k(t){t&&t!==x?this.element.setAttribute(this.name,""):this.element.removeAttribute(this.name);}}class I extends M{constructor(t,i,s,e,o){super(t,i,s,e,o),this.type=5;}_$AI(t,i=this){var s;if((t=null!==(s=E(this,t,i,0))&&void 0!==s?s:x)===T)return;const e=this._$AH,o=t===x&&e!==x||t.capture!==e.capture||t.once!==e.once||t.passive!==e.passive,n=t!==x&&(e===x||o);o&&this.element.removeEventListener(this.name,this,e),n&&this.element.addEventListener(this.name,this,t),this._$AH=t;}handleEvent(t){var i,s;"function"==typeof this._$AH?this._$AH.call(null!==(s=null===(i=this.options)||void 0===i?void 0:i.host)&&void 0!==s?s:this.element,t):this._$AH.handleEvent(t);}}class L{constructor(t,i,s){this.element=t,this.type=6,this._$AN=void 0,this._$AM=i,this.options=s;}get _$AU(){return this._$AM._$AU}_$AI(t){E(this,t);}}null===(t$1=globalThis.litHtmlPlatformSupport)||void 0===t$1||t$1.call(globalThis,V,S),(null!==(i$1=globalThis.litHtmlVersions)&&void 0!==i$1?i$1:globalThis.litHtmlVersions=[]).push("2.0.0-rc.5");

    /**
     * @license
     * Copyright 2017 Google LLC
     * SPDX-License-Identifier: BSD-3-Clause
     */var l$1,o$1,r;class n extends n$2{constructor(){super(...arguments),this.renderOptions={host:this},this._$Dt=void 0;}createRenderRoot(){var t,e;const i=super.createRenderRoot();return null!==(t=(e=this.renderOptions).renderBefore)&&void 0!==t||(e.renderBefore=i.firstChild),i}update(t){const i=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(t),this._$Dt=A(i,this.renderRoot,this.renderOptions);}connectedCallback(){var t;super.connectedCallback(),null===(t=this._$Dt)||void 0===t||t.setConnected(!0);}disconnectedCallback(){var t;super.disconnectedCallback(),null===(t=this._$Dt)||void 0===t||t.setConnected(!1);}render(){return T}}n.finalized=!0,n._$litElement$=!0,null===(l$1=globalThis.litElementHydrateSupport)||void 0===l$1||l$1.call(globalThis,{LitElement:n}),null===(o$1=globalThis.litElementPlatformSupport)||void 0===o$1||o$1.call(globalThis,{LitElement:n});(null!==(r=globalThis.litElementVersions)&&void 0!==r?r:globalThis.litElementVersions=[]).push("3.0.0-rc.4");

    /**
     * @license
     * Copyright 2018 Google LLC
     * SPDX-License-Identifier: BSD-3-Clause
     */const l=l=>null!=l?l:x;

    /**
     * @license
     * Copyright 2017 Google LLC
     * SPDX-License-Identifier: BSD-3-Clause
     */
    const t={ATTRIBUTE:1,CHILD:2,PROPERTY:3,BOOLEAN_ATTRIBUTE:4,EVENT:5,ELEMENT:6},e=t=>(...e)=>({_$litDirective$:t,values:e});class i{constructor(t){}get _$AU(){return this._$AM._$AU}_$AT(t,e,i){this._$Ct=t,this._$AM=e,this._$Ci=i;}_$AS(t,e){return this.update(t,e)}update(t,e){return this.render(...e)}}

    /**
     * @license
     * Copyright 2018 Google LLC
     * SPDX-License-Identifier: BSD-3-Clause
     */const o=e(class extends i{constructor(t$1){var i;if(super(t$1),t$1.type!==t.ATTRIBUTE||"class"!==t$1.name||(null===(i=t$1.strings)||void 0===i?void 0:i.length)>2)throw Error("`classMap()` can only be used in the `class` attribute and must be the only part in the attribute.")}render(t){return " "+Object.keys(t).filter((i=>t[i])).join(" ")+" "}update(i,[s]){var r,o;if(void 0===this.st){this.st=new Set,void 0!==i.strings&&(this.et=new Set(i.strings.join(" ").split(/\s/).filter((t=>""!==t))));for(const t in s)s[t]&&!(null===(r=this.et)||void 0===r?void 0:r.has(t))&&this.st.add(t);return this.render(s)}const e=i.element.classList;this.st.forEach((t=>{t in s||(e.remove(t),this.st.delete(t));}));for(const t in s){const i=!!s[t];i===this.st.has(t)||(null===(o=this.et)||void 0===o?void 0:o.has(t))||(i?(e.add(t),this.st.add(t)):(e.remove(t),this.st.delete(t)));}return T}});

    class Ethern8Icon extends n {
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
        return y`<svg
      aria-hidden=${this.a11yLabel ? 'false' : 'true'}
      aria-labelledby=${l(
        this.a11yLabel ? this.generatedA11yLabelledbyId() : undefined
      )}
      class=${o(classes)}
      focusable=${this.a11yLabel ? 'true' : 'false'}
      role=${l(this.a11yLabel ? 'img' : undefined)}
    >
      ${this.a11yLabel
        ? y`
            <title id=${this._generatedA11yLabelledbyId}>
              ${this.a11yLabel}
            </title>
          `
        : ''}
      <use href=${this.iconHref} xlink:href=${this.iconHref} />
    </svg>`;
      }
    }

    window.customElements.define('code-snippet', CodeSnippet);
    window.customElements.define('ethern8-icon', Ethern8Icon);

}());
//# sourceMappingURL=bundle.js.map
