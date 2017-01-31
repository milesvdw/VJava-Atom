  'use babel';

declare module 'atom' {
    class CompositeDisposable {
        add(command: any): void;
        dispose(): void;
    }
}

import fs from 'fs';
import path from 'path';
import $ from 'jquery';
import 'spectrum-colorpicker';
import { CompositeDisposable } from 'atom';

import { spawn } from 'child_process';

import {
    Span, RegionNode, SegmentNode, ChoiceNode, ContentNode, renderDocument,
    docToPlainText, ViewRewriter, SpanWalker, NodeInserter, DimensionDeleter,
    EditPreserver, getSelectionForDim, getSelectionForNode, isBranchActive,
    AlternativeInserter
} from './ast';
import { VJavaUI, DimensionUI, Branch, Selector, Selection, NestLevel } from './ui'

// ----------------------------------------------------------------------------

declare global {
    interface Array<T> {
        last(): T | undefined;
    }
    namespace AtomCore {
        interface IAtom {
            tooltips: any;
            contextMenu: any;
        }

        interface IKeymapManager {
            keyBindings: any;
        }

        interface IEditor {
            getTextInBufferRange(span: Span): string;
            getTextInBufferRange(span: number[][]): string;
            decorateMarker(marker: any, options: any);
        }
        interface Panel {
            destroy();
        }
    }

    interface JQuery {
        spectrum({color});
        spectrum(method: string);
    }

    interface CompositeDisposable {
        destroy();
    }
}

if (!Array.prototype.last) {
    Array.prototype.last = function() {
        return this[this.length - 1];
    }
}

// ----------------------------------------------------------------------------

//declared out here so that they may be accessed from the document itself
//only for debugging purposes.
function getthenbranchCssClass(dimName) {
    return 'dimension-marker-' + dimName + "-thenbranch";
}

function getelsebranchCssClass(dimName) {
    return 'dimension-marker-' + dimName + "-elsebranch";
}

function rangeToSpan(range): Span {
    const span: Span = {
        start: [range.start.row, range.start.column],
        end: [range.end.row, range.end.column]
    };
    return span;
}

// ----------------------------------------------------------------------------

// organize this stuff please.
var linesRemoved = 0;
var linesReAdded = 0;

function shadeColor(rgb: string, lum?: number) {

    lum = lum || 0;
    lum = lum + 1;

    // convert to decimal and change luminosity
    var parens = rgb.split('(');
    var nums = parens[1].replace(' ', '').split(',');

    return `rgba(${Math.floor(parseInt(nums[0], 10) * lum)}, ${Math.floor(parseInt(nums[1], 10) * lum)}, ${Math.floor(parseInt(nums[2], 10) * lum)}, .3)`;
}

// the heck is this state doing here?
var rendering = false;
const mainDivId = 'variationalJavaUI';
const enclosingDivId = 'enclosingDivJavaUI';
const secondaryDivId = 'variationalJavaUIButtons';

var iconsPath = atom.packages.resolvePackagePath("variational-java") + "/icons";

class VJava {

    styles: {[selector : string] : string} = {}
    nesting: NestLevel[] // a stack represented nested dimensions
    selections: Selection[]
    ui: VJavaUI
    doc: RegionNode
    raw: string
    popupListenerQueue: { element : HTMLElement, text: string }[]
    colorpicker: {}
    dimensionColors: {}
    activeChoices: Selector[] // in the form of dimensionId:thenbranch|elsebranch
    subscriptions: CompositeDisposable
    saveSubscription: AtomCore.Disposable
    tooltips: CompositeDisposable
    state: "parsed" | "unparsed"

    // initialize the user interface
    // TODO: make this a function that returns an object conforming to VJavaUI
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

        // consider css :hover for this...
        $("#addNewDimension").on('mouseover', () => {
            $('#addNewDimensionImg').attr('src', `${iconsPath}/add_square_button_depressed.png`);
        });
        $("#addNewDimension").on('mouseout', () => {
            $('#addNewDimensionImg').attr('src', `${iconsPath}/add_square_button.png`);
        });
        // ---
        // add listeners for ui buttons

        // TODO: this click handler needs a name and a place to live.
        $("#addNewDimension").on('click', () => {
            var dimName = 'NEW';

            var dimension: DimensionUI = {
                name: dimName,
                color: 'rgb(127, 71, 62)'
            };

            // goddamn, dude
            var nameDiv = $(`<div class='form-group dimension-ui-div' id='new-dimension'><h2><input id='new-dimension-name' class='native-key-bindings new-dimension-name' type='text' value='${dimName}'></h2></div>`)

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


                //TODO: ensure name is unique

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
                })
                this.ui.contextMenu = atom.contextMenu.add({'atom-text-editor': [{label: 'Insert Choice', submenu: this.ui.menuItems}]});


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

    addViewListeners(dimension: DimensionUI) {
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

    //update the color of all matching dimensions in the document
    updateDimensionColor(dimension: DimensionUI) {
        this.ui.updateSession(dimension);
        for (var i = 0; i < this.doc.segments.length; i++) {
            this.changeDimColor(dimension, this.doc.segments[i]);
        }

        var preserver: EditPreserver = new EditPreserver(atom.workspace.getActiveTextEditor(), this.selections);
        preserver.visitRegion(this.doc);

        this.updateEditorText(); //TODO find a way to do this without rewriting everything in the editor
    }

    //change this node's color if appropriate, and recurse if necessary
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
        this.styles = {}
    }

    serializeColors() : string {
        var css = '';
        for(var selector in this.styles) {
            css += selector + ` { ${this.styles[selector]}} \n`;
        }
        return css;
    }

    updateColors(doc: RegionNode) {
        this.clearColors();
        for (var i = 0; i < doc.segments.length; i++) {
            this.setColors(doc.segments[i]);
        }
        var css = this.serializeColors();
        $('head').append(`<style id='dimension-color-styles'>${css}</style>`);
    }

    setColors(node: SegmentNode) : void {
        //if this is a dimension
        if (node.type === 'choice') {
            var color = this.ui.getColorForNode(node);

            //find the color for the thenbranch alternative
            if (node.kind === 'positive') {
                var thenbranchcolor = shadeColor(color, .1);
                var thenbranchcursorcolor = shadeColor(color, .15);
                var thenbranchhighlightcolor = shadeColor(color, .35);
                var elsebranchcolor = shadeColor(color, -.1);
                var elsebranchcursorcolor = shadeColor(color, -.05);
                var elsebranchhighlightcolor = shadeColor(color, -.15);
            } else {
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
                    //nesting class format: 'nested-[DIM ID]-[BRANCH]-[LEVEL]'
                    selectors.push('.nested-' + this.nesting[j].selector.name + '-' + this.nesting[j].selector.branch + '-' + j);
                    var branch: Branch = this.nesting[j].selector.branch;

                    //pre-shading nest color
                    var nestcolor = this.ui.getColorForNode(this.nesting[j].dimension);
                    var kind = this.nesting[j].dimension.kind;

                    //nest in the correct branch color
                    if ((branch === 'thenbranch' && kind === 'positive') || (branch === 'elsebranch' && kind === 'contrapositive')) nestcolor = shadeColor(nestcolor, .1);
                    else nestcolor = shadeColor(nestcolor, -.1);

                    nestColors.push(nestcolor);
                }

                var selector = selectors.join(' ');
                //construct the nest gradient
                var x = 0;
                var increment = 1;
                var nestGradient = nestColors[0] + ' 0%';
                for (var j = 1; j < nestColors.length; j++) {
                    x = (j) * increment;
                    nestGradient = `${nestGradient}, ${nestColors[j]} ${x}%`;
                }

                //add the colors and borders as styles to our master list

                this.styles[`${selector}.${getthenbranchCssClass(node.name)}`] = `background: linear-gradient( 90deg, ${nestGradient}, ${thenbranchcolor} ${x + increment}%);`;
                this.styles[`${selector}.${getthenbranchCssClass(node.name)}.cursor-line`] = `background: linear-gradient( 90deg, ${nestGradient}, ${thenbranchcursorcolor} ${x + increment}%);`;
                this.styles[`${selector}.${getelsebranchCssClass(node.name)}`] = `background: linear-gradient( 90deg, ${nestGradient}, ${elsebranchcolor} ${x + increment}%);`;
                this.styles[`${selector}.${getelsebranchCssClass(node.name)}.cursor-line`] = `background: linear-gradient( 90deg, ${nestGradient}, ${elsebranchcursorcolor} ${x + increment}%);`;
                this.styles[`.hover-alt.${selector}.${getthenbranchCssClass(node.name)}`] = `background: linear-gradient( 90deg, ${nestGradient}, ${thenbranchcolor} ${x + increment}%);`;
                this.styles[`.hover-alt.${selector}.${getelsebranchCssClass(node.name)}`] = `background: linear-gradient( 90deg, ${nestGradient}, ${elsebranchcolor} ${x + increment}%);`;

            } else {
                this.styles[`.${getthenbranchCssClass(node.name)}`] = `background-color: ${thenbranchcolor};`;
                this.styles[`.${getelsebranchCssClass(node.name)}`] = `background-color: ${elsebranchcolor};`;
                this.styles[`.${getthenbranchCssClass(node.name)}.cursor-line.line`] = `background-color: ${thenbranchcursorcolor};`;
                this.styles[`.${getelsebranchCssClass(node.name)}.cursor-line.line`] = ` background-color: ${elsebranchcursorcolor};`;
                this.styles[`.${getthenbranchCssClass(node.name)}.line`] = `background-color: ${thenbranchhighlightcolor};`;
                this.styles[`.${getelsebranchCssClass(node.name)}.highlight.line`] = ` background-color: ${elsebranchhighlightcolor};`;
                this.styles[`.hover-alt.${getthenbranchCssClass(node.name)}`] = `background-color: ${thenbranchcolor};`;
                this.styles[`.hover-alt.${getelsebranchCssClass(node.name)}`] = `background-color: ${elsebranchcolor};`;
            }

            //recurse thenbranch and elsebranch
            var lselector: Selector = { name: node.name, branch: "thenbranch" };
            this.nesting.push({ selector: lselector, dimension: node });
            //recurse on thenbranch and elsebranch
            for (var i = 0; i < node.thenbranch.segments.length; i++) {
                this.setColors(node.thenbranch.segments[i]);
            }
            this.nesting.pop();

            var rselector: Selector = { name: node.name, branch: "elsebranch" }
            this.nesting.push({ selector: rselector, dimension: node });
            for (var i = 0; i < node.elsebranch.segments.length; i++) {
                this.setColors(node.elsebranch.segments[i]);
            }
            this.nesting.pop();
        }
    }

    toggleDimensionEdit(dimension: DimensionUI, branch: Branch) {
        var otherbranch;
        if (branch === 'thenbranch') otherbranch = 'elsebranch';
        else otherbranch = 'thenbranch';

        //toggle off
        if ($(`#${dimension.name}-edit-${branch}`).hasClass('edit-enabled')) {
            $(`#${dimension.name}-edit-${branch}`).removeClass('edit-enabled');
            $(`#${dimension.name}-edit-${branch}`).addClass('edit-locked');
            this.ui.removeActiveChoice(dimension.name, branch);
        } else {
            //toggle on
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

    updateSelections(selection: Selection) {
        for (let sel of this.selections) {
            if (sel.name === selection.name) {
                sel.thenbranch = selection.thenbranch;
                sel.elsebranch = selection.elsebranch;
                return;
            }
        }
        this.selections.push(selection);
    }

    //using the list of dimensions contained within the ui object,
    //add html elements, markers, and styles to distinguish dimensions for the user
    renderDimensionUI(editor: AtomCore.IEditor, node: SegmentNode) {

        //if this is a dimension
        if (node.type === "choice") {

            //and this dimension has not yet been parsed
            if (!this.ui.hasDimension(node.name)) {

                //initialize this dimension for future selection
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

                //only hook up listeners, etc. once!
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
                }
                var whenSelectedSub = {};
                whenSelectedSub[`variational-java:add-choice-segment-${node.name}-selected`] = () => this.addChoiceSegment(node.name, "thenbranch");
                var whenUnselectedSub = {};
                whenUnselectedSub[`variational-java:add-choice-segment-${node.name}-unselected`] = () => this.addChoiceSegment(node.name, "elsebranch");

                this.subscriptions.add(atom.commands.add('atom-text-editor', whenSelectedSub));
                this.subscriptions.add(atom.commands.add('atom-text-editor', whenUnselectedSub));

                this.ui.menuItems.push(menuItem);

                //first try to use the color on the dimension
                var uiColor: string = this.ui.getColorForNode(node);

                var dimUIElement = this.ui.setupColorPickerForDim(node.name, editor);

                dimUIElement.colorpicker.on('change', () => {
                    var rgba = dimUIElement.colorpicker.spectrum('get').toRgbString();
                    dimUIElement.color = rgba;

                    this.updateDimensionColor(dimUIElement);
                });

                this.addViewListeners(dimUIElement);

                //make choice selections if necessary
                //see if a  choice has been made in this dimension
                var choice = this.ui.getChoice(node.name);

                var dimUIElement = this.ui.getDimUIElementByName(node.name);
                //if so, togchoicee the ui appropriately
                if (choice) { //this implies that a selection a
                    this.toggleDimensionEdit(dimUIElement, choice.branch);
                }
            }


            if (isBranchActive(node, getSelectionForNode(node, this.selections), "thenbranch") && node.thenbranch.segments.length > 0 && !node.thenbranch.hidden) {
                //add markers for this new range of a (new or pre-existing) dimension
                var thenbranchMarker = editor.markBufferRange(node.thenbranch.span, {invalidate: 'surround'});
                this.ui.markers.push(thenbranchMarker);

                //decorate with the appropriate css classes
                editor.decorateMarker(thenbranchMarker, { type: 'line', class: getthenbranchCssClass(node.name) });


                var element = document.createElement('div');

                for (var i = this.nesting.length - 1; i >= 0; i--) {
                    //nesting class format: 'nested-[DIM ID]-[BRANCH]-[LEVEL]'
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
                        var newNode : ContentNode = {
                            type: "text",
                            content: "\nFill in the second alternative\n"
                        };
                        var inserter = new AlternativeInserter(newNode, thenbranchMarker.getBufferRange().end, "elsebranch", node.name);
                        vjava.doc = inserter.rewriteRegion(vjava.doc);
                        vjava.updateEditorText();
                    };
                } else if (node.elsebranch.hidden) {
                    element.textContent = '(...)';
                    element.classList.add(`hover-alt-${node.name}`);
                    element.classList.add(`hover-alt`);
                    element.classList.add(getelsebranchCssClass(node.name));
                    this.popupListenerQueue.push({element: element, text: renderDocument(node.elsebranch) });

                    var elseHiddenMarker = editor.markBufferPosition(node.thenbranch.span.end);
                    this.ui.markers.push(elseHiddenMarker);
                    editor.decorateMarker(elseHiddenMarker, { type: 'block', position: 'before', item: element });
                    element.onclick = () => { $(`#${node.name}-view-both`).click(); };
                }

                this.nesting.push({ selector: { name: node.name, branch: "thenbranch" }, dimension: node });
                //recurse on thenbranch and elsebranch
                for (var i = 0; i < node.thenbranch.segments.length; i++) {
                    this.renderDimensionUI(editor, node.thenbranch.segments[i]);
                }
                this.nesting.pop();
            }

            if (isBranchActive(node, getSelectionForNode(node, this.selections), "elsebranch") && node.elsebranch.segments.length > 0 && !node.elsebranch.hidden) {

                var elsebranchMarker = editor.markBufferRange(node.elsebranch.span, {invalidate: 'surround'});
                this.ui.markers.push(elsebranchMarker);

                editor.decorateMarker(elsebranchMarker, { type: 'line', class: getelsebranchCssClass(node.name) });
                for (var i = this.nesting.length - 1; i >= 0; i--) {
                    //nesting class format: 'nested-[DIM ID]-[BRANCH]-[LEVEL]'
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
                        var newNode : ContentNode = {
                            type: "text",
                            content: "Fill in the second alternative"
                        };
                        var inserter = new AlternativeInserter(newNode, elsebranchMarker.getBufferRange().end, "thenbranch", node.name);
                        vjava.doc = inserter.rewriteRegion(vjava.doc);
                        vjava.updateEditorText();
                    };
                } else if (node.thenbranch.hidden) {
                    element.textContent = '(...)';
                    element.classList.add(`hover-alt-${node.name}`);
                    element.classList.add(`hover-alt`);
                    element.classList.add(getthenbranchCssClass(node.name));

                    this.popupListenerQueue.push({element: element, text: renderDocument(node.thenbranch) });

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


        } else {
            node.marker = editor.markBufferRange(node.span, {invalidate: 'surround'});
        }
    }

    removeDimension(dimName: string) {
        var sure = confirm('Are you sure you want to remove this dimension? Any currently \
              visible code in this dimension will be promoted. Any hidden code will be removed.')

        if (sure) {
            //find the dimension and remove it
            for (var i = 0; i < this.ui.dimensions.length; i++) {
                if (this.ui.dimensions[i].name === dimName) {
                    this.ui.dimensions.splice(i, 1);
                    $("#" + dimName).remove(); //TODO: can I remove this?
                }
            }
            var selection: Selection = getSelectionForDim(dimName, this.selections);
            this.deleteDimension(selection);
            this.updateEditorText();
        } else {
            return;
        }
    }

    //thenbranch and elsebranch represent whether the thenbranch and elsebranch branches should be promoted
    //a value of 'true' indicates that the content in that branch should be promoted
    deleteDimension(selection: Selection) {
        //if this is the dimension being promoted, then do that
        this.preserveChanges(atom.workspace.getActiveTextEditor());
        var deleter = new DimensionDeleter(selection);
        this.doc = deleter.rewriteRegion(this.doc);
        this.updateEditorText();
        for(var i = 0; i < this.ui.menuItems.length; i ++) {
            if(this.ui.menuItems[i].label === selection.name) {
                this.ui.menuItems.splice(i, 1);
            }
        }
        this.ui.contextMenu.dispose();
        this.ui.contextMenu = atom.contextMenu.add({'atom-text-editor': [{label: 'Insert Choice', submenu: this.ui.menuItems}]});
    }

    deleteBranch(region: RegionNode, editor: AtomCore.IEditor) {
        for (let segment of region.segments) {
            if (segment.type === 'choice') {
                this.deleteBranch(segment.thenbranch, editor);
                this.deleteBranch(segment.elsebranch, editor);
            } else {
                editor.setTextInBufferRange(segment.marker.getBufferRange(), '');
            }
        }
    }

    preserveChanges(editor: AtomCore.IEditor) {
        var preserver: EditPreserver = new EditPreserver(editor, this.selections);
        preserver.visitRegion(this.doc);
    }

    parseVJava(textContents: string, next: () => void) {
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

    // these four functions execute a put with the old selections,
    // then a pull with the new selections
    // display both alternatives
    // show the elsebranch alternative
    selectelsebranch(dimName: string) {
        var editor = atom.workspace.getActiveTextEditor();
        this.preserveChanges(editor);
        for (var i = 0; i < this.selections.length; i++) {
            if (this.selections[i].name === dimName) {
                this.selections[i].elsebranch = true;
            }
        }
        this.updateEditorText();

    }

    // hide the elsebranch alternative
    unselectelsebranch(dimName: string) {
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

        for(var marker of this.ui.markers) {
            marker.destroy();
        }
        this.ui.markers = [];

        this.tooltips.dispose();

        for (var i = 0; i < this.doc.segments.length; i++) {
            this.renderDimensionUI(editor, showDoc.segments[i]);
        }

        for(var popup of this.popupListenerQueue) {
            this.tooltips.add(atom.tooltips.add(popup.element, {title: popup.text}));
        }
        this.popupListenerQueue = [];

        this.updateColors(showDoc);
    }

    // show the thenbranch alternative
    selectthenbranch(dimName: string) {
        var editor = atom.workspace.getActiveTextEditor();
        this.preserveChanges(editor);
        for (var i = 0; i < this.selections.length; i++) {
            if (this.selections[i].name === dimName) {
                this.selections[i].thenbranch = true;
            }
        }

        this.updateEditorText();
    }

    // hide the thenbranch alternative
    unselectthenbranch(dimName: string) {
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
        this.state = "parsed"
        console.log(state);
        // TODO: load session from a file somewhere?
        this.ui = new VJavaUI(state);

        this.nesting = [];
        this.ui.menuItems = [];
        this.popupListenerQueue = [];
        this.tooltips = new CompositeDisposable();

        this.selections = !$.isEmptyObject({}) ? state : [];

        var activeEditor = atom.workspace.getActiveTextEditor();

        var contents = activeEditor.getText();

        //parse the file
        this.parseVJava(contents, () => {
            // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
            this.subscriptions = new CompositeDisposable();

            this.createUI();

            this.updateEditorText();

            this.ui.contextMenu = atom.contextMenu.add({'atom-text-editor': [{label: 'Insert Choice', submenu: this.ui.menuItems}]});

            // Register command that toggles vjava view
            this.subscriptions.add(atom.commands.add('atom-workspace', {
                'variational-java:toggle': () => this.toggle()
            }));
            this.subscriptions.add(atom.commands.add('atom-workspace', {
                'variational-java:undo': () => this.noUndoForYou()
            }));

            this.saveSubscription = activeEditor.onDidSave(this.handleDidSave.bind(this));

            //preserve the contents for later comparison (put, get)
            this.raw = contents;

            this.ui.panel.show();
            var pathBits = activeEditor.getPath().split('.');
            activeEditor.saveAs(pathBits.splice(0,pathBits.length-1).join('.') + '-temp-vjava.' + pathBits[pathBits.length-1]);
        });
    }

    getOriginalPath(path : string) : string {
        var pathBits = path.split('-temp-vjava'); //TODO is there a way to make this not a magic reserved file name?
        var originalPath = pathBits.splice(0, pathBits.length).join('');
        return originalPath;
    }

    handleDidSave(event: {path: string}) {
        var activeEditor = atom.workspace.getActiveTextEditor();
        var originalPath = this.getOriginalPath(event.path);

        this.preserveChanges(activeEditor);
        fs.writeFile(originalPath, docToPlainText(this.doc), function(err) {
            if(err) {
                return console.log(err);
            }
            console.log("The file was saved!");
        });

    }

    noUndoForYou() {
        if(this.state === "parsed") return;
        for(var map of atom.keymaps.keyBindings) {
            if(map.command.includes('undo')) {
                console.log(map);
            }
        }
        atom.commands.dispatch(atom.views.getView(atom.workspace.getActiveTextEditor()), "core:undo");
    }

    deactivate() {
    }

    serialize() {
        var dims = [];
        for(var dimension of this.ui.dimensions) {
            dims.push({color: dimension.color, name: dimension.name, colorpicker: null})
        }
        var ses = [];
        for(var dimension of this.ui.session) {
            ses.push({color: dimension.color, name: dimension.name, colorpicker: null})
        }
        return {session: ses, dimensions: dims, activeChoices: this.ui.activeChoices};
    }

    addChoiceSegment(dim: string, branch: Branch) {

        var activeEditor = atom.workspace.getActiveTextEditor();


        var lit = 'new dimension';

        //we have to grab the zero index for some stupid reason
        var location = activeEditor.getCursorBufferPosition();

        var node: ChoiceNode = {
            span: null, // we don't know what it's span will be
            name: dim,
            kind: null,
            type: 'choice',
            thenbranch: { segments: [], type: "region" },
            elsebranch: { segments: [], type: "region" }
        }
        if (branch == "thenbranch") node.kind = "positive";
        else node.kind = "contrapositive";

        node[branch].segments = [
            {
                span: null, //no idea what this will be
                marker: null,// do this later?
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
            this.state = "unparsed"
            this.preserveChanges(activeEditor);
            this.ui.panel.destroy();
            this.ui.dimensions = [];
            this.ui.menuItems = [];

            for(var marker of this.ui.markers) {
                marker.destroy();
            }
            this.ui.markers = [];

            var tempPath = activeEditor.getPath();
            this.saveSubscription.dispose();
            activeEditor.setText(docToPlainText(this.doc));
            activeEditor.saveAs(this.getOriginalPath(activeEditor.getPath()));
            fs.unlink(tempPath, function(err) {
                if(err) console.log(err);
            });
            this.ui.contextMenu.dispose();
        } else {
            this.state = "parsed"
            rendering = true; //TODO make use of this lockout once again

            var contents = activeEditor.getText();

            //parse the file
            this.parseVJava(contents, () => {


                this.ui.dimensions = [];

                this.createUI();

                this.updateEditorText();
                //set up context menu here
                this.ui.contextMenu = atom.contextMenu.add({'atom-text-editor': [{label: 'Insert Choice', submenu: this.ui.menuItems}]});

                //preserve the contents for later comparison (put, get)
                this.raw = contents;

                this.ui.panel.show();

                var pathBits = activeEditor.getPath().split('.');
                activeEditor.saveAs(pathBits.splice(0,pathBits.length-1).join('.') + '-temp-vjava.' + pathBits[pathBits.length-1]);

                this.saveSubscription = activeEditor.onDidSave(this.handleDidSave.bind(this));
            });

            rendering = false
        }


        return (true);
    }

};

export default new VJava();
