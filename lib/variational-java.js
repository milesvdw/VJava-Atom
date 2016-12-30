'use babel';

import VariationalJavaView from './variational-java-view';
import { CompositeDisposable } from 'atom';
import { exec } from 'child_process';

if (!Array.prototype.last){
    Array.prototype.last = function(){
        return this[this.length - 1];
    };
};

//declared out here so that they may be accessed from the document itself
//only for debugging purposes.
function getLeftCssClass(dimName) {
  return 'dimension-marker-' + dimName + "-left";
}

function getRightCssClass(dimName) {
  return 'dimension-marker-' + dimName + "-right";
}

function rangeToSpan(range) {
  var span = { start: [[],[]], end: [[], []]};
  span.start[0] = range.start.row;
  span.start[1] = range.start.column;
  span.end[0] = range.end.row;
  span.end[1] = range.end.column;
  return span;
}

function triggerKeyPress(key) {
  var keyboardEvent = document.createEvent("KeyboardEvent");
  var initMethod = typeof keyboardEvent.initKeyboardEvent !== 'undefined' ? "initKeyboardEvent" : "initKeyEvent";


  keyboardEvent[initMethod](
                     "keydown", // event type : keydown, keyup, keypress
                      true, // bubbles
                      true, // cancelable
                      window, // viewArg: should be window
                      false, // ctrlKeyArg
                      false, // altKeyArg
                      false, // shiftKeyArg
                      false, // metaKeyArg
                      key, // keyCodeArg : unsigned long the virtual key code, else 0
                      0 // charCodeArgs : unsigned long the Unicode character associated with the depressed key, else 0
  );
  document.dispatchEvent(keyboardEvent);
}

var linesRemoved = 0;
var linesReAdded = 0;

function shadeColor(hex, lum) {

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

var rendering = false;
var mainDivId = 'variationalJavaUI';
var enclosingDivId = 'enclosingDivJavaUI';
var secondaryDivId = 'variationalJavaUIButtons';

var iconsPath = atom.packages.resolvePackagePath("variational-java") + "/icons";

var vjava = {

  nesting: [], //a stack represented nested dimensions
  selections: [],
  subscriptions: null,
  ui: {},
  doc: {},
  raw: "",
  colorpicker: {},
  dimensionColors: {},
  activeChoices: [], //in the form of dimensionId:left|right
  subscriptions: {},

  //initialize the user interface
  createUI() {

    var mainUIElement = $(`<div id='${enclosingDivId}'><div id='${mainDivId}'></div>
                           <div id='${secondaryDivId}' class='vjava-secondary'>
                             <a href='' id='addNewDimension'><img id='addNewDimensionImg' border="0" src="${iconsPath}/add_square_button.png" width="30" height="30"/> </a>
                           </div></div>`);
    vjava.ui.panel = atom.workspace.addRightPanel({item: mainUIElement});
    vjava.ui.panel.hide();
    vjava.ui.main = $(`#${mainDivId}`);
    vjava.ui.secondary = $(`#${secondaryDivId}`);
    vjava.ui.message = vjava.ui.main.find("#message");

    //add listeners for ui butons
    $("#addNewDimension").on('mouseover', function () {
      $('#addNewDimensionImg').attr('src', `${iconsPath}/add_square_button_depressed.png`);
    });
    $("#addNewDimension").on('mouseout', function () {
      $('#addNewDimensionImg').attr('src', `${iconsPath}/add_square_button.png`);
    });
    $("#addNewDimension").on('click', function () {
      var dimName = 'NEW';

      var dimension = {
        dimension: dimName,
        color: '#7a2525'
      };

      var nameDiv = $(`<div class='form-group dimension-ui-div' id='new-dimension'><h2><input id='new-dimension-name' class='native-key-bindings new-dimension-name' type='text' value='${dimName}'></h2></div>`)

      vjava.ui.main.append(nameDiv);

      $('#new-dimension-name').focus();
      $('#new-dimension-name').on('focusout', function () {
          dimName = $('#new-dimension-name').val();
          for(var i = 0; i < vjava.ui.dimensions.length; i ++) {
              if(vjava.ui.dimensions[i].dimension === dimName) {
                  alert('Please select a unique name for this dimension');
                  setTimeout(function () {
                     $('#new-dimension-name').focus();
                  }, 100);
                  return;
              }
          }

          dimension.dimension = dimName;


          //TODO: ensure name is unique

          nameDiv.remove();

          var dimDiv = $(`<div class='form-group dimension-ui-div' id='${dimName}'>
            <a href='' id='removeDimension-${dimName}'><img id='removeDimensionImg' class='delete_icon' border="0" src="${iconsPath}/delete-bin.png" width="16" height="18"/> </a>
            <input class="jscolor" id="${dimName}-colorpicker" value="ab2567">
            <h2>${dimName}</h2
            <br>
            <span class='edit edit-enabled' id='${dimName}-edit-left'>&#9998;</span>
            <span class='view view-enabled' id='${dimName}-view-left'>&#128065;</span>
                <span class='choice-label' id='${dimName}-left-text'>Left</span><br>
            <span class='edit edit-enabled' id='${dimName}-edit-right'>&#9998;</span>
            <span class='view view-enabled' id='${dimName}-view-right'>&#128065;</span>
                <span class='choice-label' id='${dimName}-right-text'>Right</span><br></div>`);
          vjava.ui.main.append(dimDiv);


          document.getElementById('removeDimension-' + dimName).addEventListener("click", function () {
            vjava.removeDimension(dimName);
          });

          vjava.addViewListeners(dimension);



          dimension.colorpicker = $(document.getElementById(dimension.dimension + '-colorpicker')).spectrum({
            color: dimension.color
          }).on('change', function () {
            vjava.updateDimensionColor(dimension);
          });

          vjava.ui.dimensions.push(dimension);
      });
    });
  },

  //update the color of all matching dimensions in the document
  updateDimensionColor(dimension) {
    vjava.ui.session[dimension.dimension] = dimension.color;
    for(var i = 0; i < vjava.doc.length; i ++) {
      vjava.changeDimColor(dimension, vjava.doc[i]);
    }
    vjava.updateColors();
  },

  //change this node's color if appropriate, and recurse if necessary
  changeDimColor(dimension, node) {
    if(node.type == 'choice') {
      if(node.dimension == dimension.dimension) {
        node.color = dimension.colorpicker.spectrum('get').toHexString();
      }

      for(var i = 0; i < node.left.length; i ++) {
        vjava.changeDimColor(dimension, node.left[i]);
      }
      for(var i = 0; i < node.right.length; i ++) {
        vjava.changeDimColor(dimension, node.right[i]);
      }
    }
  },

  getChoiceRange(choice) {
    return [choice[0].span.start,choice.last().span.end];
  },

  getChoiceColumnRange(choice) {
    if(choice.length < 1) return [0,-1]; //hack to prevent empty alternatives from bumping things around
    return [choice[0].span.start[0],choice.last().span.end[0]];
  },

  renderContents(item) {
    var editor = atom.workspace.getActiveTextEditor();
    item.span.start[0] = item.span.start[0] - linesRemoved;
    var content;
    if(item.type === 'choice') {
      //found is used to see if any selections have been made - if this is a brand new dimension, default both branches to shown
      var found = false;
      var selection;
      for (var i = 0; i < vjava.selections.length; i ++) {
        if (vjava.selections[i].name === item.dimension) {
          found = true;
          selection = vjava.selections[i];
          break;
        }
      }

      //see if this branch should be displayed
      var left = '';
      if(!found || selection['left']) {
        left = left + '\n'
        if(item.left.length > 0) {
          for(var j = 0; j < item.left.length; j ++) {
            left = left + vjava.renderContents(item.left[j]);
          }
        }
      }
      //otherwise, we're hiding the left dimension. in this case, adjust all spans appropriately
      else {
        var choiceRange = vjava.getChoiceColumnRange(item.left);
        var size = choiceRange[1]-choiceRange[0];
        //+1 for inclusive lines
        linesRemoved = linesRemoved + size + 1;
      }

      var right = '';
      if(!found || selection['right']) {
        if(item.right.length > 0) {
          right = '\n' + right;
          for(var j = 0; j < item.right.length; j ++) {
            right = right + vjava.renderContents(item.right[j]);
          }
        }
      }
      //otherwise, we're hiding the right dimension. In this case, adjust all spans appropriately
      else {
        var choiceRange = vjava.getChoiceColumnRange(item.right);
        //+1 for inclusive lines
        var size = choiceRange[1]-choiceRange[0] + 1;
        linesRemoved = linesRemoved + size;
      }
      //don't forget newline to account for the '#endif' keyword
      right = right + '\n';

      content = left + right;


    } else {
      content = item.content;
    }
    item.span.end[0] = item.span.end[0] - linesRemoved;
    return content;
  },

  clearColors() {
    $("#ifdef-color-styles").remove();
  },

  updateColors(editor) {
    vjava.clearColors();
    var colors = '';
    for(var i = 0; i < vjava.doc.length; i ++) {
        colors = colors + vjava.setColors(editor, vjava.doc[i]);
    }
    $('head').append(`<style id='dimension-color-styles'>${colors}</style>`);
  },

  setColors(editor, node) {
      //if this is a dimension
      var colors = '';
      if(node.type === 'choice') {
          var dimension = node;
          var color = dimension.color;

          //find the color for the left alternative
          var leftcolor = shadeColor(color, .1);
          var rightcolor = shadeColor(color, -.1);

          var selectors = [];
          var nestColors = [];

          if(vjava.nesting.length > 0) {
            for(var j = 0; j < vjava.nesting.length; j ++) {
              //nesting class format: 'nested-[DIM ID]-[BRANCH]-[LEVEL]'
              selectors.push('.nested-' + vjava.nesting[j].selector + '-' + j);
              var branch = vjava.nesting[j].selector.split('-')[1];

              //pre-shading nest color
              var nestcolor = vjava.nesting[j].dimension.color;

              //nest in the correct branch color
              if(branch === 'left') nestcolor = shadeColor(nestcolor, .1);
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

            colors = colors +
            `atom-text-editor::shadow ${selector}.${getLeftCssClass(dimension.dimension)} {
              background: linear-gradient( 90deg, ${nestGradient}, ${leftcolor} ${x+increment}%);
            }
            atom-text-editor::shadow  ${selector}.${getRightCssClass(dimension.dimension)} {
              background: linear-gradient( 90deg, ${nestGradient}, ${rightcolor} ${x+increment}%);
            }`
          } else {
            colors = colors +
            `atom-text-editor::shadow .${getLeftCssClass(dimension.dimension)} {
              background-color: ${leftcolor};
            }
            atom-text-editor::shadow .${getRightCssClass(dimension.dimension)} {
              background-color: ${rightcolor};
            }`
          }

          //recurse left and right
          vjava.nesting.push({ selector: `${node.dimension}-left`, dimension: dimension});
          //recurse on left and right
          for(var i = 0; i < node.left.length; i ++) {
            colors = colors + vjava.setColors(editor, node.left[i]);
          }
          vjava.nesting.pop();

          vjava.nesting.push({ selector: `${node.dimension}-right`, dimension: dimension});
          for(var i = 0; i < node.right.length; i ++) {
            colors = colors + vjava.setColors(editor, node.right[i]);
          }
          vjava.nesting.pop();
      }
      return colors;
  },

  toggleDimensionEdit(dimension, branch) {
    var otherbranch;
    if(branch === 'left') otherbranch = 'right';
    else otherbranch = 'left';
    if($(`#${dimension.dimension}-edit-${branch}`).hasClass('edit-enabled')) {
      $(`#${dimension.dimension}-edit-${branch}`).removeClass('edit-enabled');
      $(`#${dimension.dimension}-edit-${branch}`).addClass('edit-locked');

      var index = vjava.activeChoices.indexOf(`${dimension.dimension}:${branch}`);
      vjava.activeChoices.splice(index,1);

    } else {
      $(`#${dimension.dimension}-edit-${branch}`).addClass('edit-enabled');
      $(`#${dimension.dimension}-edit-${branch}`).removeClass('edit-locked');


      var index = vjava.activeChoices.indexOf(`${dimension.dimension}:${branch}`);
      if (index < 0) vjava.activeChoices.push(`${dimension.dimension}:${branch}`);
    }
    if($(`#${dimension.dimension}-edit-${otherbranch}`).hasClass('edit-enabled')) {
      $(`#${dimension.dimension}-edit-${otherbranch}`).removeClass('edit-enabled');
      $(`#${dimension.dimension}-edit-${otherbranch}`).addClass('edit-locked');

      var index = vjava.activeChoices.indexOf(`${dimension.dimension}:${otherbranch}`);
      vjava.activeChoices.splice(index,1);
    }
  },

  addViewListeners(dimension) {
    $(`#${dimension.dimension}-disable-right`).on('click', function () {
      //switch the right branch to view mode
      $(`#${dimension.dimension}-view-right`).show();
      $(`#${dimension.dimension}-disable-right`).hide();

      //make appropriate changes to the document
      vjava.selectRight(dimension.dimension);
    });

    $(`#${dimension.dimension}-view-right`).on('click', function () {
        //put the right alternative in edit mode
        $(`#${dimension.dimension}-view-right`).hide();
        $(`#${dimension.dimension}-edit-right`).show();
        vjava.toggleDimensionEdit(dimension, 'right');

        //ensure that the left alternative isn't in edit mode
        if($(`#${dimension.dimension}-edit-left`).is(":visible")) {
          $(`#${dimension.dimension}-view-left`).show();
          $(`#${dimension.dimension}-edit-left`).hide();

          //remove the left selection since one has been made
          var index = vjava.activeChoices.indexOf(`${dimension.dimension}:left`);
          vjava.activeChoices.splice(index,1);

        }

        vjava.activeChoices.push(`${dimension.dimension}:right`)
    });

    $(`#${dimension.dimension}-edit-right`).on('click', function () {
      //go back to viewing
      $(`#${dimension.dimension}-view-right`).show();
      $(`#${dimension.dimension}-edit-right`).hide();

      //remove the right selection since one has been made
      var index = vjava.activeChoices.indexOf(`${dimension.dimension}:right`);
      vjava.activeChoices.splice(index,1);
    });

    $(`#${dimension.dimension}-view-right`).on('contextmenu', function () {
      //as long as the left alternative isn't also hidden, hide this one
      if(!$(`#${dimension.dimension}-disable-left`).is(":visible")) {
        //put the right alternative in edit mode
        $(`#${dimension.dimension}-view-right`).hide();
        $(`#${dimension.dimension}-disable-right`).show();
        vjava.unselectRight(dimension.dimension);
      }
      return false;
    });


    $(`#${dimension.dimension}-disable-left`).on('click', function () {
      //switch the right branch to view mode
      $(`#${dimension.dimension}-view-left`).show();
      $(`#${dimension.dimension}-disable-left`).hide();

      //make appropriate changes to the document
      vjava.selectLeft(dimension.dimension);
    });

    $(`#${dimension.dimension}-view-left`).on('click', function () {
        //put the right alternative in edit mode
        $(`#${dimension.dimension}-view-left`).hide();
        $(`#${dimension.dimension}-edit-left`).show();

        //ensure that the right alternative isn't in edit mode
        if($(`#${dimension.dimension}-edit-right`).is(":visible")) {
          $(`#${dimension.dimension}-view-right`).show();
          $(`#${dimension.dimension}-edit-right`).hide();

          //remove the left selection since one has been made
          var index = vjava.activeChoices.indexOf(`${dimension.dimension}:right`);
          vjava.activeChoices.splice(index,1);

        }
        vjava.activeChoices.push(`${dimension.dimension}:left`);
    });

    $(`#${dimension.dimension}-edit-left`).on('click', function () {
      //go back to viewing
      $(`#${dimension.dimension}-view-left`).show();
      $(`#${dimension.dimension}-edit-left`).hide();
      
      //remove the right selection since one has been made
      var index = vjava.activeChoices.indexOf(`${dimension.dimension}:right`);
      vjava.activeChoices.splice(index,1);
    });

    $(`#${dimension.dimension}-view-left`).on('contextmenu', function () {
        //as long as the right alternative isn't also hidden, hide this one
        if(!$(`#${dimension.dimension}-disable-right`).is(":visible")) {
          //put the left alternative in edit mode
          $(`#${dimension.dimension}-view-left`).hide();
          $(`#${dimension.dimension}-disable-left`).show();
          vjava.unselectLeft(dimension.dimension);
        }
        return false;
    });
  },

  docToPlainText(node, editor) {
      var finalContents = [];
      for(var i = 0; i < vjava.doc.length; i ++) {
        finalContents.push(vjava.nodeToPlainText(vjava.doc[i], editor, false));
      }
      finalContents = finalContents.join('');

      return finalContents;
  },

  nodeToPlainText(node, editor, useOldContent) {
    if(node.type === 'choice') {
      var found = false;
      var selection;
      for (var i = 0; i < vjava.selections.length; i ++) {
        if (vjava.selections[i].name === node.dimension) {
          found = true;
          selection = vjava.selections[i];
          break;
        }
      }

      var contents = `\n#ifdef ${node.dimension}`;
      useOldContent = found && !selection['left'];

      for(var j = 0; j < node.left.length; j ++) {
        var blob = vjava.nodeToPlainText(node.left[j], editor, useOldContent);
        //add an extra newline if text was added on the first line
        if(j == 0 && blob[0] != '\n') {
          blob = '\n' + blob;
        }
        contents = contents + blob;
      }

      useOldContent = found && !selection['right'];
      if(node.right.length > 0) {
        contents = contents + '\n#else';
        for(var j = 0; j < node.right.length; j ++) {
          var blob = vjava.nodeToPlainText(node.right[j], editor, useOldContent);
          if(j == 0 && blob[0] != '\n') {
            blob = '\n' + blob;
          }
          contents = contents + blob;
        }
      }
      return contents + '\n#endif';

    } else {
      //if this node is currently hidden, use its stored content instead of the range, will will be incorrect
      if(useOldContent) return node.content;
      else return editor.getTextInBufferRange(node.marker.getBufferRange());
    }
  },

  //using the list of dimensions contained within the ui object,
  //add html elements, markers, and styles to distinguish dimensions for the user
  renderDimensionUI(editor, node) {

    //if this is a dimension
    if(node.type === 'choice') {
        var found = false;
        var selection;
        for (var i = 0; i < vjava.selections.length; i ++) {
          if (vjava.selections[i].name === node.dimension) {
            found = true;
            selection = vjava.selections[i];
            break;
          }
        }

        let dimension = node;

        //first try to use the color on the dimension
        if(dimension.color) {
          //if that exists, we're good
        }
        //next try the session color set
        else if(vjava.ui.session[dimension.dimension]) {
          dimension.color = vjava.ui.session[dimension.dimension];
        }
        //lastly default to something ugly
        else {
          dimension.color = '#7a2525';
          vjava.ui.session[dimension.dimension] = dimension.color;
        }

        //and this dimension has not yet been parsed
        if(vjava.ui.dimensions.indexOf(node.dimension) < 0) {

            //initialize this dimension for future selection
            vjava.selections.push({ name: node.dimension, left: true, right: true});


            //add this to the list of parsed dimensions, and generate a UI element for it
            vjava.ui.dimensions.push(node.dimension);

            var dimDiv = $(`<div class='form-group dimension-ui-div' id='${dimension.dimension}'>
              <a href='' id='removeDimension-${dimension.dimension}' class='delete_icon'><img name='removeDimensionImg' border="0" src="${iconsPath}/delete-bin.png" width="16" height="18"/> </a>
              <input type='text' id="${dimension.dimension}-colorpicker">
              <h2>${dimension.dimension}</h2>
              <br>
              <span class='toggle-left'>
              <span class='edit' id='${dimension.dimension}-disable-left' style='display: none;'>&nbsp;&nbsp;&nbsp;</span>
              <span class='edit edit-enabled' id='${dimension.dimension}-edit-left' style='display: none;'>&#9998;</span>
              <span class='view view-enabled' id='${dimension.dimension}-view-left'>&#128065;</span>
              </span>
              <span class='choice-label' id='${dimension.dimension}-left-text'>Left</span><br>
              <span class='toggle-right'>
              <span class='edit' id='${dimension.dimension}-disable-right' style='display: none;'>&nbsp;&nbsp;&nbsp;</span>
              <span class='edit edit-enabled' id='${dimension.dimension}-edit-right' style='display: none;'>&#9998;</span>
              <span class='view view-enabled' id='${dimension.dimension}-view-right'>&#128065;</span>
              </span>
              <span class='choice-label' id='${dimension.dimension}-right-text'>Right</span><br></div>  `);
            vjava.ui.main.append(dimDiv);

            //make choice selections if necessary

            //see if a  choice has been made in this dimension
            var index = vjava.activeChoices.indexOf(`${dimension.dimension}:left`);
            if(index < 0) index = vjava.activeChoices.indexOf(`${dimension.dimension}:right`);

            //if so, toggle the ui appropriately
            if(index >= 0) { //this implies that a selection already exists for this element

              var choice = vjava.activeChoices[index];
              var branch = choice.split(':')[1];
              vjava.toggleDimensionEdit(dimension, branch);
            }

            //only hook up listeners, etc. once!
            document.getElementById('removeDimension-' + dimension.dimension).addEventListener("click", function () {
              vjava.removeDimension(dimension.dimension);
            });

            vjava.addViewListeners(node);

            node.colorpicker = $(document.getElementById(node.dimension + '-colorpicker')).spectrum({
              color: node.color
            }).on('change', function () {
              vjava.updateDimensionColor(node);
            });
        }


        if((!found || selection['left']) && node.left.length > 0) {
            //add markers for this new range of a (new or pre-existing) dimension
            var leftRange = editor.markBufferRange(vjava.getChoiceRange(node.left));

            //decorate with the appropriate css classes
            editor.decorateMarker(leftRange, {type: 'line', class: getLeftCssClass(node.dimension)});

            for(var i = vjava.nesting.length - 1; i >= 0; i --) {
              //nesting class format: 'nested-[DIM ID]-[BRANCH]-[LEVEL]'
              editor.decorateMarker(leftRange, {type: 'line', class: 'nested-' + vjava.nesting[i].selector + '-' + i});
            }

            vjava.nesting.push({ selector: `${node.dimension}-left`, dimension: node});
            //recurse on left and right
            for(var i = 0; i < node.left.length; i ++) {
              vjava.renderDimensionUI(editor, node.left[i]);
            }
            vjava.nesting.pop();
        }

        if((!found || selection['right']) && node.right.length > 0) {

            var rightRange = editor.markBufferRange(vjava.getChoiceRange(node.right));

            editor.decorateMarker(rightRange, {type: 'line', class: getRightCssClass(node.dimension)});
            for(var i = vjava.nesting.length - 1; i >= 0; i --) {
              //nesting class format: 'nested-[DIM ID]-[BRANCH]-[LEVEL]'
              editor.decorateMarker(rightRange, {type: 'line', class: 'nested-' + vjava.nesting[i].selector + '-' + i});
            }

            vjava.nesting.push({ selector: `${node.dimension}-right`, dimension: node});
            for(var i = 0; i < node.right.length; i ++) {
              vjava.renderDimensionUI(editor, node.right[i]);
            }
            vjava.nesting.pop();
        }

    } else {
      node.marker = editor.markBufferRange(node.span);
    }
  },

  removeDimension(dimName) {
      var sure = confirm('Are you sure you want to remove this dimension? Any currently \
              visible code in this dimension will be promoted. Any hidden code will be removed.')

      if(sure) {
        //find the dimension and remove it
        for(var i = 0; i < vjava.ui.dimensions.length; i ++) {
          if(vjava.ui.dimensions[i].dimension = dimName) {
            vjava.ui.dimensions.splice(i,1);
            $("#" + dimName).remove();
            vjava.promoteBranchesForDimension(dimName);
            vjava.updateColors();
          }
        }
      } else {
        return;
      }
  },

  promoteBranchesForDimension(dimName) {
    var editor = atom.workspace.getActiveTextEditor();

    //if no selection made, promote both branches to be safe
    var left = true;
    var right = true;

    //find the selections that were made to know which branches to promote
    for (var i = 0; i < vjava.selections.length; i ++) {
      if (vjava.selections[i].name === dimName) {
        selection = vjava.selections[i];
        left = selection.left;
        right = selection.right;
        break;
      }
    }

    for(var j = 0; j < vjava.doc.length; j++) {
      if(vjava.doc[j].type === 'choice') {
        if(vjava.doc[j].dimension === dimName) {
          vjava.doc.splice(j, 1, vjava.promoteBranchForDimensionInNode(vjava.doc[j], editor, dimName, left, right));
        } else {
          for(var i = 0; i < vjava.doc[j].left.length; i ++) {
            if(vjava.doc[j].left[i].type === 'choice' && vjava.doc[j].left[i].dimension === dimName) {
              vjava.doc[j].left.splice(i, 1, vjava.promoteBranchForDimensionInNode(vjava.doc[j].left[i], editor, dimName, left, right));
            }
          }
          for(var i = 0; i < vjava.doc[j].right.length; i ++) {
            if(vjava.doc[j].right[i].type === 'choice' && vjava.doc[j].right[i].dimension === dimName) {
              vjava.doc[j].right.splice.apply(vjava.doc[j].right, [i, 1].concat(vjava.promoteBranchForDimensionInNode(vjava.doc[j].right[i], editor, dimName, left, right)));
            }
          }
        }
      }
    }
  },

  //left and right represent whether the left and right branches should be promoted
  //a value of 'true' indicates that the content in that branch should be promoted
  promoteBranchForDimensionInNode(node, editor, dimName, left, right) {
    //if this is the dimension being promoted, then do that
    if(node.dimension === dimName) {
      //TODO: is this a memory leak? removing references to these objects but perhaps never deleting them
      var region = [];
      if(left) region = region.concat(node.left);
      else vjava.deleteBranch(node.left, editor);
      if(right) region = region.concat(node.right);
      else vjava.deleteBranch(node.right, editor);
      return region;
    }

    //otherwise recurse
    else {
      for(var i = 0; i < node.left.length; i ++) {
        if(node.left[i].type === 'choice' && node.left[i].dimension === dimName) {
          node.left.splice(i, 1, vjava.promoteBranchForDimensionInNode(node.left[i], editor, dimName, left, right));
        }
      }
      for(var i = 0; i < node.right.length; i ++) {
        if(node.right[i].type === 'choice' && node.right[i].dimension === dimName) {
          node.right.splice(i, 1, vjava.promoteBranchForDimensionInNode(node.right[i], editor, dimName, left, right));
        }
      }
    }
  },

  deleteBranch(region, editor) {
    for(var i = 0; i < region.length; i ++) {
      if(region[i].type === 'choice') {
        vjava.deleteBranch(region.left, editor);
        vjava.deleteBranch(region.right, editor);
      } else {
        editor.setTextInBufferRange(region[i].marker.getBufferRange(), '');
      }
    }
  },

  preserveChanges(editor) {
    for(var i = 0; i < vjava.doc.length; i++) {
      vjava.preserveChangesonNode(editor, vjava.doc[i]);
    }
  },

  preserveChangesonNode(editor, node) {
    if(node.type === 'choice') {
      //found is used to see if any selections have been made - if this is a brand new dimension, default both branches to shown
      var found = false;
      var selection;
      for (var i = 0; i < vjava.selections.length; i ++) {
        if (vjava.selections[i].name === node.dimension) {
          found = true;
          selection = vjava.selections[i];
          break;
        }
      }
      if(!found || selection['left']) {
        for(var j = 0; j < node.left.length; j ++) {
          vjava.preserveChangesonNode(editor, node.left[j]);
        }
      }
      if(!found || selection['right']) {
        for(var j = 0; j < node.right.length; j ++) {
          vjava.preserveChangesonNode(editor, node.right[j]);
        }
      }


    } else {
      node.content = editor.getTextInBufferRange(node.marker.getBufferRange());
      node.span = rangeToSpan(node.marker.getBufferRange());
    }
  },

  renderDocument(editor) {
    linesRemoved = 0;
    var finalContents = [];
    for(var i = 0; i < vjava.doc.length; i ++) {
      finalContents.push(vjava.renderContents(vjava.doc[i]));
    }
    finalContents = finalContents.join('');

    editor.setText(finalContents);
  },

  adjustForReShow(editor, dimension, branch) {
    linesReAdded = 0;
    for(var i = 0; i < vjava.doc.length; i ++) {
      vjava.adjustNode(vjava.doc[i], editor, dimension, branch);
    }
  },

  adjustNode(node, editor, dimension, branch) {
    node.span.start[0] = node.span.start[0] + linesReAdded;
    if(node.type === 'choice') {
      if(node.dimension === dimension && branch === 'left') {
        var choiceRange = vjava.getChoiceColumnRange(node.left);
        var size = choiceRange[1]-choiceRange[0];
        linesReAdded = linesReAdded + size + 1;
      } else {
        for(var i = 0; i < node.left.length; i ++) {
          vjava.adjustNode(node.left[i], editor, dimension, branch);
        }
      }

      if(node.dimension === dimension && branch === 'right') {
        var choiceRange = vjava.getChoiceColumnRange(node.right);
        var size = choiceRange[1]-choiceRange[0];
        linesReAdded = linesReAdded + size + 1;
      } else {
        for(var i = 0; i < node.right.length; i ++) {
          vjava.adjustNode(node.right[i], editor, dimension, branch);
        }
      }
    }
    node.span.end[0] = node.span.end[0] + linesReAdded;
  },

  //query the back-end parser, and call parseDimension where necessary
  parseVJava(textContents, next) {
    //send file contents to the backend, receive jsonified output
    var packagePath = atom.packages.resolvePackagePath("variational-java") + "/lib";
    exec('cd ' + packagePath);

    var spawn = require('child_process').spawn;
    var parser = spawn('variational-parser',[],{ cwd: packagePath });

    parser.stdout.setEncoding('utf8');
    parser.stdout.on('data', function (data) {
      vjava.originalDoc = JSON.parse(data.toString());
      vjava.doc = JSON.parse(data.toString());
      next();
    });
    parser.on('exit', function (code) {
      console.log('child process exited with code ' + code);
    });

    parser.stdin.write(textContents);
    parser.stdin.end();

    return;
  },

  // these four functions execute a put with the old selections,
  // then a pull with the new selections
  // display both alternatives
  // show the right alternative
  selectRight(dimName) {
    var editor = atom.workspace.getActiveTextEditor();
    vjava.preserveChanges(editor);
    for (var i = 0; i < vjava.selections.length; i ++) {
      if (vjava.selections[i].name === dimName) {
        vjava.selections[i].right = true;
      }
    }
    vjava.adjustForReShow(editor, dimName, 'right');
    vjava.renderDocument(editor);
    for(var i = 0; i < vjava.doc.length; i ++) {
      vjava.renderDimensionUI(editor, vjava.doc[i]);
    }
  },

  // hide the right alternative
  unselectRight(dimName) {
    var editor = atom.workspace.getActiveTextEditor();
    vjava.preserveChanges(editor);
    for (var i = 0; i < vjava.selections.length; i ++) {
      if (vjava.selections[i].name === dimName) {
        vjava.selections[i].right = false;
      }
    }
    vjava.renderDocument(editor);
    for(var i = 0; i < vjava.doc.length; i ++) {
      vjava.renderDimensionUI(editor, vjava.doc[i]);
    }
  },

  // show the left alternative
  selectLeft(dimName) {
    var editor = atom.workspace.getActiveTextEditor();
    vjava.preserveChanges(editor);
    for (var i = 0; i < vjava.selections.length; i ++) {
      if (vjava.selections[i].name === dimName) {
        vjava.selections[i].left = true;
      }
    }
    vjava.adjustForReShow(editor, dimName, 'left');
    vjava.renderDocument(editor);
    for(var i = 0; i < vjava.doc.length; i ++) {
      vjava.renderDimensionUI(editor, vjava.doc[i]);
    }
  },

  // hide the left alternative
  unselectLeft(dimName) {
    var editor = atom.workspace.getActiveTextEditor();
    vjava.preserveChanges(editor);
    for (var i = 0; i < vjava.selections.length; i ++) {
      if (vjava.selections[i].name === dimName) {
        vjava.selections[i].left = false;
      }
    }

    vjava.renderDocument(editor);
    for(var i = 0; i < vjava.doc.length; i ++) {
      vjava.renderDimensionUI(editor, vjava.doc[i]);
    }
  },

  activate(state) {
    var colorpicker = document.createElement("script");
    //TODO load session from a file somewhere?
    vjava.ui.session = {};

    colorpicker.type = "text/javascript";
    colorpicker.src = atom.packages.resolvePackagePath("variational-java") + "/lib/spectrum.js";
    colorpicker.id = 'colorpickerscript';

    document.body.appendChild(colorpicker);

    window.$ = window.jQuery = require('jquery');

    vjava.selections = !window.$.isEmptyObject({}) ? state : [];

    var activeEditor = atom.workspace.getActiveTextEditor();

    var contents = activeEditor.getText();

    //parse the file
    vjava.parseVJava(contents, function() {
      // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
      vjava.subscriptions = new CompositeDisposable();

      vjava.ui.dimensions = [];

      vjava.createUI();

      vjava.renderDocument(activeEditor);

      for(var i = 0; i < vjava.doc.length; i ++) {
        vjava.renderDimensionUI(activeEditor, vjava.doc[i]);
      }


      vjava.updateColors(activeEditor);

      // Register command that toggles vjava view
      vjava.subscriptions.add(atom.commands.add('atom-workspace', {
        'variational-java:toggle': () => vjava.toggle()
      }));
      vjava.subscriptions.add(atom.commands.add('atom-workspace', {
        'variational-java:add-choice-segment': () => vjava.addChoiceSegment()
      }));
      //preserve the contents for later comparison (put, get)
      vjava.raw = contents;

      vjava.ui.panel.show();
    });

  },

  deactivate() {
  },

  serialize() {
    var selections = {};
    $(`#${mainDivId} .dimension-ui-div`).each(function (dn, dim) {
      var dimName = $(dim).find('[id*=left]').attr('id').split('-left')[0];
      if($(dim).find('[id*=-left]').selected) {
        selections[dimName] = 'left';
      } else if ($(dim).find('[id*=-right]').selected) {
        selections[dimName] = 'right';
      } else {
        selections[dimName] = 'unselected';
      }
    });
    return selections;
  },

  addChoiceSegment() {

    if(!vjava.activeChoices[0]) {
        alert('please make a selection before inserting a choice segment');
        return;
    };

    var activeEditor = atom.workspace.getActiveTextEditor();


    var lit = 'new dimension';

    //we have to grab the zero index for some stupid reason
    var newRange = activeEditor.insertText(lit)[0];
      var node = {
        type: 'choice'
      };
      var marker = activeEditor.markBufferRange(newRange);
      node.marker = marker;

      var choice = vjava.activeChoices[0];
      var branch = choice.split(':')[1];
      var dim = choice.split(':')[0];

      var node = {
        span: {
          start: [newRange.start.row, newRange.start.column],
          end: [newRange.end.row+1, newRange.end.column]
        },
        dimension: dim,
        color: vjava.ui.session[dim],
        type: 'choice'
      }

      node.right = [];
      node.left = [];
      newspan = {
        start: [newRange.start.row+1, newRange.start.column],
        end: [newRange.end.row+2, newRange.end.column]
      };

      node[branch] = [
        {
          span: newspan,
          marker: activeEditor.markBufferRange(newRange),
          content: '\n' + lit,
          type: 'text'
        }
      ];

      vjava.insertVNode(node);
      vjava.renderDocument(activeEditor);

      for(var i = 0; i < vjava.doc.length; i ++) {
        vjava.renderDimensionUI(activeEditor, vjava.doc[i]);
      }

      vjava.updateColors(activeEditor);
  },

  insertVNode(node) {
      linesReAdded = 0;

      for(var i = 0; i < vjava.doc.length; i++) {
        var ret = vjava.insertVNodeAt(vjava.doc[i], node);
        //found it, do the insertion
        if(ret) {
          vjava.doc.splice(i, 1, ret.first, ret.second, ret.third);
          i = i + 2;
        }
      }
  },

  insertVNodeAt(here, node) {
      var activeEditor = atom.workspace.getActiveTextEditor();

      if(here.marker) here.span = rangeToSpan(here.marker.getBufferRange());
      here.span.start[0] = here.span.start[0] + linesReAdded;

      if(here.type === 'text') {
          if(here.span.start[0] <= node.span.start[0] && here.span.end[0]+1 >= node.span.end[0]) { //we must slice open this node

              //if we added a left alternative, we need 2 lines. if we added a right alternative, we require 3 lines
              added = (node.left.length > 0) ? 3 : 4;
              linesReAdded = linesReAdded + added;
              var firstRange = {
                start: here.span.start,
                end: node.span.start
              };

              var firstContent = activeEditor.getTextInBufferRange(firstRange);

              //slice creates a copy so we can modify safely
              thirdStart = node.span.end.slice(0, 2);
              thirdStart[0] = thirdStart[0] - 1;
              var thirdContent = activeEditor.getTextInBufferRange([thirdStart,here.span.end]);

              node.span.end[0] = node.span.end[0] + 1; //bump it down one to account for the extra newline inserted upon rendering document

              var thirdRange = {
                start: node.span.end,
                end: here.span.end
              };
              //do this manually since it won't get hit by the tree recursion
              thirdRange.end[0] = thirdRange.end[0] + linesReAdded;

              var first = {
                span: firstRange,
                marker: activeEditor.markBufferRange(firstRange),
                content: firstContent,
                type: 'text'
              };
              var second = node;
              var third = {
                span: thirdRange,
                marker: activeEditor.markBufferRange(thirdRange),
                content: thirdContent,
                type: 'text'
              };

              found = {
                first: first,
                second: second,
                third: third,
              };
        } else {
          found = false;
        }
    } else {
        for(var i = 0; i < here.left.length; i++) {
          var ret = vjava.insertVNodeAt(here.left[i], node);
          //found it, do the insertion
          if(ret) {
            here.left.splice(i, 1, ret.first, ret.second, ret.third);
            i = i + 2;
          }
        }

        for(var i = 0; i < here.right.length; i++) {
          var ret = vjava.insertVNodeAt(here.right[i], node);
          if(ret) {
            here.right.splice(i, 1, ret.first, ret.second, ret.third);
            i = i + 2;
          }
        }
        found = false;
    }
    if(!found) here.span.end[0] = here.span.end[0] + linesReAdded;
    return found;
  },

  toggle() {
    var activeEditor = atom.workspace.getActiveTextEditor();
    if(vjava.ui.panel.isVisible()) {
      $("#colorpickerscript").remove();
      vjava.ui.panel.destroy();
      vjava.ui.dimensions = [];

      //TODO: undo selections one at a time, then re-render. Important!
      activeEditor.setText(vjava.docToPlainText(vjava.doc, activeEditor));
    } else {
      rendering = true;

      var contents = activeEditor.getText();

      //parse the file
      vjava.parseVJava(contents, function() {


        vjava.ui.dimensions = [];

        vjava.createUI();

        vjava.renderDocument(activeEditor);

        for(var i = 0; i < vjava.doc.length; i ++) {
          vjava.renderDimensionUI(activeEditor, vjava.doc[i]);
        }


        vjava.updateColors(activeEditor);

        //preserve the contents for later comparison (put, get)
        vjava.raw = contents;

        vjava.ui.panel.show();
      });

      rendering = false
    }


    return (true);
  }

};

export default vjava;
