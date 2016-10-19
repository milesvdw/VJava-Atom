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

function indexFromZero(span) {
  return [span[0]-1,span[1]];
}

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
            vjava.updateColors();
          });

          vjava.ui.dimensions.push(dimension);
      });
    });
  },

  //extract the content (recursively) of a dimension
  renderDimension(dim) {
    //accept a jsonified dimension, and return whatever we want that to look like in the editor
    var left = "";

    //initialize this dimension for future selection
    vjava.selections.push({ name: dim.dimension, left: true, right: true});

    //preserve the nesting level
    vjava.nesting.push({ selector: `${dim.dimension}-left`, dimension: dim});
    for(var i = 0; i < dim.left.length; i ++) left = left + vjava.renderContents(dim.left[i]);
    vjava.nesting.pop();
    var right = "";
    vjava.nesting.push({ selector: `${dim.dimension}-right`, dimension: dim});
    for(var i = 0; i < dim.right.length; i ++) right = right + vjava.renderContents(dim.right[i]);
    vjava.nesting.pop();
    return left + '\n' + right;
  },

  renderJava(java) {
    //accept a jsonified java fragment, and return whatever we want that to look like in the editor
    return java.content;
  },

  renderContents(item) {
    var editor = atom.workspace.getActiveTextEditor();
    if(item.type === 'choice') {
      //TODO: prevent adding duplicate dimensions
      vjava.ui.dimensions.push(item);

      //record what the nesting is at this region
      vjava.ui.dimensions.last().nesting = vjava.nesting.slice(0);

      //hook these up for later parsing back to JSON
      item.counterpart = vjava.ui.dimensions.last();

      //push on a dimension to represent any nesting that may occur
      return vjava.renderDimension(vjava.ui.dimensions.last());

    } else {
      item.counterpart = { marker: editor.markBufferRange([indexFromZero(item.span.start),indexFromZero(item.span.end)])};
      return vjava.renderJava(item);
    }
  },

  updateColors() {
    var colors = `<style id='dimension-color-styles'>`;
    $("#dimension-color-styles").remove();
    for(var i = 0; i < vjava.ui.dimensions.length; i ++) {
        colors = (function (i, colors) {
            var dimension = vjava.ui.dimensions[i];
            var color = dimension.colorpicker.spectrum('get').toHexString();

            //find the color for the left alternative
            var leftcolor = shadeColor(color, .1);
            var rightcolor = shadeColor(color, -.1);

            var selectors = [];
            var nestColors = [];

            if(dimension.nesting.length > 0) {
              for(var j = dimension.nesting.length - 1; j >= 0; j --) {
                //nesting class format: 'nested-[DIM ID]-[BRANCH]-[LEVEL]'
                selectors.push('.nested-' + dimension.nesting[j].selector + '-' + j);
                var branch = dimension.nesting[j].selector.split('-')[1];

                //pre-shading nest color
                var nestcolor = dimension.nesting[j].dimension.colorpicker.spectrum('get').toHexString();

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
                x = j * 7;
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

            return colors;
        })(i, colors);
    }
    colors = colors + `</style>`;
    $('head').append($(colors));
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
    });
  },

  parseToJSON(doc) {
      var editor = atom.workspace.getActiveTextEditor();
      var output = [];
      for(var i = 0; i < doc.length; i ++) {
          var item = doc[i];
          if(item.type === 'choice') {
              //NOTE: This assumes that we are parsing in order, and that the markers were added in order
              //It makes use of this assumption by just grabbing the first range for each dimension that we
              //wander across, using that range, then removing that range so that the next time we encounter
              //this dimension we use the sequentially proximal range.
              var leftRange = item.counterpart.leftmarkers[0];
              var rightRange = item.counterpart.rightmarkers[0];

              output.push({
                "span": {
                  "start": leftRange.start,
                  "end": rightRange.end
                },
                "dimension": item.dimension,
                "left": vjava.parseToJSON(item.left),
                "right": vjava.parseToJSON(item.right),
                "type": "choice"
              });

              item.counterpart.leftmarkers.splice(0,1);
              item.counterpart.rightmarkers.splice(0,1);
          } else {
              var range = item.counterpart.marker.getBufferRange();
              output.push({
                "span": {
                    "start": range.start,
                    "end": range.end
                },
                "content": editor.getTextInBufferRange([[range.start.row, range.start.column-1], range.end]),
                "type": 'text'
              });
          }
      }
      return output;
  },

  //using the list of dimensions contained within the ui object,
  //add html elements, markers, and styles to distinguish dimensions for the user
  renderDimensionUI(editor) {
    //TODO: prevent parsingn duplicate dimensions - instead group them
    vjava.ui.main.html('<h1>Variation Viewer</h1><br><div id=\'message\'></div>');
    for(var i = 0; i < vjava.ui.dimensions.length; i ++) {
      (function (i) {
        var dimension = vjava.ui.dimensions[i];
        if(!dimension.color) {
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

        var leftMarker = editor.markBufferRange([indexFromZero(dimension.left[0].span.start),indexFromZero(dimension.left.last().span.end)]);
        var rightMarker = editor.markBufferRange([indexFromZero(dimension.right[0].span.start),indexFromZero(dimension.right.last().span.end)]);
        var dimMarker = editor.markBufferRange([indexFromZero(dimension.left[0].span.start),indexFromZero(dimension.right.last().span.end)]);

        //create a marker in the ui to apply styles, etc.
        if(!dimension.leftmarkers) dimension.leftmarkers = [];
        if(!dimension.rightmarkers) dimension.rightmarkers = [];
        dimension.leftmarkers.push(leftMarker);
        dimension.rightmarkers.push(rightMarker);

        editor.decorateMarker(leftMarker, {type: 'line', class: getLeftCssClass(dimension.dimension)});
        editor.decorateMarker(rightMarker, {type: 'line', class: getRightCssClass(dimension.dimension)});

        //add all the nesting classes (ignore the first nesting, since that is the identity dimension)
        for(var i = dimension.nesting.length - 1; i >= 0; i --) {
          //nesting class format: 'nested-[DIM ID]-[BRANCH]-[LEVEL]'
          editor.decorateMarker(leftMarker, {type: 'line', class: 'nested-' + dimension.nesting[i].selector + '-' + i});
          editor.decorateMarker(rightMarker, {type: 'line', class: 'nested-' + dimension.nesting[i].selector + '-' + i});
        }

        vjava.addEditListeners(dimension);
        vjava.addViewListeners(dimension);

        dimension.colorpicker = $(document.getElementById(dimension.dimension + '-colorpicker')).spectrum({
          color: dimension.color
        }).on('change', function () {
          vjava.updateColors();
        });

        document.getElementById('removeDimension-' + dimension.dimension).addEventListener("click", function () {
          vjava.removeDimension(dimension.dimension);
        });

        var subscription = editor.onDidStopChanging(function(e) {
           subscription.dispose();
         });
      })(i);
    }

    vjava.updateColors();

  },

  removeDimension(dimName) {
      var dim = vjava.ui.dimensions[dimName];
      var index = vjava.ui.dimensions.indexOf(dim);
      vjava.ui.dimensions.splice(index,1);
      $("#" + dimName).remove();
      vjava.updateColors();
      //TODO: updateVJava with new structure?
  },

  renderDocument() {
    var finalContents = [];
    for(var i = 0; i < vjava.doc.length; i ++) {
      finalContents.push(vjava.renderContents(vjava.doc[i]));
    }
    finalContents = finalContents.join("\n");
    var activeEditor = atom.workspace.getActiveTextEditor();

    activeEditor.setText(finalContents);
  },

  //query the back-end parser, and call parseDimension where necessary
  parseVJava(textContents, cb) {
    //send file contents to the backend, receive jsonified output
    var packagePath = atom.packages.resolvePackagePath("variational-java") + "/lib";
    exec('cd ' + packagePath);

    var spawn = require('child_process').spawn;
    var parser = spawn('variational-parser',[],{ cwd: packagePath });

    parser.stdout.setEncoding('utf8');
    parser.stdout.on('data', function (data) {
      vjava.ui.dimensions = [];
      vjava.originalDoc = JSON.parse(data.toString());
      vjava.doc = JSON.parse(data.toString());
      vjava.renderDocument();
      cb();
    });
    parser.on('exit', function (code) {
      console.log('child process exited with code ' + code);
    });

    parser.stdin.write(textContents);
    parser.stdin.end();

    return;
  },

  viewVJava() {
    var packagePath = atom.packages.resolvePackagePath("variational-java") + "/lib";
    exec('cd ' + packagePath);

    var spawn = require('child_process').spawn;
    var parser = spawn('variational-view',[],{ cwd: packagePath });

    parser.stdout.setEncoding('utf8');
    parser.stdout.on('data', function (data) {
      vjava.ui.dimensions = [];
      vjava.doc = JSON.parse(data.toString());
      console.log(vjava.doc);
      vjava.renderDocument();
      vjava.renderDimensionUI(atom.workspace.getActiveTextEditor());
      vjava.renderAll();
    });
    parser.on('exit', function (code) {
      console.log('child process exited with code ' + code);
    });
    var selections = [];

    //TODO: ensure the selections are 1:1 with actual dimensions
    for(var d = 0; d < vjava.selections.length; d ++) {
      //note that while our data structure allows left and right to be set completely inependently
      //the actual haskell view operation dictates that left and right are exclusive
      //that is reflected in the logic here
      if (vjava.selections[d]['left'] && !vjava.selections[d]['right']) {
        selections.push({dimension: vjava.selections[d].name, alternative: 'left'});
      } else if (vjava.selections[d]['right'] && !vjava.selections[d]['left']) {
        selections.push({dimension: vjava.selections[d].name, alternative: 'right'});
      }
    }

    parser.stdin.write(JSON.stringify({ program: vjava.originalDoc, selections: selections }));
    parser.stdin.end();

    return;
  },

  //this will pass to the back end the modified document, along with current selections
  //and the previous 'rawText' for comparison
  //it should also update the 'rawText' for comparison in the *next* update
  updateVJava() {
    // var json = vjava.parseToJSON(vjava.doc);
    // var text = vjava.regionToProgram(json);
    //TODO: set selections
    //TODO: perform an update, set raw to be the new full document
    //TODO: perform a view (using parseVJava + selections)
    // console.log(text);
    // parseVJava(text, function() {
    //   alert('maybe it worked?');
    // });
  },

  regionToProgram(region) {
    var text = '';
    for(var i = 0; i < region.length; i++) {
        text = text + vjava.nodeToProgram(region[i]);
    }
    return text;
  },

  nodeToProgram(node) {
      var text;
      if(node.type === 'choice') {
          //parse both sides of the dimension and add back in concrete syntax
          text = `#dimension ${node.dimension}\n`
                + vjava.regionToProgram(node.left) + '#else\n'
                + vjava.regionToProgram(node.right) + '#end\n';
      } else {
          text = node.content;
      }
      return text;
  },

  //iteratively render each piece of the contents
  renderAll() {
    for(var i = 0; i < vjava.doc.length; i ++) {
      vjava.renderContents(vjava.doc[i]);
    }
  },

  // these four functions execute a put with the old selections,
  // then a pull with the new selections
  // display both alternatives
  // show the right alternative
  selectRight(dimName) {
    vjava.updateVJava(atom.workspace.getActiveTextEditor().getText());
    for (var i = 0; i < vjava.selections.length; i ++) {
      if (vjava.selections[i].name === dimName) {
        vjava.selections[i]['right'] = true;
      }
    }
    vjava.viewVJava();
  },

  // hide the right alternative
  unselectRight(dimName) {
    vjava.updateVJava(atom.workspace.getActiveTextEditor().getText());
    for (var i = 0; i < vjava.selections.length; i ++) {
      if (vjava.selections[i].name === dimName) {
        vjava.selections[i]['right'] = false;
      }
    }
    vjava.viewVJava();
  },

  // show the left alternative
  selectLeft(dimName) {
    vjava.updateVJava(atom.workspace.getActiveTextEditor().getText());
    for (var i = 0; i < vjava.selections.length; i ++) {
      if (vjava.selections[i].name === dimName) {
        vjava.selections[i]['left'] = true;
      }
    }
    vjava.viewVJava();
  },

  // hide the left alternative
  unselectLeft(dimName) {
    vjava.updateVJava(atom.workspace.getActiveTextEditor().getText());
    for (var i = 0; i < vjava.selections.length; i ++) {
      if (vjava.selections[i].name === dimName) {
        vjava.selections[i]['left'] = false;
      }
    }
    vjava.viewVJava();
  },

  activate(state) {
    var colorpicker = document.createElement("script");

    colorpicker.type = "text/javascript";
    colorpicker.src = atom.packages.resolvePackagePath("variational-java") + "/lib/spectrum.js";
    colorpicker.id = 'colorpickerscript';

    document.body.appendChild(colorpicker);

    window.$ = window.jQuery = require('jquery');

    vjava.selections = !window.$.isEmptyObject({}) ? state : [];

    vjava.createUI();

    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    vjava.subscriptions = new CompositeDisposable();

    // Register command that toggles vjava view
    vjava.subscriptions.add(atom.commands.add('atom-workspace', {
      'variational-java:toggle': () => vjava.toggle()
    }));
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
    if(vjava.ui.panel.isVisible() && !rendering) {
      $("#colorpickerscript").remove();
      vjava.ui.panel.hide();
      vjava.ui.dimensions = [];
      activeEditor.setText(vjava.raw);
    } else if(!rendering) {
      rendering = true;

      // I will start by pretending that only one file will be in use - vjava one.
      var contents = activeEditor.getText();

      //preserve the contents for later comparison (put, get)
       vjava.raw = contents;

      //parse the file
      vjava.parseVJava(contents, function() {
        vjava.renderDimensionUI(activeEditor);
        vjava.renderAll();
      });
      vjava.ui.panel.show();
      rendering = false;
    }

    setTimeout(function () {
      //decorate with the current editor dimension/choice
      vjava.subscriptions['onDidChange'] = activeEditor.onDidChange(vjava.addChoiceSegment);
    }, 100);

    return (true);
  }

};

export default vjava;
