'use babel';
import fs from 'fs';
import path from 'path';
import $ from 'jquery';
import 'spectrum-colorpicker';
import { CompositeDisposable } from 'atom';
import { spawn } from 'child_process';
import { renderDocument, docToPlainText, ViewRewriter, NodeInserter, DimensionDeleter, EditPreserver, getSelectionForDim, getSelectionForNode, isBranchActive, AlternativeInserter, ASTSearcher } from './ast';
import { VJavaUI } from './ui';
if (!Array.prototype.last) {
    Array.prototype.last = function () {
        return this[this.length - 1];
    };
}
function getdefbranchCssClass(dimName) {
    return 'dimension-marker-' + dimName + "-defbranch";
}
function getndefbranchCssClass(dimName) {
    return 'dimension-marker-' + dimName + "-ndefbranch";
}
function rangeToSpan(range) {
    const span = {
        start: [range.start.row, range.start.column],
        end: [range.end.row, range.end.column]
    };
    return span;
}
function incrementRow(range) {
    return [range[0] + 1, range[1]];
}
function incrementCol(range) {
    return [range[0], range[1] + 1];
}
function decrementRow(range) {
    return [range[0] - 1, range[1]];
}
var linesRemoved = 0;
var linesReAdded = 0;
function shadeColor(rgb, lum) {
    lum = lum || 0;
    lum = lum + 1;
    var parens = rgb.split('(');
    var nums = parens[1].replace(' ', '').split(',');
    return `rgba(${Math.floor(parseInt(nums[0], 10) * lum)}, ${Math.floor(parseInt(nums[1], 10) * lum)}, ${Math.floor(parseInt(nums[2], 10) * lum)}, .3)`;
}
var rendering = false;
const mainDivId = 'variationalJavaUI';
const enclosingDivId = 'enclosingDivJavaUI';
const secondaryDivId = 'variationalJavaUIButtons';
var iconsPath = atom.packages.resolvePackagePath("variational-java") + "/icons";
class VJava {
    constructor() {
        this.styles = {};
        this.addChoiceLockout = false;
    }
    createUI() {
        var mainUIElement = $(`<div id='${enclosingDivId}'><div id='${mainDivId}'></div>
                           <div id='${secondaryDivId}' class='vjava-secondary'>
                             <a href='' id='addNewDimension'><img id='addNewDimensionImg' border="0" src="${iconsPath}/add_square_button.png" width="30" height="30"/> </a>
                           </div></div>`);
        this.ui.panel = atom.workspace.addRightPanel({ item: mainUIElement });
        this.ui.panel.hide();
        this.ui.main = $(`#${mainDivId}`);
        this.ui.secondary = $(`#${secondaryDivId}`);
        this.ui.message = this.ui.main.find("#message");
        this.ui.markers = [];
        $("#addNewDimension").on('mouseover', () => {
            $('#addNewDimensionImg').attr('src', `${iconsPath}/add_square_button_depressed.png`);
        });
        $("#addNewDimension").on('mouseout', () => {
            $('#addNewDimensionImg').attr('src', `${iconsPath}/add_square_button.png`);
        });
        $("#addNewDimension").on('click', () => {
            var dimName = 'NEW';
            var dimension = {
                name: dimName,
                color: 'rgb(127, 71, 62)'
            };
            var nameDiv = $(`<div class='form-group dimension-ui-div' id='new-dimension'><h2><input id='new-dimension-name' class='native-key-bindings new-dimension-name' type='text' value='${dimName}'></h2></div>`);
            this.ui.main.append(nameDiv);
            $('#new-dimension-name').focus();
            $('#new-dimension-name').on('focusout', () => {
                dimName = $('#new-dimension-name').val();
                for (var i = 0; i < this.ui.dimensions.length; i++) {
                    if (this.ui.dimensions[i].name === dimName) {
                        alert('Please select a unique name for this dimension');
                        setTimeout(() => {
                            $('#new-dimension-name').focus();
                        }, 100);
                        return;
                    }
                }
                dimension.name = dimName;
                nameDiv.remove();
                var dimDiv = $(`<div class='form-group dimension-ui-div' id='${dimName}'>
                    <input class="colorpicker" id="${dimName}-colorpicker" value="ab2567">
                    <h2>${dimName}</h2
                    <br>
                    <div class="switch-toggle switch-3 switch-candy">
                        <input id="${dimName}-view-both" name="state-${dimName}" type="radio" checked="checked">
                        <label for="${dimName}-view-both">BOTH</label>
                        <br>
                        <input id="${dimName}-view-thenbranch" name="state-${dimName}" type="radio" checked="">
                        <label for="${dimName}-view-thenbranch">DEF</label>
                        <br>
                        <input id="${dimName}-view-elsebranch" name="state-${dimName}" type="radio">
                        <label for="${dimName}-view-elsebranch">NDEF</label>
                    </div>
                    <a href='' id='removeDimension-${dimName}'><img id='removeDimensionImg' class='delete_icon' border="0" src="${iconsPath}/delete-bin.png" width="16" height="18"/> </a>
                    <br></div>`);
                this.ui.main.append(dimDiv);
                document.getElementById('removeDimension-' + dimName).addEventListener("click", () => {
                    this.removeDimension(dimName);
                });
                this.addViewListeners(dimension);
                this.ui.contextMenu.dispose();
                this.preserveChanges(atom.workspace.getActiveTextEditor());
                this.updateEditorText();
                this.ui.menuItems.push({
                    label: dimName,
                    submenu: [{
                            label: 'When Selected',
                            command: 'variational-java:add-choice-segment-' + dimName + '-selected'
                        },
                        {
                            label: 'When Unselected',
                            command: 'variational-java:add-choice-segment-' + dimName + '-unselected'
                        }]
                });
                this.ui.contextMenu = atom.contextMenu.add({ 'atom-text-editor': [{ label: 'Insert Choice', submenu: this.ui.menuItems }] });
                dimension.colorpicker = $(document.getElementById(dimension.name + '-colorpicker')).spectrum({
                    color: dimension.color,
                    preferredFormat: 'rgb'
                }).on('change', () => {
                    dimension.color = dimension.colorpicker.spectrum('get').toHexString();
                    this.updateDimensionColor(dimension);
                });
                this.ui.dimensions.push(dimension);
                this.ui.activeChoices.push({ name: dimension.name, status: 'BOTH' });
            });
        });
    }
    addViewListeners(dimension) {
        $(`#${dimension.name}-view-both`).on('click', () => {
            this.unsetdimension(dimension.name);
        });
        $(`#${dimension.name}-view-elsebranch`).on('click', () => {
            this.setdimensionundefined(dimension.name);
        });
        $(`#${dimension.name}-view-thenbranch`).on('click', () => {
            this.setdimensiondefined(dimension.name);
        });
    }
    updateDimensionColor(dimension) {
        this.ui.updateSession(dimension);
        for (var i = 0; i < this.doc.segments.length; i++) {
            this.changeDimColor(dimension, this.doc.segments[i]);
        }
        var preserver = new EditPreserver(atom.workspace.getActiveTextEditor(), this.ui.activeChoices, this.ui.regionMarkers);
        preserver.visitDocument(this.doc);
        this.updateEditorText();
    }
    changeDimColor(dimension, node) {
        if (node.type == 'choice') {
            if (node.name == dimension.name) {
                node.color = dimension.color;
            }
            for (var i = 0; i < node.thenbranch.segments.length; i++) {
                this.changeDimColor(dimension, node.thenbranch.segments[i]);
            }
            for (var i = 0; i < node.elsebranch.segments.length; i++) {
                this.changeDimColor(dimension, node.elsebranch.segments[i]);
            }
        }
    }
    clearColors() {
        $("#dimension-color-styles").remove();
        this.styles = {};
    }
    serializeColors() {
        var css = '';
        for (var selector in this.styles) {
            css += selector + ` { ${this.styles[selector]}} \n`;
        }
        return css;
    }
    updateColors(doc) {
        return;
    }
    setColors(node) {
        if (node.type === 'choice') {
            var color = this.ui.getColorForNode(node);
            var defbranchcolor = shadeColor(color, .1);
            var defbranchcursorcolor = shadeColor(color, .2);
            var defbranchhighlightcolor = shadeColor(color, .3);
            var ndefbranchcolor = shadeColor(color, -.3);
            var ndefbranchcursorcolor = shadeColor(color, -.2);
            var ndefbranchhighlightcolor = shadeColor(color, -.1);
            var selectors = [];
            var nestColors = [];
            if (this.nesting.length > 0) {
                for (var j = 0; j < this.nesting.length; j++) {
                    selectors.push('.nested-' + this.nesting[j].selector.name + '-' + this.nesting[j].selector.status + '-' + j);
                    var status = this.nesting[j].selector.status;
                    var nestcolor = this.ui.getColorForNode(this.nesting[j].dimension);
                    var kind = this.nesting[j].dimension.kind;
                    if (status === 'DEF')
                        nestcolor = shadeColor(nestcolor, .1);
                    else
                        nestcolor = shadeColor(nestcolor, -.3);
                    nestColors.push(nestcolor);
                }
                var selector = selectors.join('');
                var x = 0;
                var increment = 1;
                var nestGradient = nestColors[0] + ' 0%';
                for (var j = 1; j < nestColors.length; j++) {
                    x = (j) * increment;
                    nestGradient = `${nestGradient}, ${nestColors[j]} ${x}%`;
                }
                this.styles[`${selector}.${getdefbranchCssClass(node.name)}`] = `background: linear-gradient( 90deg, ${nestGradient}, ${defbranchcolor} ${x + increment}%);`;
                this.styles[`${selector}.${getdefbranchCssClass(node.name)}.cursor-line`] = `background: linear-gradient( 90deg, ${nestGradient}, ${defbranchcursorcolor} ${x + increment}%);`;
                this.styles[`${selector}.${getndefbranchCssClass(node.name)}`] = `background: linear-gradient( 90deg, ${nestGradient}, ${ndefbranchcolor} ${x + increment}%);`;
                this.styles[`${selector}.${getndefbranchCssClass(node.name)}.cursor-line`] = `background: linear-gradient( 90deg, ${nestGradient}, ${ndefbranchcursorcolor} ${x + increment}%);`;
                this.styles[`.hover-alt.${selector}.${getdefbranchCssClass(node.name)}`] = `background: linear-gradient( 90deg, ${nestGradient}, ${defbranchcolor} ${x + increment}%);`;
                this.styles[`.hover-alt.${selector}.${getndefbranchCssClass(node.name)}`] = `background: linear-gradient( 90deg, ${nestGradient}, ${ndefbranchcolor} ${x + increment}%);`;
            }
            else {
                this.styles[`.${getdefbranchCssClass(node.name)}`] = `background-color: ${defbranchcolor};`;
                this.styles[`.${getndefbranchCssClass(node.name)}`] = `background-color: ${ndefbranchcolor};`;
                this.styles[`.${getdefbranchCssClass(node.name)}.cursor-line.line`] = `background-color: ${defbranchcursorcolor};`;
                this.styles[`.${getndefbranchCssClass(node.name)}.cursor-line.line`] = ` background-color: ${ndefbranchcursorcolor};`;
                this.styles[`.${getdefbranchCssClass(node.name)}.line`] = `background-color: ${defbranchhighlightcolor};`;
                this.styles[`.${getndefbranchCssClass(node.name)}.highlight.line`] = ` background-color: ${ndefbranchhighlightcolor};`;
                this.styles[`.hover-alt.${getdefbranchCssClass(node.name)}`] = `background-color: ${defbranchcolor};`;
                this.styles[`.hover-alt.${getndefbranchCssClass(node.name)}`] = `background-color: ${ndefbranchcolor};`;
            }
            var lselector = { name: node.name, status: (node.kind === 'positive') ? "DEF" : "NDEF" };
            this.nesting.push({ selector: lselector, dimension: node });
            for (var i = 0; i < node.thenbranch.segments.length; i++) {
                this.setColors(node.thenbranch.segments[i]);
            }
            this.nesting.pop();
            var rselector = { name: node.name, status: (node.kind === 'positive') ? "NDEF" : "DEF" };
            this.nesting.push({ selector: rselector, dimension: node });
            for (var i = 0; i < node.elsebranch.segments.length; i++) {
                this.setColors(node.elsebranch.segments[i]);
            }
            this.nesting.pop();
        }
    }
    updateSelections(selection) {
        for (let sel of this.ui.activeChoices) {
            if (sel.name === selection.name) {
                sel.status = selection.status;
                return;
            }
        }
        this.ui.activeChoices.push(selection);
    }
    renderDimensionUI(editor, node) {
        if (node.type === "choice") {
            if (!this.ui.hasDimension(node.name)) {
                var previousSelection = false;
                for (var i = 0; i < this.ui.activeChoices.length; i++) {
                    if (this.ui.activeChoices[i].name === node.name) {
                        previousSelection = true;
                        break;
                    }
                }
                if (!previousSelection)
                    this.ui.activeChoices.push({ name: node.name, status: 'BOTH' });
                var dimDiv = $(`<div class='form-group dimension-ui-div' id='${node.name}'>
              <input class='colorpicker' type='text' id="${node.name}-colorpicker">
              <h2>${node.name}</h2>
              <br>
              <div class="switch-toggle switch-3 switch-candy">

                  <input id="${node.name}-view-both" name="state-${node.name}" type="radio" ${this.ui.shouldBeChecked('BOTH', node.name)} >
                  <label for="${node.name}-view-both">BOTH</label>
                  <br>
                  <input id="${node.name}-view-thenbranch" name="state-${node.name}" type="radio" ${this.ui.shouldBeChecked('DEF', node.name)} >
                  <label for="${node.name}-view-thenbranch">DEF</label>
                  <br>
                  <input id="${node.name}-view-elsebranch" name="state-${node.name}" type="radio" ${this.ui.shouldBeChecked('NDEF', node.name)} >
                  <label for="${node.name}-view-elsebranch">NDEF</label>

                  <a></a>
              </div>
              <a href='' id='removeDimension-${node.name}' class='delete_icon'><img name='removeDimensionImg' border="0" src="${iconsPath}/delete-bin.png" width="16" height="18"/> </a>
              <br></div>  `);
                this.ui.main.append(dimDiv);
                document.getElementById('removeDimension-' + node.name).addEventListener("click", () => {
                    this.removeDimension(node.name);
                });
                var menuItem = {
                    label: node.name,
                    submenu: [{
                            label: 'When Selected',
                            command: 'variational-java:add-choice-segment-' + node.name + '-selected'
                        },
                        {
                            label: 'When Unselected',
                            command: 'variational-java:add-choice-segment-' + node.name + '-unselected'
                        }]
                };
                var whenSelectedSub = {};
                whenSelectedSub[`variational-java:add-choice-segment-${node.name}-selected`] = () => this.addChoiceSegment(node.name, "DEF");
                var whenUnselectedSub = {};
                whenUnselectedSub[`variational-java:add-choice-segment-${node.name}-unselected`] = () => this.addChoiceSegment(node.name, "NDEF");
                this.subscriptions.add(atom.commands.add('atom-text-editor', whenSelectedSub));
                this.subscriptions.add(atom.commands.add('atom-text-editor', whenUnselectedSub));
                this.ui.menuItems.push(menuItem);
                var uiColor = this.ui.getColorForNode(node);
                var dimUIElement = this.ui.setupColorPickerForDim(node.name, editor);
                dimUIElement.colorpicker.on('change', () => {
                    var rgba = dimUIElement.colorpicker.spectrum('get').toRgbString();
                    dimUIElement.color = rgba;
                    this.updateDimensionColor(dimUIElement);
                });
                this.addViewListeners(dimUIElement);
            }
            if (isBranchActive(node, getSelectionForNode(node, this.ui.activeChoices), "thenbranch") && node.thenbranch.segments.length > 0 && !node.thenbranch.hidden) {
                var thenbranchMarker = editor.markBufferRange(node.thenbranch.span, { invalidate: 'surround' });
                this.ui.regionMarkers.push(thenbranchMarker);
                editor.decorateMarker(thenbranchMarker, { type: 'line', class: node.kind === 'positive' ? getdefbranchCssClass(node.name) : getndefbranchCssClass(node.name) });
                thenbranchMarker.onDidDestroy(() => {
                    this.preserveChanges(editor);
                    this.updateEditorText();
                });
                var thenSyntaxMarker = editor.markBufferPosition(node.thenbranch.span.start);
                this.ui.markers.push(thenSyntaxMarker);
                var syntaxView = document.createElement('div');
                syntaxView.textContent = (node.kind === 'positive' ? '#ifdef ' : '#ifndef ') + node.name;
                editor.decorateMarker(thenSyntaxMarker, { type: 'block', position: 'before', item: syntaxView });
                var element = document.createElement('div');
                for (var i = this.nesting.length - 1; i >= 0; i--) {
                    var nestclass = 'nested-' + this.nesting[i].selector.name + '-' + this.nesting[i].selector.status + '-' + i;
                    editor.decorateMarker(thenbranchMarker, { type: 'line', class: nestclass });
                    element.classList.add(nestclass);
                }
                if (node.elsebranch.segments.length == 0 && node.elsebranch.hidden == false) {
                    element.textContent = '(+)';
                    element.classList.add(`insert-alt-${node.name}`);
                    element.classList.add(`insert-alt`);
                    element.classList.add(node.kind === 'positive' ? getndefbranchCssClass(node.name) : getdefbranchCssClass(node.name));
                    var elseHiddenMarker = editor.markBufferPosition(node.thenbranch.span.end);
                    this.ui.markers.push(elseHiddenMarker);
                    editor.decorateMarker(elseHiddenMarker, { type: 'block', position: 'after', item: element });
                    var vjava = this;
                    element.onclick = () => {
                        vjava.preserveChanges(editor);
                        var newNode = {
                            type: "text",
                            content: "\n\n"
                        };
                        var inserter = new AlternativeInserter(newNode, thenbranchMarker.getBufferRange().end, "elsebranch", node.name);
                        vjava.doc = inserter.rewriteDocument(vjava.doc);
                        vjava.updateEditorText();
                    };
                }
                else if (node.elsebranch.hidden && node.elsebranch.segments.length > 0) {
                    element.textContent = '(...)';
                    element.classList.add(`hover-alt-${node.name}`);
                    element.classList.add(`hover-alt`);
                    element.classList.add(node.kind === 'positive' ? getndefbranchCssClass(node.name) : getdefbranchCssClass(node.name));
                    this.popupListenerQueue.push({ element: element, text: renderDocument(node.elsebranch) });
                    var elseHiddenMarker = editor.markBufferPosition(node.thenbranch.span.end);
                    this.ui.markers.push(elseHiddenMarker);
                    editor.decorateMarker(elseHiddenMarker, { type: 'block', position: 'after', item: element });
                    element.onclick = () => { $(`#${node.name}-view-both`).click(); };
                }
                this.nesting.push({ selector: { name: node.name, status: (node.kind === 'positive') ? "DEF" : "NDEF" }, dimension: node });
                for (var i = 0; i < node.thenbranch.segments.length; i++) {
                    this.renderDimensionUI(editor, node.thenbranch.segments[i]);
                }
                this.nesting.pop();
            }
            if (isBranchActive(node, getSelectionForNode(node, this.ui.activeChoices), "elsebranch") && node.elsebranch.segments.length > 0 && !node.elsebranch.hidden) {
                var elsebranchMarker = editor.markBufferRange(node.elsebranch.span, { invalidate: 'surround' });
                elsebranchMarker.onDidDestroy(() => {
                    this.preserveChanges(editor);
                    this.updateEditorText();
                });
                this.ui.regionMarkers.push(elsebranchMarker);
                var elseSyntaxMarker = editor.markBufferPosition(node.elsebranch.span.start);
                this.ui.markers.push(elseSyntaxMarker);
                var syntaxView = document.createElement('div');
                syntaxView.textContent = '#else';
                editor.decorateMarker(elseSyntaxMarker, { type: 'block', position: 'before', item: syntaxView });
                var endSyntaxMarker = editor.markBufferPosition(node.elsebranch.span.end);
                this.ui.markers.push(endSyntaxMarker);
                var syntaxView = document.createElement('div');
                syntaxView.textContent = '#endif';
                editor.decorateMarker(endSyntaxMarker, { type: 'block', position: 'after', item: syntaxView });
                var element = document.createElement('div');
                editor.decorateMarker(elsebranchMarker, { type: 'line', class: node.kind === 'positive' ? getndefbranchCssClass(node.name) : getdefbranchCssClass(node.name) });
                for (var i = this.nesting.length - 1; i >= 0; i--) {
                    var nestclass = 'nested-' + this.nesting[i].selector.name + '-' + this.nesting[i].selector.status + '-' + i;
                    editor.decorateMarker(elsebranchMarker, { type: 'line', class: nestclass });
                    element.classList.add(nestclass);
                }
                if (node.thenbranch.segments.length == 0 && node.thenbranch.hidden == false) {
                    element.textContent = '(+)';
                    element.classList.add(`insert-alt-${node.name}`);
                    element.classList.add(`insert-alt`);
                    element.classList.add(node.kind === 'positive' ? getdefbranchCssClass(node.name) : getndefbranchCssClass(node.name));
                    var thenHiddenMarker = editor.markBufferPosition(node.elsebranch.span.start);
                    this.ui.markers.push(thenHiddenMarker);
                    editor.decorateMarker(thenHiddenMarker, { type: 'block', position: 'before', item: element });
                    var vjava = this;
                    element.onclick = () => {
                        vjava.preserveChanges(editor);
                        var newNode = {
                            type: "text",
                            content: "\n"
                        };
                        var inserter = new AlternativeInserter(newNode, elsebranchMarker.getBufferRange().start, "thenbranch", node.name);
                        vjava.doc = inserter.rewriteDocument(vjava.doc);
                        vjava.updateEditorText();
                    };
                }
                else if (node.thenbranch.hidden && node.thenbranch.segments.length > 0) {
                    element.textContent = '(...)';
                    element.classList.add(`hover-alt-${node.name}`);
                    element.classList.add(`hover-alt`);
                    element.classList.add(node.kind === 'positive' ? getdefbranchCssClass(node.name) : getndefbranchCssClass(node.name));
                    this.popupListenerQueue.push({ element: element, text: renderDocument(node.thenbranch) });
                    var thenHiddenMarker = editor.markBufferPosition(node.elsebranch.span.start);
                    this.ui.markers.push(thenHiddenMarker);
                    editor.decorateMarker(thenHiddenMarker, { type: 'block', position: 'before', item: element });
                    element.onclick = () => { $(`#${node.name}-view-both`).click(); };
                }
                this.nesting.push({ selector: { name: node.name, status: (node.kind === 'positive') ? "NDEF" : "NDEF" }, dimension: node });
                for (var i = 0; i < node.elsebranch.segments.length; i++) {
                    this.renderDimensionUI(editor, node.elsebranch.segments[i]);
                }
                this.nesting.pop();
            }
            else {
                var endSyntaxMarker = editor.markBufferPosition(node.thenbranch.span.end);
                this.ui.markers.push(endSyntaxMarker);
                var syntaxView = document.createElement('div');
                syntaxView.textContent = '#endif';
                editor.decorateMarker(endSyntaxMarker, { type: 'block', position: 'after', item: syntaxView });
            }
        }
        else {
            var m = editor.markBufferRange(node.span, { invalidate: 'surround' });
            this.ui.markers.push(m);
            node.marker = m;
        }
    }
    removeDimension(dimName) {
        var sure = confirm('Are you sure you want to remove this dimension? Any currently \
              visible code in this dimension will be promoted. Any hidden code will be removed.');
        if (sure) {
            for (var i = 0; i < this.ui.dimensions.length; i++) {
                if (this.ui.dimensions[i].name === dimName) {
                    this.ui.dimensions.splice(i, 1);
                    $("#" + dimName).remove();
                }
            }
            var selection = getSelectionForDim(dimName, this.ui.activeChoices);
            this.deleteDimension(selection);
            this.updateEditorText();
        }
        else {
            return;
        }
    }
    deleteDimension(selection) {
        this.preserveChanges(atom.workspace.getActiveTextEditor());
        var deleter = new DimensionDeleter(selection);
        this.doc = deleter.rewriteRegion(this.doc);
        this.updateEditorText();
        for (var i = 0; i < this.ui.menuItems.length; i++) {
            if (this.ui.menuItems[i].label === selection.name) {
                this.ui.menuItems.splice(i, 1);
            }
        }
        this.ui.contextMenu.dispose();
        this.ui.contextMenu = atom.contextMenu.add({ 'atom-text-editor': [{ label: 'Insert Choice', submenu: this.ui.menuItems }] });
    }
    deleteBranch(region, editor) {
        for (let segment of region.segments) {
            if (segment.type === 'choice') {
                this.deleteBranch(segment.thenbranch, editor);
                this.deleteBranch(segment.elsebranch, editor);
            }
            else {
                editor.setTextInBufferRange(segment.marker.getBufferRange(), '');
            }
        }
    }
    preserveChanges(editor) {
        var preserver = new EditPreserver(editor, this.ui.activeChoices, this.ui.regionMarkers);
        return preserver.visitDocument(this.doc);
    }
    parseVJava(textContents, next) {
        const packagePath = atom.packages.resolvePackagePath("variational-java");
        const parserPath = path.resolve(packagePath, "lib", "variational-parser");
        const parserProcess = spawn(parserPath, [], { cwd: packagePath });
        parserProcess.stdout.setEncoding('utf8');
        let data = '';
        parserProcess.stdout.on('data', (chunk) => {
            data += chunk.toString();
        });
        parserProcess.on('exit', (code) => {
            console.log('child process exited with code ' + code);
            this.doc = JSON.parse(data);
            next();
        });
        parserProcess.stdin.write(textContents);
        parserProcess.stdin.end();
    }
    setdimensionundefined(dimName) {
        var editor = atom.workspace.getActiveTextEditor();
        this.preserveChanges(editor);
        for (var i = 0; i < this.ui.activeChoices.length; i++) {
            if (this.ui.activeChoices[i].name === dimName) {
                this.ui.activeChoices[i].status = 'NDEF';
            }
        }
        this.updateEditorText();
    }
    unsetdimension(dimName) {
        var editor = atom.workspace.getActiveTextEditor();
        this.preserveChanges(editor);
        for (var i = 0; i < this.ui.activeChoices.length; i++) {
            if (this.ui.activeChoices[i].name === dimName) {
                this.ui.activeChoices[i].status = 'BOTH';
            }
        }
        this.updateEditorText();
    }
    updateEditorText() {
        var editor = atom.workspace.getActiveTextEditor();
        var showDoc = new ViewRewriter(this.ui.activeChoices).rewriteDocument(this.doc);
        this.lastShowDoc = showDoc;
        editor.setText(renderDocument(showDoc));
        for (var marker of this.ui.markers) {
            marker.destroy();
        }
        this.ui.markers = [];
        this.ui.regionMarkers = [];
        this.tooltips.dispose();
        for (var i = 0; i < showDoc.segments.length; i++) {
            this.renderDimensionUI(editor, showDoc.segments[i]);
        }
        for (var popup of this.popupListenerQueue) {
            this.tooltips.add(atom.tooltips.add(popup.element, { title: popup.text }));
        }
        this.popupListenerQueue = [];
        this.updateColors(showDoc);
    }
    setdimensiondefined(dimName) {
        var editor = atom.workspace.getActiveTextEditor();
        this.preserveChanges(editor);
        for (var i = 0; i < this.ui.activeChoices.length; i++) {
            if (this.ui.activeChoices[i].name === dimName) {
                this.ui.activeChoices[i].status = 'DEF';
            }
        }
        this.updateEditorText();
    }
    activate(state) {
        this.state = "parsed";
        this.ui = new VJavaUI(state);
        this.nesting = [];
        this.ui.menuItems = [];
        this.popupListenerQueue = [];
        this.tooltips = new CompositeDisposable();
        var activeEditor = atom.workspace.getActiveTextEditor();
        var contents = activeEditor.getText();
        this.parseVJava(contents, () => {
            this.subscriptions = new CompositeDisposable();
            this.createUI();
            this.updateEditorText();
            this.ui.contextMenu = atom.contextMenu.add({ 'atom-text-editor': [{ label: 'Insert Choice', submenu: this.ui.menuItems }] });
            this.subscriptions.add(atom.commands.add('atom-workspace', {
                'variational-java:toggle': () => this.toggle()
            }));
            this.subscriptions.add(atom.commands.add('atom-workspace', {
                'variational-java:undo': () => this.noUndoForYou()
            }));
            atom.views.getView(activeEditor).addEventListener("keyup", (event) => { this.KeyUpCheck(event); });
            atom.views.getView(activeEditor).addEventListener("keydown", (event) => { this.KeyDownCheck(event); });
            this.saveSubscription = activeEditor.onDidSave(this.handleDidSave.bind(this));
            this.raw = contents;
            this.ui.panel.show();
            var pathBits = activeEditor.getPath().split('.');
            activeEditor.saveAs(pathBits.splice(0, pathBits.length - 1).join('.') + '-temp-vjava.' + pathBits[pathBits.length - 1]);
        });
    }
    KeyDownCheck(event) {
        if (this.state === "parsed") {
            var searcher = new ASTSearcher(this.doc);
            var activeEditor = atom.workspace.getActiveTextEditor();
            var location = activeEditor.getCursorBufferPosition();
            this.lastCursorLocation = location;
        }
    }
    KeyUpCheck(event) {
        var KeyID = event.keyCode;
        if (this.state === "parsed") {
            switch (KeyID) {
                case 8:
                    var searcher = new ASTSearcher(this.lastShowDoc);
                    var activeEditor = atom.workspace.getActiveTextEditor();
                    if (searcher.isLocationAtStartOfSpan(this.lastCursorLocation)) {
                        this.updateEditorText();
                        activeEditor.setCursorBufferPosition(this.lastCursorLocation);
                    }
                    break;
                case 46:
                    var searcher = new ASTSearcher(this.lastShowDoc);
                    var activeEditor = atom.workspace.getActiveTextEditor();
                    if (searcher.isLocationAtEndOfSpan(this.lastCursorLocation)) {
                        this.updateEditorText();
                        activeEditor.setCursorBufferPosition(this.lastCursorLocation);
                    }
                    break;
                default:
                    break;
            }
            setTimeout(() => {
                var activeEditor = atom.workspace.getActiveTextEditor();
                var location = activeEditor.getCursorBufferPosition();
                this.lastCursorLocation = location;
                if (this.preserveChanges(activeEditor)) {
                    this.updateEditorText();
                    activeEditor.setCursorBufferPosition(this.lastCursorLocation);
                }
            }, 20);
        }
    }
    getOriginalPath(path) {
        var pathBits = path.split('-temp-vjava');
        var originalPath = pathBits.splice(0, pathBits.length).join('');
        return originalPath;
    }
    handleDidSave(event) {
        var activeEditor = atom.workspace.getActiveTextEditor();
        var originalPath = this.getOriginalPath(event.path);
        this.preserveChanges(activeEditor);
        fs.writeFile(originalPath, docToPlainText(this.doc), function (err) {
            if (err) {
                return console.log(err);
            }
            console.log("The file was saved!");
        });
    }
    noUndoForYou() {
        if (this.state === "parsed")
            return;
        atom.commands.dispatch(atom.views.getView(atom.workspace.getActiveTextEditor()), "core:undo");
    }
    deactivate() {
    }
    serialize() {
        var dims = [];
        for (var dimension of this.ui.dimensions) {
            dims.push({ color: dimension.color, name: dimension.name, colorpicker: null });
        }
        var ses = [];
        for (var dimension of this.ui.session) {
            ses.push({ color: dimension.color, name: dimension.name, colorpicker: null });
        }
        return { session: ses, dimensions: dims, activeChoices: this.ui.activeChoices };
    }
    addChoiceSegment(dim, status) {
        if (this.addChoiceLockout)
            return;
        this.addChoiceLockout = true;
        var activeEditor = atom.workspace.getActiveTextEditor();
        var lit = 'new dimension';
        var location = activeEditor.getCursorBufferPosition();
        var node = {
            span: null,
            name: dim,
            kind: status === 'DEF' ? 'positive' : 'contrapositive',
            type: 'choice',
            thenbranch: { segments: [], type: "region" },
            elsebranch: { segments: [], type: "region" }
        };
        node.thenbranch.segments = [
            {
                span: null,
                marker: null,
                content: '\n' + lit + '\n',
                type: 'text'
            }
        ];
        this.preserveChanges(activeEditor);
        var inserter = new NodeInserter(node, location, activeEditor);
        this.doc = inserter.rewriteDocument(this.doc);
        this.updateEditorText();
        setTimeout(() => { this.addChoiceLockout = false; }, 500);
    }
    toggle() {
        var activeEditor = atom.workspace.getActiveTextEditor();
        if (this.state === "parsed") {
            this.state = "unparsed";
            this.preserveChanges(activeEditor);
            this.ui.panel.destroy();
            this.ui.dimensions = [];
            this.ui.menuItems = [];
            for (var marker of this.ui.markers) {
                marker.destroy();
            }
            this.ui.markers = [];
            var tempPath = activeEditor.getPath();
            this.saveSubscription.dispose();
            activeEditor.setText(docToPlainText(this.doc));
            activeEditor.saveAs(this.getOriginalPath(activeEditor.getPath()));
            fs.unlink(tempPath, function (err) {
                if (err)
                    console.log(err);
            });
            this.ui.contextMenu.dispose();
        }
        else {
            this.state = "parsed";
            rendering = true;
            var contents = activeEditor.getText();
            this.parseVJava(contents, () => {
                this.ui.dimensions = [];
                this.createUI();
                this.updateEditorText();
                this.ui.contextMenu = atom.contextMenu.add({ 'atom-text-editor': [{ label: 'Insert Choice', submenu: this.ui.menuItems }] });
                this.raw = contents;
                this.ui.panel.show();
                var pathBits = activeEditor.getPath().split('.');
                activeEditor.saveAs(pathBits.splice(0, pathBits.length - 1).join('.') + '-temp-vjava.' + pathBits[pathBits.length - 1]);
                this.saveSubscription = activeEditor.onDidSave(this.handleDidSave.bind(this));
            });
            rendering = false;
        }
        return (true);
    }
}
;
export default new VJava();
