'use babel';
import fs from 'fs';
import path from 'path';
import $ from 'jquery';
import 'spectrum-colorpicker';
import { CompositeDisposable } from 'atom';
import { spawn } from 'child_process';
import { renderDocument, docToPlainText, ViewRewriter, NodeInserter, DimensionDeleter, EditPreserver, getSelectionForDim, getSelectionForNode, isBranchActive, AlternativeInserter } from './ast';
import { VJavaUI } from './ui';
if (!Array.prototype.last) {
    Array.prototype.last = function () {
        return this[this.length - 1];
    };
}
function getthenbranchCssClass(dimName) {
    return 'dimension-marker-' + dimName + "-thenbranch";
}
function getelsebranchCssClass(dimName) {
    return 'dimension-marker-' + dimName + "-elsebranch";
}
function rangeToSpan(range) {
    const span = {
        start: [range.start.row, range.start.column],
        end: [range.end.row, range.end.column]
    };
    return span;
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
                    <a href='' id='removeDimension-${dimName}'><img id='removeDimensionImg' class='delete_icon' border="0" src="${iconsPath}/delete-bin.png" width="16" height="18"/> </a>
                    <input class="jscolor" id="${dimName}-colorpicker" value="ab2567">
                    <h2>${dimName}</h2
                    <br>
                    <div class="switch-toggle switch-3 switch-candy">
                        <input id="${dimName}-view-thenbranch" name="state-d" type="radio" checked="">
                        <label for="${dimName}-view-thenbranch">DEF</label>

                        <input id="${dimName}-view-both" name="state-d" type="radio" checked="checked">
                            <label for="${dimName}-view-both">BOTH</label>

                        <input id="${dimName}-view-elsebranch" name="state-d" type="radio">
                        <label for="${dimName}-view-elsebranch">NDEF</label>
                    </div>
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
            });
        });
    }
    addViewListeners(dimension) {
        $(`#${dimension.name}-view-both`).on('click', () => {
            this.selectelsebranch(dimension.name);
            this.selectthenbranch(dimension.name);
        });
        $(`#${dimension.name}-view-elsebranch`).on('click', () => {
            this.unselectthenbranch(dimension.name);
            this.selectelsebranch(dimension.name);
        });
        $(`#${dimension.name}-view-thenbranch`).on('click', () => {
            this.selectthenbranch(dimension.name);
            this.unselectelsebranch(dimension.name);
        });
    }
    updateDimensionColor(dimension) {
        this.ui.updateSession(dimension);
        for (var i = 0; i < this.doc.segments.length; i++) {
            this.changeDimColor(dimension, this.doc.segments[i]);
        }
        var preserver = new EditPreserver(atom.workspace.getActiveTextEditor(), this.selections);
        preserver.visitRegion(this.doc);
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
        this.clearColors();
        for (var i = 0; i < doc.segments.length; i++) {
            this.setColors(doc.segments[i]);
        }
        var css = this.serializeColors();
        $('head').append(`<style id='dimension-color-styles'>${css}</style>`);
    }
    setColors(node) {
        if (node.type === 'choice') {
            var color = this.ui.getColorForNode(node);
            if (node.kind === 'positive') {
                var thenbranchcolor = shadeColor(color, .1);
                var thenbranchcursorcolor = shadeColor(color, .15);
                var thenbranchhighlightcolor = shadeColor(color, .35);
                var elsebranchcolor = shadeColor(color, -.1);
                var elsebranchcursorcolor = shadeColor(color, -.05);
                var elsebranchhighlightcolor = shadeColor(color, -.15);
            }
            else {
                var thenbranchcursorcolor = shadeColor(color, -.05);
                var thenbranchhighlightcolor = shadeColor(color, .15);
                var thenbranchcolor = shadeColor(color, -.1);
                var elsebranchcolor = shadeColor(color, .1);
                var elsebranchcursorcolor = shadeColor(color, .15);
                var elsebranchhighlightcolor = shadeColor(color, .35);
            }
            var selectors = [];
            var nestColors = [];
            if (this.nesting.length > 0) {
                for (var j = 0; j < this.nesting.length; j++) {
                    selectors.push('.nested-' + this.nesting[j].selector.name + '-' + this.nesting[j].selector.branch + '-' + j);
                    var branch = this.nesting[j].selector.branch;
                    var nestcolor = this.ui.getColorForNode(this.nesting[j].dimension);
                    var kind = this.nesting[j].dimension.kind;
                    if ((branch === 'thenbranch' && kind === 'positive') || (branch === 'elsebranch' && kind === 'contrapositive'))
                        nestcolor = shadeColor(nestcolor, .1);
                    else
                        nestcolor = shadeColor(nestcolor, -.1);
                    nestColors.push(nestcolor);
                }
                var selector = selectors.join(' ');
                var x = 0;
                var increment = 1;
                var nestGradient = nestColors[0] + ' 0%';
                for (var j = 1; j < nestColors.length; j++) {
                    x = (j) * increment;
                    nestGradient = `${nestGradient}, ${nestColors[j]} ${x}%`;
                }
                this.styles[`${selector}.${getthenbranchCssClass(node.name)}`] = `background: linear-gradient( 90deg, ${nestGradient}, ${thenbranchcolor} ${x + increment}%);`;
                this.styles[`${selector}.${getthenbranchCssClass(node.name)}.cursor-line`] = `background: linear-gradient( 90deg, ${nestGradient}, ${thenbranchcursorcolor} ${x + increment}%);`;
                this.styles[`${selector}.${getelsebranchCssClass(node.name)}`] = `background: linear-gradient( 90deg, ${nestGradient}, ${elsebranchcolor} ${x + increment}%);`;
                this.styles[`${selector}.${getelsebranchCssClass(node.name)}.cursor-line`] = `background: linear-gradient( 90deg, ${nestGradient}, ${elsebranchcursorcolor} ${x + increment}%);`;
                this.styles[`.hover-alt.${selector}.${getthenbranchCssClass(node.name)}`] = `background: linear-gradient( 90deg, ${nestGradient}, ${thenbranchcolor} ${x + increment}%);`;
                this.styles[`.hover-alt.${selector}.${getelsebranchCssClass(node.name)}`] = `background: linear-gradient( 90deg, ${nestGradient}, ${elsebranchcolor} ${x + increment}%);`;
            }
            else {
                this.styles[`.${getthenbranchCssClass(node.name)}`] = `background-color: ${thenbranchcolor};`;
                this.styles[`.${getelsebranchCssClass(node.name)}`] = `background-color: ${elsebranchcolor};`;
                this.styles[`.${getthenbranchCssClass(node.name)}.cursor-line.line`] = `background-color: ${thenbranchcursorcolor};`;
                this.styles[`.${getelsebranchCssClass(node.name)}.cursor-line.line`] = ` background-color: ${elsebranchcursorcolor};`;
                this.styles[`.${getthenbranchCssClass(node.name)}.line`] = `background-color: ${thenbranchhighlightcolor};`;
                this.styles[`.${getelsebranchCssClass(node.name)}.highlight.line`] = ` background-color: ${elsebranchhighlightcolor};`;
                this.styles[`.hover-alt.${getthenbranchCssClass(node.name)}`] = `background-color: ${thenbranchcolor};`;
                this.styles[`.hover-alt.${getelsebranchCssClass(node.name)}`] = `background-color: ${elsebranchcolor};`;
            }
            var lselector = { name: node.name, branch: "thenbranch" };
            this.nesting.push({ selector: lselector, dimension: node });
            for (var i = 0; i < node.thenbranch.segments.length; i++) {
                this.setColors(node.thenbranch.segments[i]);
            }
            this.nesting.pop();
            var rselector = { name: node.name, branch: "elsebranch" };
            this.nesting.push({ selector: rselector, dimension: node });
            for (var i = 0; i < node.elsebranch.segments.length; i++) {
                this.setColors(node.elsebranch.segments[i]);
            }
            this.nesting.pop();
        }
    }
    toggleDimensionEdit(dimension, branch) {
        var otherbranch;
        if (branch === 'thenbranch')
            otherbranch = 'elsebranch';
        else
            otherbranch = 'thenbranch';
        if ($(`#${dimension.name}-edit-${branch}`).hasClass('edit-enabled')) {
            $(`#${dimension.name}-edit-${branch}`).removeClass('edit-enabled');
            $(`#${dimension.name}-edit-${branch}`).addClass('edit-locked');
            this.ui.removeActiveChoice(dimension.name, branch);
        }
        else {
            $(`#${dimension.name}-edit-${branch}`).addClass('edit-enabled');
            $(`#${dimension.name}-edit-${branch}`).removeClass('edit-locked');
            this.ui.updateActiveChoices(dimension.name, branch);
        }
        if ($(`#${dimension.name}-edit-${otherbranch}`).hasClass('edit-enabled')) {
            $(`#${dimension.name}-edit-${otherbranch}`).removeClass('edit-enabled');
            $(`#${dimension.name}-edit-${otherbranch}`).addClass('edit-locked');
            this.ui.removeActiveChoice(dimension.name, branch);
        }
    }
    updateSelections(selection) {
        for (let sel of this.selections) {
            if (sel.name === selection.name) {
                sel.thenbranch = selection.thenbranch;
                sel.elsebranch = selection.elsebranch;
                return;
            }
        }
        this.selections.push(selection);
    }
    renderDimensionUI(editor, node) {
        if (node.type === "choice") {
            if (!this.ui.hasDimension(node.name)) {
                this.updateSelections({ name: node.name, thenbranch: true, elsebranch: true });
                var dimDiv = $(`<div class='form-group dimension-ui-div' id='${node.name}'>
              <a href='' id='removeDimension-${node.name}' class='delete_icon'><img name='removeDimensionImg' border="0" src="${iconsPath}/delete-bin.png" width="16" height="18"/> </a>
              <input type='text' id="${node.name}-colorpicker">
              <h2>${node.name}</h2>
              <br>
              <div class="switch-toggle switch-3 switch-candy">
                  <input id="${node.name}-view-thenbranch" name="state-d" type="radio" checked="">
                  <label for="${node.name}-view-thenbranch">DEF</label>

                  <input id="${node.name}-view-both" name="state-d" type="radio" checked="checked">
                      <label for="${node.name}-view-both">BOTH</label>

                  <input id="${node.name}-view-elsebranch" name="state-d" type="radio">
                  <label for="${node.name}-view-elsebranch">NDEF</label>

                  <a></a>
              </div>
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
                whenSelectedSub[`variational-java:add-choice-segment-${node.name}-selected`] = () => this.addChoiceSegment(node.name, "thenbranch");
                var whenUnselectedSub = {};
                whenUnselectedSub[`variational-java:add-choice-segment-${node.name}-unselected`] = () => this.addChoiceSegment(node.name, "elsebranch");
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
                var choice = this.ui.getChoice(node.name);
                var dimUIElement = this.ui.getDimUIElementByName(node.name);
                if (choice) {
                    this.toggleDimensionEdit(dimUIElement, choice.branch);
                }
            }
            if (isBranchActive(node, getSelectionForNode(node, this.selections), "thenbranch") && node.thenbranch.segments.length > 0 && !node.thenbranch.hidden) {
                var thenbranchMarker = editor.markBufferRange(node.thenbranch.span, { invalidate: 'surround' });
                this.ui.markers.push(thenbranchMarker);
                editor.decorateMarker(thenbranchMarker, { type: 'line', class: getthenbranchCssClass(node.name) });
                var element = document.createElement('div');
                for (var i = this.nesting.length - 1; i >= 0; i--) {
                    var nestclass = 'nested-' + this.nesting[i].selector.name + '-' + this.nesting[i].selector.branch + '-' + i;
                    editor.decorateMarker(thenbranchMarker, { type: 'line', class: nestclass });
                    element.classList.add(nestclass);
                }
                if (node.elsebranch.segments.length == 0) {
                    element.textContent = '(+)';
                    element.classList.add(`insert-alt-${node.name}`);
                    element.classList.add(`insert-alt`);
                    element.classList.add(getelsebranchCssClass(node.name));
                    var elseHiddenMarker = editor.markBufferPosition(node.thenbranch.span.end);
                    this.ui.markers.push(elseHiddenMarker);
                    editor.decorateMarker(elseHiddenMarker, { type: 'block', position: 'before', item: element });
                    var vjava = this;
                    element.onclick = () => {
                        vjava.preserveChanges(editor);
                        var newNode = {
                            type: "text",
                            content: "\nFill in the second alternative\n"
                        };
                        var inserter = new AlternativeInserter(newNode, thenbranchMarker.getBufferRange().end, "elsebranch", node.name);
                        vjava.doc = inserter.rewriteRegion(vjava.doc);
                        vjava.updateEditorText();
                    };
                }
                else if (node.elsebranch.hidden) {
                    element.textContent = '(...)';
                    element.classList.add(`hover-alt-${node.name}`);
                    element.classList.add(`hover-alt`);
                    element.classList.add(getelsebranchCssClass(node.name));
                    this.popupListenerQueue.push({ element: element, text: renderDocument(node.elsebranch) });
                    var elseHiddenMarker = editor.markBufferPosition(node.thenbranch.span.end);
                    this.ui.markers.push(elseHiddenMarker);
                    editor.decorateMarker(elseHiddenMarker, { type: 'block', position: 'before', item: element });
                    element.onclick = () => { $(`#${node.name}-view-both`).click(); };
                }
                this.nesting.push({ selector: { name: node.name, branch: "thenbranch" }, dimension: node });
                for (var i = 0; i < node.thenbranch.segments.length; i++) {
                    this.renderDimensionUI(editor, node.thenbranch.segments[i]);
                }
                this.nesting.pop();
            }
            if (isBranchActive(node, getSelectionForNode(node, this.selections), "elsebranch") && node.elsebranch.segments.length > 0 && !node.elsebranch.hidden) {
                var elsebranchMarker = editor.markBufferRange(node.elsebranch.span, { invalidate: 'surround' });
                this.ui.markers.push(elsebranchMarker);
                editor.decorateMarker(elsebranchMarker, { type: 'line', class: getelsebranchCssClass(node.name) });
                for (var i = this.nesting.length - 1; i >= 0; i--) {
                    var nestclass = 'nested-' + this.nesting[i].selector.name + '-' + this.nesting[i].selector.branch + '-' + i;
                    editor.decorateMarker(elsebranchMarker, { type: 'line', class: nestclass });
                    element.classList.add(nestclass);
                }
                var element = document.createElement('div');
                if (node.thenbranch.segments.length == 0) {
                    element.textContent = '(+)';
                    element.classList.add(`insert-alt-${node.name}`);
                    element.classList.add(`insert-alt`);
                    element.classList.add(getthenbranchCssClass(node.name));
                    var thenHiddenMarker = editor.markBufferPosition(node.elsebranch.span.start);
                    this.ui.markers.push(thenHiddenMarker);
                    editor.decorateMarker(thenHiddenMarker, { type: 'block', position: 'before', item: element });
                    var vjava = this;
                    element.onclick = () => {
                        vjava.preserveChanges(editor);
                        var newNode = {
                            type: "text",
                            content: "Fill in the second alternative"
                        };
                        var inserter = new AlternativeInserter(newNode, elsebranchMarker.getBufferRange().end, "thenbranch", node.name);
                        vjava.doc = inserter.rewriteRegion(vjava.doc);
                        vjava.updateEditorText();
                    };
                }
                else if (node.thenbranch.hidden) {
                    element.textContent = '(...)';
                    element.classList.add(`hover-alt-${node.name}`);
                    element.classList.add(`hover-alt`);
                    element.classList.add(getthenbranchCssClass(node.name));
                    this.popupListenerQueue.push({ element: element, text: renderDocument(node.thenbranch) });
                    var thenHiddenMarker = editor.markBufferPosition(node.elsebranch.span.start);
                    this.ui.markers.push(thenHiddenMarker);
                    editor.decorateMarker(thenHiddenMarker, { type: 'block', position: 'before', item: element });
                    element.onclick = () => { $(`#${node.name}-view-both`).click(); };
                }
                this.nesting.push({ selector: { name: node.name, branch: "elsebranch" }, dimension: node });
                for (var i = 0; i < node.elsebranch.segments.length; i++) {
                    this.renderDimensionUI(editor, node.elsebranch.segments[i]);
                }
                this.nesting.pop();
            }
        }
        else {
            node.marker = editor.markBufferRange(node.span, { invalidate: 'surround' });
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
            var selection = getSelectionForDim(dimName, this.selections);
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
        var preserver = new EditPreserver(editor, this.selections);
        preserver.visitRegion(this.doc);
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
    selectelsebranch(dimName) {
        var editor = atom.workspace.getActiveTextEditor();
        this.preserveChanges(editor);
        for (var i = 0; i < this.selections.length; i++) {
            if (this.selections[i].name === dimName) {
                this.selections[i].elsebranch = true;
            }
        }
        this.updateEditorText();
    }
    unselectelsebranch(dimName) {
        var editor = atom.workspace.getActiveTextEditor();
        this.preserveChanges(editor);
        for (var i = 0; i < this.selections.length; i++) {
            if (this.selections[i].name === dimName) {
                this.selections[i].elsebranch = false;
            }
        }
        this.updateEditorText();
    }
    updateEditorText() {
        var editor = atom.workspace.getActiveTextEditor();
        var showDoc = new ViewRewriter(this.selections).rewriteDocument(this.doc);
        editor.setText(renderDocument(showDoc));
        for (var marker of this.ui.markers) {
            marker.destroy();
        }
        this.ui.markers = [];
        this.tooltips.dispose();
        for (var i = 0; i < this.doc.segments.length; i++) {
            this.renderDimensionUI(editor, showDoc.segments[i]);
        }
        for (var popup of this.popupListenerQueue) {
            this.tooltips.add(atom.tooltips.add(popup.element, { title: popup.text }));
        }
        this.popupListenerQueue = [];
        this.updateColors(showDoc);
    }
    selectthenbranch(dimName) {
        var editor = atom.workspace.getActiveTextEditor();
        this.preserveChanges(editor);
        for (var i = 0; i < this.selections.length; i++) {
            if (this.selections[i].name === dimName) {
                this.selections[i].thenbranch = true;
            }
        }
        this.updateEditorText();
    }
    unselectthenbranch(dimName) {
        var editor = atom.workspace.getActiveTextEditor();
        this.preserveChanges(editor);
        for (var i = 0; i < this.selections.length; i++) {
            if (this.selections[i].name === dimName) {
                this.selections[i].thenbranch = false;
            }
        }
        this.updateEditorText();
    }
    activate(state) {
        this.state = "parsed";
        console.log(state);
        this.ui = new VJavaUI(state);
        this.nesting = [];
        this.ui.menuItems = [];
        this.popupListenerQueue = [];
        this.tooltips = new CompositeDisposable();
        this.selections = !$.isEmptyObject({}) ? state : [];
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
            this.saveSubscription = activeEditor.onDidSave(this.handleDidSave.bind(this));
            this.raw = contents;
            this.ui.panel.show();
            var pathBits = activeEditor.getPath().split('.');
            activeEditor.saveAs(pathBits.splice(0, pathBits.length - 1).join('.') + '-temp-vjava.' + pathBits[pathBits.length - 1]);
        });
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
        for (var map of atom.keymaps.keyBindings) {
            if (map.command.includes('undo')) {
                console.log(map);
            }
        }
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
    addChoiceSegment(dim, branch) {
        var activeEditor = atom.workspace.getActiveTextEditor();
        var lit = 'new dimension';
        var location = activeEditor.getCursorBufferPosition();
        var node = {
            span: null,
            name: dim,
            kind: null,
            type: 'choice',
            thenbranch: { segments: [], type: "region" },
            elsebranch: { segments: [], type: "region" }
        };
        if (branch == "thenbranch")
            node.kind = "positive";
        else
            node.kind = "contrapositive";
        node[branch].segments = [
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
