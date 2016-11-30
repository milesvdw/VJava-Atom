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
            <span class='edit edit-locked' id='${dimName}-edit-left'>&#9998;</span>
            <span class='view view-enabled' id='${dimName}-view-left'>&#128065;</span>
                <span class='choice-label' id='${dimName}-left-text'>Left</span><br>
            <span class='edit edit-locked' id='${dimName}-edit-right'>&#9998;</span>
            <span class='view view-enabled' id='${dimName}-view-right'>&#128065;</span>
                <span class='choice-label' id='${dimName}-right-text'>Right</span><br></div>`);
          vjava.ui.main.append(dimDiv);


          document.getElementById('removeDimension-' + dimName).addEventListener("click", function () {
            vjava.removeDimension(dimName);
          });

          vjava.addEditListeners(dimension);
          vjava.addViewListeners(dimension);



          dimension.colorpicker = $(document.getElementById(dimension.dimension + '-colorpicker')).spectrum({
            color: dimension.color
          }).on('change', function () {
            dimension.color = dimension.colorpicker.spectrum('get').toHexString();
            vjava.ui.session[dimension.dimension] = dimension.color;
            vjava.updateColors();
          });

          vjava.ui.dimensions.push(dimension);
      });
    });
  },

  getChoiceRange(choice) {
    return [choice[0].span.start,choice.last().span.end];
  },

  getChoiceColumnRange(choice) {
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
      var left = '\n';
      if(!found || selection['left']) {
        for(var j = 0; j < item.left.length; j ++) {
          left = left + vjava.renderContents(item.left[j]);
        }
      }
      //otherwise, we're hiding the left dimension. in this case, adjust all spans appropriately
      else {
        var choiceRange = vjava.getChoiceColumnRange(item.left);
        var size = choiceRange[1]-choiceRange[0];
        //+1 for inclusive lines
        linesRemoved = linesRemoved + size + 1;
      }

      var right = '\n';
      if(!found || selection['right']) {
        for(var j = 0; j < item.right.length; j ++) {
          right = right + vjava.renderContents(item.right[j]);
        }
        //don't forget newline to account for the '#end' keyword
        right = right + '\n';
      }
      //otherwise, we're hiding the right dimension. In this case, adjust all spans appropriately
      else {
        var choiceRange = vjava.getChoiceColumnRange(item.right);
        //+1 for inclusive lines
        var size = choiceRange[1]-choiceRange[0] + 1;
        linesRemoved = linesRemoved + size;
      }

      content = left + right;


    } else {
      content = item.content;
    }
    item.span.end[0] = item.span.end[0] - linesRemoved;
    return content;
  },

  clearColors() {
    $("#dimension-color-styles").remove();
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
            var nestGradient = nestColors[0] + ' 0%';
            for(var j = 1; j < nestColors.length; j++) {
              x = (j) * 7;
              nestGradient = `${nestGradient}, ${nestColors[j]} ${x}%`;
            }

            //add the colors and borders as styles to the document head

            colors = colors +
            `atom-text-editor::shadow ${selector}.${getLeftCssClass(dimension.dimension)} {
              background: linear-gradient( 90deg, ${nestGradient}, ${leftcolor} ${x+7}%);
            }
            atom-text-editor::shadow  ${selector}.${getRightCssClass(dimension.dimension)} {
              background: linear-gradient( 90deg, ${nestGradient}, ${rightcolor} ${x+7}%);
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

  addEditListeners(dimension) {
    //add listeners
    $(`#${dimension.dimension}-edit-left`).on('click', function () {
        if($(`#${dimension.dimension}-edit-left`).hasClass('edit-enabled')) {
          $(`#${dimension.dimension}-edit-left`).removeClass('edit-enabled');
          $(`#${dimension.dimension}-edit-left`).addClass('edit-locked');

          var index = vjava.activeChoices.indexOf(`${dimension.dimension}:left`);
          vjava.activeChoices.splice(index,1); //TODO: I believe this is causing the bug where I can only edit once

        } else {
          $(`#${dimension.dimension}-edit-left`).addClass('edit-enabled');
          $(`#${dimension.dimension}-edit-left`).removeClass('edit-locked');
          vjava.activeChoices.push(`${dimension.dimension}:left`);
        }
        if($(`#${dimension.dimension}-edit-right`).hasClass('edit-enabled')) {
          $(`#${dimension.dimension}-edit-right`).removeClass('edit-enabled');
          $(`#${dimension.dimension}-edit-right`).addClass('edit-locked');

          var index = vjava.activeChoices.indexOf(`${dimension.dimension}:right`);
          vjava.activeChoices.splice(index,1);
        }

        //TODO: do more stuff regarding locking/unlocking edit on this choice
    });
    $(`#${dimension.dimension}-edit-right`).on('click', function () {
        if($(`#${dimension.dimension}-edit-right`).hasClass('edit-enabled')) {
          $(`#${dimension.dimension}-edit-right`).removeClass('edit-enabled');
          $(`#${dimension.dimension}-edit-right`).addClass('edit-locked');

          var index = vjava.activeChoices.indexOf(`${dimension.dimension}:right`);
          vjava.activeChoices.splice(index,1);
        } else {
          $(`#${dimension.dimension}-edit-right`).addClass('edit-enabled');
          $(`#${dimension.dimension}-edit-right`).removeClass('edit-locked');
          vjava.activeChoices.push(`${dimension.dimension}:right`);
        }
        if($(`#${dimension.dimension}-edit-left`).hasClass('edit-enabled')) {
          $(`#${dimension.dimension}-edit-left`).removeClass('edit-enabled');
          $(`#${dimension.dimension}-edit-left`).addClass('edit-locked');

          var index = vjava.activeChoices.indexOf(`${dimension.dimension}:left`);
          vjava.activeChoices.splice(index,1);
        }
        //TODO: do more stuff regarding locking/unlocking edit on this choice
    });
  },

  addViewListeners(dimension) {
    $(`#${dimension.dimension}-view-right`).on('click', function () {
        if($(`#${dimension.dimension}-view-right`).hasClass('view-enabled')) {
          $(`#${dimension.dimension}-view-right`).removeClass('view-enabled');
          $(`#${dimension.dimension}-view-right`).addClass('view-disabled');
          vjava.unselectRight(dimension.dimension);
        } else {
          $(`#${dimension.dimension}-view-right`).addClass('view-enabled');
          $(`#${dimension.dimension}-view-right`).removeClass('view-disabled');
          vjava.selectRight(dimension.dimension);
        }
        return false;
    });
    $(`#${dimension.dimension}-view-left`).on('click', function () {
        if($(`#${dimension.dimension}-view-left`).hasClass('view-enabled')) {
          $(`#${dimension.dimension}-view-left`).removeClass('view-enabled');
          $(`#${dimension.dimension}-view-left`).addClass('view-disabled');
          vjava.unselectLeft(dimension.dimension);
        } else {
          $(`#${dimension.dimension}-view-left`).addClass('view-enabled');
          $(`#${dimension.dimension}-view-left`).removeClass('view-disabled');
          vjava.selectLeft(dimension.dimension);
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

      var contents = `\n#dimension ${node.dimension}`;
      useOldContent = found && !selection['left'];
      for(var j = 0; j < node.left.length; j ++) {
        contents = contents + vjava.nodeToPlainText(node.left[j], editor, useOldContent);
      }

      useOldContent = found && !selection['right'];
      contents = contents + '\n#else';
      for(var j = 0; j < node.right.length; j ++) {
        contents = contents + vjava.nodeToPlainText(node.right[j], editor, useOldContent);
      }
      return contents + '\n#end';

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


        //and this dimension has not yet been parsed
        if(vjava.ui.dimensions.indexOf(node.dimension) < 0) {

            //initialize this dimension for future selection
            vjava.selections.push({ name: node.dimension, left: true, right: true});


            //add this to the list of parsed dimensions, and generate a UI element for it
            vjava.ui.dimensions.push(node.dimension);
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
            }

            var dimDiv = $(`<div class='form-group dimension-ui-div' id='${dimension.dimension}'>
              <a href='' id='removeDimension-${dimension.dimension}' class='delete_icon'><img name='removeDimensionImg' border="0" src="${iconsPath}/delete-bin.png" width="16" height="18"/> </a>
              <input type='text' id="${dimension.dimension}-colorpicker">
              <h2>${dimension.dimension}</h2>
              <br>
              <span class='edit edit-locked' id='${dimension.dimension}-edit-left'>&#9998;</span>
              <span class='view view-enabled' id='${dimension.dimension}-view-left'>&#128065;</span>
                  <span class='choice-label' id='${dimension.dimension}-left-text'>Left</span><br>
              <span class='edit edit-locked' id='${dimension.dimension}-edit-right'>&#9998;</span>
              <span class='view view-enabled' id='${dimension.dimension}-view-right'>&#128065;</span>
                  <span class='choice-label' id='${dimension.dimension}-right-text'>Right</span><br></div>`);
            vjava.ui.main.append(dimDiv);

            //only hook up listeners, etc. once!
            document.getElementById('removeDimension-' + dimension.dimension).addEventListener("click", function () {
              vjava.removeDimension(dimension.dimension);
            });

            vjava.addEditListeners(node);
            vjava.addViewListeners(node);

            node.colorpicker = $(document.getElementById(node.dimension + '-colorpicker')).spectrum({
              color: node.color
            }).on('change', function () {
              dimension.color = dimension.colorpicker.spectrum('get').toHexString();
              vjava.ui.session[dimension.dimension] = dimension.color;
              vjava.updateColors();
            });
        }


        if(!found || selection['left']) {
          //add markers for this new range of a (new or pre-existing) dimension
          var leftMarker = { range: editor.markBufferRange(vjava.getChoiceRange(node.left)),
                            dimension: node.dimension,
                            branch: 'left'
                          };

          //decorate with the appropriate css classes
          editor.decorateMarker(leftMarker.range, {type: 'line', class: getLeftCssClass(node.dimension)});
          for(var i = vjava.nesting.length - 1; i >= 0; i --) {
            //nesting class format: 'nested-[DIM ID]-[BRANCH]-[LEVEL]'
            editor.decorateMarker(leftMarker.range, {type: 'line', class: 'nested-' + vjava.nesting[i].selector + '-' + i});
          }
          //add all the nesting classes (ignore the first nesting, since that is the identity dimension)
          node.leftMarker = leftMarker;

          vjava.nesting.push({ selector: `${node.dimension}-left`, dimension: node});
          //recurse on left and right
          for(var i = 0; i < node.left.length; i ++) {
            vjava.renderDimensionUI(editor, node.left[i]);
          }
          vjava.nesting.pop();
        }

        if(!found || selection['right']) {
          var rightMarker = { range: editor.markBufferRange(vjava.getChoiceRange(node.right)),
                            dimension: node.dimension,
                            branch: 'right'
                          };
          editor.decorateMarker(rightMarker.range, {type: 'line', class: getRightCssClass(node.dimension)});
          for(var i = vjava.nesting.length - 1; i >= 0; i --) {
            //nesting class format: 'nested-[DIM ID]-[BRANCH]-[LEVEL]'
            editor.decorateMarker(rightMarker.range, {type: 'line', class: 'nested-' + vjava.nesting[i].selector + '-' + i});
          }

          node.rightMarker = rightMarker;
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
    vjava.adjustForReShow(editor, dimName, 'left');
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

    if(!vjava.activeChoices[0]) return;
    var activeEditor = atom.workspace.getActiveTextEditor();

    //TODO: detect if we're already inside the editable dimension
    var dimensionId = vjava.activeChoices[0].split(':')[0];
    var dimension;
    for(var i = 0; i < vjava.ui.dimensions.length; i++) {
        if(vjava.ui.dimensions[i].dimension === dimensionId) {
          dimension = vjava.ui.dimensions[i];
        }
    }
    var startPos = activeEditor.getCursorBufferPosition();

    //TODO: deal with nesting?
    var choice = vjava.activeChoices[0].split(':')[1]; // get the correct choice(s);
    dimension[choice + 'markers'].forEach(function(element, index, arr) {
        if(element.getBufferRange().containsPoint(startPos)) return;
    });

    // 1. find node associated with this buffer range
    // 2. determine if nodes need to be created
    // 3.

    //starting up a change, don't listen for change starts for a bit
    vjava.subscriptions['onDidChange'].dispose();
    vjava.subscriptions['onDidStopChanging'] = activeEditor.onDidStopChanging(function (e) {
        var endPos = activeEditor.getCursorBufferPosition();
        var marker = activeEditor.markBufferRange([startPos,endPos]);

        if(choice === 'left') {
          dimension.leftmarkers.push(marker);
          activeEditor.decorateMarker(marker, {type: 'line', class: getLeftCssClass(dimension.dimension)});
        } else {
          dimension.rightmarkers.push(marker);
          activeEditor.decorateMarker(marker, {type: 'line', class: getRightCssClass(dimension.dimension)});
        }


        vjava.subscriptions['onDidStopChanging'].dispose();
        vjava.subscriptions['onDidChange'] = activeEditor.onDidChange(vjava.addChoiceSegment);
    });
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

      rendering = false;

      setTimeout(function () {
        //decorate with the current editor dimension/choice
        vjava.subscriptions['onDidChange'] = activeEditor.onDidChange(vjava.addChoiceSegment);
      }, 100);
    }


    return (true);
  }

};

export default vjava;
