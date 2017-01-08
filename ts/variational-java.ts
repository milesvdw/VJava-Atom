'use babel';

declare module 'atom' {
  class CompositeDisposable {
    add(command: any): void;
  }
}


import $ from 'jquery';
import 'spectrum-colorpicker';
import { CompositeDisposable } from 'atom';
import { spawn } from 'child_process';
import path from 'path';
import { Span, RegionNode, SegmentNode, ChoiceNode, ContentNode, renderDocument,
       docToPlainText, ViewRewriter, SpanWalker, NodeInserter, DimensionDeleter,
       EditPreserver, getSelectionForDim, getSelectionForNode, isBranchActive} from './ast';
import { VJavaUI, DimensionUI, Branch, Selector, Selection, NestLevel } from './ui'

// ----------------------------------------------------------------------------

declare global {
  interface Array<T> {
    last(): T | undefined;
  }
  namespace AtomCore {
    interface IEditor {
      getTextInBufferRange(span: Span) : string;
      getTextInBufferRange(span: number[][]) : string;
      decorateMarker(marker: any, options: any);
    }
    interface Panel {
      destroy();
    }
  }

  interface JQuery {
    spectrum({color});
    spectrum(method : string);
  }
}

if (!Array.prototype.last) {
  Array.prototype.last = function () {
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
  const span: Span = { start: [range.start.row, range.start.column],
                     end: [range.end.row, range.end.column]};
  return span;
}

// ----------------------------------------------------------------------------

// organize this stuff please.
var linesRemoved = 0;
var linesReAdded = 0;

function shadeColor(hex: string, lum?: number) {

	// validate hex string
	hex = String(hex).replace(/[^0-9a-f]/gi, '');
	if (hex.length < 6) {
		hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
	}

	lum = lum || 0;

	// convert to decimal and change luminosity
	var rgb = "#", c, i;
	for (i = 0; i < 3; i++) {
		c = parseInt(hex.substr(i*2,2), 16);
		c = Math.round(Math.min(Math.max(0, c + (c * lum)), 255)).toString(16);
		rgb += ("00"+c).substr(c.length);
	}

	return rgb;
}

// the heck is this state doing here?
var rendering = false;
const mainDivId = 'variationalJavaUI';
const enclosingDivId = 'enclosingDivJavaUI';
const secondaryDivId = 'variationalJavaUIButtons';

var iconsPath = atom.packages.resolvePackagePath("variational-java") + "/icons";

class VJava {

  nesting: NestLevel[] // a stack represented nested dimensions
  selections: Selection[]
  ui: VJavaUI
  doc: RegionNode
  raw: string
  colorpicker: {}
  dimensionColors: {}
  activeChoices: Selector[] // in the form of dimensionId:thenbranch|elsebranch
  subscriptions: CompositeDisposable

  // initialize the user interface
  // TODO: make this a function that returns an object conforming to VJavaUI
  createUI() {
    var mainUIElement = $(`<div id='${enclosingDivId}'><div id='${mainDivId}'></div>
                           <div id='${secondaryDivId}' class='vjava-secondary'>
                             <a href='' id='addNewDimension'><img id='addNewDimensionImg' border="0" src="${iconsPath}/add_square_button.png" width="30" height="30"/> </a>
                           </div></div>`);
    this.ui.panel = atom.workspace.addRightPanel({item: mainUIElement});
    this.ui.panel.hide();
    this.ui.main = $(`#${mainDivId}`);
    this.ui.secondary = $(`#${secondaryDivId}`);
    this.ui.message = this.ui.main.find("#message");

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
        color: '#7a2525'
      };

      // goddamn, dude
      var nameDiv = $(`<div class='form-group dimension-ui-div' id='new-dimension'><h2><input id='new-dimension-name' class='native-key-bindings new-dimension-name' type='text' value='${dimName}'></h2></div>`)

      this.ui.main.append(nameDiv);

      $('#new-dimension-name').focus();
      $('#new-dimension-name').on('focusout', () => {
          dimName = $('#new-dimension-name').val();
          for(var i = 0; i < this.ui.dimensions.length; i ++) {
              if(this.ui.dimensions[i].name === dimName) {
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
            <span class='edit edit-enabled' id='${dimName}-edit-thenbranch'>&#9998;</span>
            <span class='view view-enabled' id='${dimName}-view-thenbranch'>&#128065;</span>
                <span class='choice-label' id='${dimName}-thenbranch-text'>thenbranch</span><br>
            <span class='edit edit-enabled' id='${dimName}-edit-elsebranch'>&#9998;</span>
            <span class='view view-enabled' id='${dimName}-view-elsebranch'>&#128065;</span>
                <span class='choice-label' id='${dimName}-elsebranch-text'>elsebranch</span><br></div>`);
          this.ui.main.append(dimDiv);


          document.getElementById('removeDimension-' + dimName).addEventListener("click", () => {
            this.removeDimension(dimName);
          });

          this.addViewListeners(dimension);


          dimension.colorpicker = $(document.getElementById(dimension.name + '-colorpicker')).spectrum({
            color: dimension.color
          }).on('change', () => {
            dimension.color = dimension.colorpicker.spectrum('get').toHexString();
            this.updateDimensionColor(dimension);
          });

          this.ui.dimensions.push(dimension);
      });
    });
  }

  addViewListeners(dimension: DimensionUI) {
    $(`#${dimension.name}-disable-elsebranch`).on('click', () => {
      //switch the elsebranch branch to view mode
      $(`#${dimension.name}-view-elsebranch`).show();
      $(`#${dimension.name}-disable-elsebranch`).hide();

      //make appropriate changes to the document
      this.selectelsebranch(dimension.name);
    });

    $(`#${dimension.name}-view-elsebranch`).on('click', () => {
        //put the elsebranch alternative in edit mode
        $(`#${dimension.name}-view-elsebranch`).hide();
        $(`#${dimension.name}-edit-elsebranch`).show();
        this.toggleDimensionEdit(dimension, 'elsebranch');

        //ensure that the thenbranch alternative isn't in edit mode
        if($(`#${dimension.name}-edit-thenbranch`).is(":visible")) {
          $(`#${dimension.name}-view-thenbranch`).show();
          $(`#${dimension.name}-edit-thenbranch`).hide();

          //remove the thenbranch selection since one has been made
          this.ui.removeActiveChoice(dimension.name, "thenbranch");

        }

        this.ui.updateActiveChoices(dimension.name, "elsebranch");
    });

    $(`#${dimension.name}-edit-elsebranch`).on('click', () => {
      //go back to viewing
      $(`#${dimension.name}-view-elsebranch`).show();
      $(`#${dimension.name}-edit-elsebranch`).hide();

      //remove the elsebranch selection since we have toggled that off
      this.ui.removeActiveChoice(dimension.name, "elsebranch");
    });

    $(`#${dimension.name}-view-elsebranch`).on('contextmenu', () => {
      //as long as the thenbranch alternative isn't also hidden, hide this one
      if(!$(`#${dimension.name}-disable-thenbranch`).is(":visible")) {
        //put the elsebranch alternative in edit mode
        $(`#${dimension.name}-view-elsebranch`).hide();
        $(`#${dimension.name}-disable-elsebranch`).show();
        this.unselectelsebranch(dimension.name);
      }
      return false;
    });


    $(`#${dimension.name}-disable-thenbranch`).on('click', () => {
      //switch the elsebranch branch to view mode
      $(`#${dimension.name}-view-thenbranch`).show();
      $(`#${dimension.name}-disable-thenbranch`).hide();

      //make appropriate changes to the document
      this.selectthenbranch(dimension.name);
    });

    $(`#${dimension.name}-view-thenbranch`).on('click', () => {
        //put the elsebranch alternative in edit mode
        $(`#${dimension.name}-view-thenbranch`).hide();
        $(`#${dimension.name}-edit-thenbranch`).show();

        //ensure that the elsebranch alternative isn't in edit mode
        if($(`#${dimension.name}-edit-elsebranch`).is(":visible")) {
          $(`#${dimension.name}-view-elsebranch`).show();
          $(`#${dimension.name}-edit-elsebranch`).hide();

          //remove the thenbranch selection since one has been made
          this.ui.removeActiveChoice(dimension.name, "elsebranch");

        }
        this.ui.updateActiveChoices(dimension.name, "thenbranch")
    });

    $(`#${dimension.name}-edit-thenbranch`).on('click', () => {
      //go back to viewing
      $(`#${dimension.name}-view-thenbranch`).show();
      $(`#${dimension.name}-edit-thenbranch`).hide();

      //remove the then selection since it has been toggled off
      this.ui.removeActiveChoice(dimension.name, "thenbranch");
    });

    $(`#${dimension.name}-view-thenbranch`).on('contextmenu', () => {
        //as long as the elsebranch alternative isn't also hidden, hide this one
        if(!$(`#${dimension.name}-disable-elsebranch`).is(":visible")) {
          //put the thenbranch alternative in edit mode
          $(`#${dimension.name}-view-thenbranch`).hide();
          $(`#${dimension.name}-disable-thenbranch`).show();
          this.unselectthenbranch(dimension.name);
        }
        return false;
    });
  }

  //update the color of all matching dimensions in the document
  updateDimensionColor(dimension: DimensionUI) {
    this.ui.updateSession(dimension);
    for(var i = 0; i < this.doc.segments.length; i ++) {
      this.changeDimColor(dimension, this.doc.segments[i]);
    }

    var preserver: EditPreserver = new EditPreserver(atom.workspace.getActiveTextEditor(), this.selections);
    preserver.visitRegion(this.doc);

    this.updateEditorText(); //TODO find a way to do this without rewriting everything in the editor
  }

  //change this node's color if appropriate, and recurse if necessary
  changeDimColor(dimension, node) {
    if(node.type == 'choice') {
      if(node.name == dimension.name) {
        node.color = dimension.color;
      }

      for(var i = 0; i < node.thenbranch.segments.length; i ++) {
        this.changeDimColor(dimension, node.thenbranch.segments[i]);
      }
      for(var i = 0; i < node.elsebranch.segments.length; i ++) {
        this.changeDimColor(dimension, node.elsebranch.segments[i]);
      }
    }
  }

  clearColors() {
    $("#ifdef-color-styles").remove();
  }

  updateColors(doc: RegionNode) {
    this.clearColors();
    var colors = '';
    for(var i = 0; i < doc.segments.length; i ++) {
        colors = colors + this.setColors(doc.segments[i]);
    }
    $('head').append(`<style id='dimension-color-styles'>${colors}</style>`);
  }

  setColors(node: SegmentNode) {
      //if this is a dimension
      var colors = '';
      if(node.type === 'choice') {
          var color = this.ui.getColorForNode(node);

          //find the color for the thenbranch alternative
          if(node.kind === 'positive') {
            var thenbranchcolor = shadeColor(color, .1);
            var elsebranchcolor = shadeColor(color, -.1);
          } else {
            var thenbranchcolor = shadeColor(color, -.1);
            var elsebranchcolor = shadeColor(color, .1);
          }

          var selectors = [];
          var nestColors = [];

          if(this.nesting.length > 0) {
            for(var j = 0; j < this.nesting.length; j ++) {
              //nesting class format: 'nested-[DIM ID]-[BRANCH]-[LEVEL]'
              selectors.push('.nested-' + this.nesting[j].selector.name + '-' + this.nesting[j].selector.branch + '-' + j);
              var branch: Branch = this.nesting[j].selector.branch;

              //pre-shading nest color
              var nestcolor = this.ui.getColorForNode(this.nesting[j].dimension);
              var kind = this.nesting[j].dimension.kind;

              //nest in the correct branch color
              if((branch === 'thenbranch' && kind === 'positive') || (branch === 'elsebranch' && kind === 'contrapositive')) nestcolor = shadeColor(nestcolor, .1);
              else nestcolor = shadeColor(nestcolor, -.1);

              nestColors.push(nestcolor);
            }

            var selector = selectors.join(' ');
            //construct the nest gradient
            var x = 0;
            var increment = 1;
            var nestGradient = nestColors[0] + ' 0%';
            for(var j = 1; j < nestColors.length; j++) {
              x = (j) * increment;
              nestGradient = `${nestGradient}, ${nestColors[j]} ${x}%`;
            }

            //add the colors and borders as styles to the document head

            colors = colors + `atom-text-editor::shadow ${selector}.${getthenbranchCssClass(node.name)} {
              background: linear-gradient( 90deg, ${nestGradient}, ${thenbranchcolor} ${x+increment}%);
            }
            atom-text-editor::shadow  ${selector}.${getelsebranchCssClass(node.name)} {
              background: linear-gradient( 90deg, ${nestGradient}, ${elsebranchcolor} ${x+increment}%);
            }`
          } else {
            colors = colors + `atom-text-editor::shadow .${getthenbranchCssClass(node.name)} {
              background-color: ${thenbranchcolor};
            }
            atom-text-editor::shadow .${getelsebranchCssClass(node.name)} {
              background-color: ${elsebranchcolor};
            }`
          }

          //recurse thenbranch and elsebranch
          var lselector: Selector = {name: node.name, branch: "thenbranch"};
          this.nesting.push({ selector: lselector, dimension: node});
          //recurse on thenbranch and elsebranch
          for(var i = 0; i < node.thenbranch.segments.length; i ++) {
            colors = colors + this.setColors(node.thenbranch.segments[i]);
          }
          this.nesting.pop();

          var rselector: Selector = {name: node.name, branch: "elsebranch"}
          this.nesting.push({ selector: rselector, dimension: node});
          for(var i = 0; i < node.elsebranch.segments.length; i ++) {
            colors = colors + this.setColors(node.elsebranch.segments[i]);
          }
          this.nesting.pop();
      }
      return colors;
  }

  toggleDimensionEdit(dimension: DimensionUI, branch: Branch) {
    var otherbranch;
    if(branch === 'thenbranch') otherbranch = 'elsebranch';
    else otherbranch = 'thenbranch';

    //toggle off
    if($(`#${dimension.name}-edit-${branch}`).hasClass('edit-enabled')) {
      $(`#${dimension.name}-edit-${branch}`).removeClass('edit-enabled');
      $(`#${dimension.name}-edit-${branch}`).addClass('edit-locked');
      this.ui.removeActiveChoice(dimension.name, branch);
    } else {
      //toggle on
      $(`#${dimension.name}-edit-${branch}`).addClass('edit-enabled');
      $(`#${dimension.name}-edit-${branch}`).removeClass('edit-locked');


      this.ui.updateActiveChoices(dimension.name, branch);
    }
    if($(`#${dimension.name}-edit-${otherbranch}`).hasClass('edit-enabled')) {
      $(`#${dimension.name}-edit-${otherbranch}`).removeClass('edit-enabled');
      $(`#${dimension.name}-edit-${otherbranch}`).addClass('edit-locked');

      this.ui.removeActiveChoice(dimension.name, branch);
    }
  }

  updateSelections(selection: Selection) {
    for(let sel of this.selections) {
      if(sel.name === selection.name) {
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
    if(node.type === "choice") {

        //and this dimension has not yet been parsed
        if(!this.ui.hasDimension(node.name)) {

            //initialize this dimension for future selection
            this.updateSelections({ name: node.name, thenbranch: true, elsebranch: true});

            var dimDiv = $(`<div class='form-group dimension-ui-div' id='${node.name}'>
              <a href='' id='removeDimension-${node.name}' class='delete_icon'><img name='removeDimensionImg' border="0" src="${iconsPath}/delete-bin.png" width="16" height="18"/> </a>
              <input type='text' id="${node.name}-colorpicker">
              <h2>${node.name}</h2>
              <br>
              <span class='toggle-thenbranch'>
              <span class='edit' id='${node.name}-disable-thenbranch' style='display: none;'>&nbsp;&nbsp;&nbsp;</span>
              <span class='edit edit-enabled' id='${node.name}-edit-thenbranch' style='display: none;'>&#9998;</span>
              <span class='view view-enabled' id='${node.name}-view-thenbranch'>&#128065;</span>
              </span>
              <span class='choice-label' id='${node.name}-thenbranch-text'>thenbranch</span><br>
              <span class='toggle-elsebranch'>
              <span class='edit' id='${node.name}-disable-elsebranch' style='display: none;'>&nbsp;&nbsp;&nbsp;</span>
              <span class='edit edit-enabled' id='${node.name}-edit-elsebranch' style='display: none;'>&#9998;</span>
              <span class='view view-enabled' id='${node.name}-view-elsebranch'>&#128065;</span>
              </span>
              <span class='choice-label' id='${node.name}-elsebranch-text'>elsebranch</span><br></div>  `);
            this.ui.main.append(dimDiv);

            //only hook up listeners, etc. once!
            document.getElementById('removeDimension-' + node.name).addEventListener("click", () => {
              this.removeDimension(node.name);
            });


            //first try to use the color on the dimension
            var uiColor: string = this.ui.getColorForNode(node);

            this.ui.setupColorPickerForDim(node.name, editor, this.addViewListeners, this.updateDimensionColor);

            //make choice selections if necessary
            //see if a  choice has been made in this dimension
            var choice = this.ui.getChoice(node.name);

            var dimUIElement = this.ui.getDimUIElementByName(node.name);
            //if so, togchoicee the ui appropriately
            if(choice) { //this implies that a selection a
              this.toggleDimensionEdit(dimUIElement, choice.branch);
            }
        }


        if(isBranchActive(node, getSelectionForNode(node, this.selections), "thenbranch") && node.thenbranch.segments.length > 0 && !node.thenbranch.hidden) {
            //add markers for this new range of a (new or pre-existing) dimension
            var thenbranchRange = editor.markBufferRange(node.thenbranch.span);

            //decorate with the appropriate css classes
            editor.decorateMarker(thenbranchRange, {type: 'line', class: getthenbranchCssClass(node.name)});

            if(node.elsebranch.hidden) {
              var element = document.createElement('div');
              element.textContent = '(...)';
              element.style.cssText = "float: left;";
              editor.decorateMarker(thenbranchRange, {type: 'block', position: 'left', item: element});
            }

            for(var i = this.nesting.length - 1; i >= 0; i --) {
              //nesting class format: 'nested-[DIM ID]-[BRANCH]-[LEVEL]'
              editor.decorateMarker(thenbranchRange, {type: 'line', class: 'nested-' + this.nesting[i].selector.name + '-' + this.nesting[i].selector.branch + '-' + i});
            }

            this.nesting.push({ selector: {name: node.name, branch: "thenbranch"}, dimension: node});
            //recurse on thenbranch and elsebranch
            for(var i = 0; i < node.thenbranch.segments.length; i ++) {
              this.renderDimensionUI(editor, node.thenbranch.segments[i]);
            }
            this.nesting.pop();
        }

        if(isBranchActive(node, getSelectionForNode(node, this.selections), "elsebranch") && node.elsebranch.segments.length > 0 && !node.thenbranch.hidden) {

            var elsebranchRange = editor.markBufferRange(node.elsebranch.span);

            if(node.thenbranch.hidden) {
              var element = document.createElement('div');
              element.textContent = '(...)';
              element.style.cssText = "float: left;";
              editor.decorateMarker(elsebranchRange, {type: 'block', position: 'left', item: element});
            }

            editor.decorateMarker(elsebranchRange, {type: 'line', class: getelsebranchCssClass(node.name)});
            for(var i = this.nesting.length - 1; i >= 0; i --) {
              //nesting class format: 'nested-[DIM ID]-[BRANCH]-[LEVEL]'
              editor.decorateMarker(elsebranchRange, {type: 'line', class: 'nested-' + this.nesting[i].selector.name + '-' + this.nesting[i].selector.branch + '-' + i});
            }

            this.nesting.push({ selector: {name: node.name, branch: "elsebranch"}, dimension: node});
            for(var i = 0; i < node.elsebranch.segments.length; i ++) {
              this.renderDimensionUI(editor, node.elsebranch.segments[i]);
            }
            this.nesting.pop();
        }


    } else {
      node.marker = editor.markBufferRange(node.span);
    }
  }

  removeDimension(dimName: string) {
      var sure = confirm('Are you sure you want to remove this dimension? Any currently \
              visible code in this dimension will be promoted. Any hidden code will be removed.')

      if(sure) {
        //find the dimension and remove it
        for(var i = 0; i < this.ui.dimensions.length; i ++) {
          if(this.ui.dimensions[i].name === dimName) {
            this.ui.dimensions.splice(i,1);
            $("#" + dimName).remove(); //TODO: can I remove this?
          }
        }
        var selection : Selection = getSelectionForDim(dimName, this.selections);
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
  }

  deleteBranch(region: RegionNode, editor: AtomCore.IEditor) {
    for(let segment of region.segments) {
      if(segment.type === 'choice') {
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
    parserProcess.stdout.on('data', (data) => {
      this.doc = JSON.parse(data.toString());
      next();
    });
    parserProcess.on('exit', (code) => {
      console.log('child process exited with code ' + code);
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
    for (var i = 0; i < this.selections.length; i ++) {
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
    for (var i = 0; i < this.selections.length; i ++) {
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

    for(var i = 0; i < this.doc.segments.length; i ++) {
      this.renderDimensionUI(editor, showDoc.segments[i]);
    }

    this.updateColors(showDoc);
  }

  // show the thenbranch alternative
  selectthenbranch(dimName: string) {
    var editor = atom.workspace.getActiveTextEditor();
    this.preserveChanges(editor);
    for (var i = 0; i < this.selections.length; i ++) {
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
    for (var i = 0; i < this.selections.length; i ++) {
      if (this.selections[i].name === dimName) {
        this.selections[i].thenbranch = false;
      }
    }

    this.updateEditorText();
  }

  activate(state) {
    // TODO: load session from a file somewhere?
    this.ui = new VJavaUI();
    this.ui.session = [];
    this.nesting = [];
    this.ui.activeChoices = [];

    this.selections = !$.isEmptyObject({}) ? state : [];

    var activeEditor = atom.workspace.getActiveTextEditor();

    var contents = activeEditor.getText();

    //parse the file
    this.parseVJava(contents, () => {
      // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
      this.subscriptions = new CompositeDisposable();

      this.ui.dimensions = [];

      this.createUI();

      this.updateEditorText();

      // Register command that toggles vjava view
      this.subscriptions.add(atom.commands.add('atom-workspace', {
        'variational-java:toggle': () => this.toggle()
      }));
      this.subscriptions.add(atom.commands.add('atom-workspace', {
        'variational-java:add-choice-segment': () => this.addChoiceSegment()
      }));
      //preserve the contents for later comparison (put, get)
      this.raw = contents;

      this.ui.panel.show();
    });

  }

  deactivate() {
  }

  serialize() {
    var selections = {};
    //TODO: implement this
    // $(`#${mainDivId} .dimension-ui-div`).each(function (dn, dim) {
    //   var dimName = $(dim).find('[id*=thenbranch]').attr('id').split('-thenbranch')[0];
    //   if($(dim).find('[id*=-thenbranch]').selected) {
    //     selections[dimName] = 'thenbranch';
    //   } else if ($(dim).find('[id*=-elsebranch]').selected) {
    //     selections[dimName] = 'elsebranch';
    //   } else {
    //     selections[dimName] = 'unselected';
    //   }
    // });
    return selections;
  }

  addChoiceSegment() {

    if(!this.ui.activeChoices[0]) {
        alert('please make a selection before inserting a choice segment');
        return;
    };

    var activeEditor = atom.workspace.getActiveTextEditor();


    var lit = 'new dimension';

    //we have to grab the zero index for some stupid reason
    var location = activeEditor.getCursorBufferPosition();

    //TODO support inserting nested dimensions?
    var choice = this.ui.activeChoices[0];
    var branch: Branch = choice.branch;
    var dim = choice.name;

    var node: ChoiceNode = {
      span: null, // we don't know what it's span will be
      name: dim,
      kind: null,
      type: 'choice',
      thenbranch: {segments: [], type: "region"},
      elsebranch: {segments: [], type: "region"}
    }
    if(branch == "thenbranch") node.kind = "positive";
    else node.kind = "contrapositive";

      node[branch].segments = [
        {
          span: null, //no idea what this will be
          marker: null,// do this later?
          content: '\n' + lit,
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
    if(this.ui.panel.isVisible()) {
      this.preserveChanges(activeEditor);
      this.ui.panel.destroy();
      this.ui.dimensions = [];

      activeEditor.setText(docToPlainText(this.doc));
    } else {
      rendering = true;

      var contents = activeEditor.getText();

      //parse the file
      this.parseVJava(contents, () => {


        this.ui.dimensions = [];

        this.createUI();

        this.updateEditorText();

        //preserve the contents for later comparison (put, get)
        this.raw = contents;

        this.ui.panel.show();
      });

      rendering = false
    }


    return (true);
  }

};

export default new VJava();
