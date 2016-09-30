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
var secondaryDivId = 'variationalJavaUIButtons';

var iconsPath = atom.packages.resolvePackagePath("variational-java") + "/icons";

var vjava = {

  selections: {},
  subscriptions: null,
  ui: {},
  doc: {},
  raw: "",
  dimensionColors: {},

  //initialize the user interface
  createUI() {

    var mainUIElement = $(`<div><div id='${mainDivId}'></div>
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
      //TODO make this a nicer UX
      //var dimName = prompt('Name the new dimension:', 'NEW');
      var dimName = 'NEW';
      //TODO check for uniqueness


      vjava.ui.dimensions.push({ name: dimName, });
      var dimDiv = $(`<div class='form-group dimension-ui-div' id='${dimName}'>
        <a href='' id='removeDimension-${dimName}'><img id='removeDimensionImg' class='delete_icon' border="0" src="${iconsPath}/delete-bin.png" width="16" height="18"/> </a>
        <input class="jscolor" id="${dimName}-colorpicker" value="ab2567">
        <h2>${dimName}</h2>
        <input type='radio'
               class='alternative-selector'
               name='${dimName}'
               id='${dimName}-unselect'
               value='unselected' checked >No Selection</input><br>
        <input type='radio'
               class='alternative-selector'
               name='${dimName}'
               id='${dimName}-left'
               value='left'>Left</input><br>
        <input type='radio'
               class='alternative-selector'
               name='${dimName}'
               id='${dimName}-right'
               value='right'>Right</input></div>`);
      vjava.ui.main.append(dimDiv);

      document.getElementById('removeDimension-' + dimName).addEventListener("click", function () {
        vjava.removeDimension(dimName);
      });

    });
  },

  //extract the content (recursively) of a dimension
  renderDimension(dim) {
    //accept a jsonified dimension, and return whatever we want that to look like in the editor
    var left = "";
    for(var i = 0; i < dim.left.length; i ++) left = left + vjava.renderContents(dim.left[i]);
    var right = "";
    for(var i = 0; i < dim.right.length; i ++) right = right + vjava.renderContents(dim.right[i]);
    return left + '\n' + right;
  },

  renderJava(java) {
    //accept a jsonified java fragment, and return whatever we want that to look like in the editor
    return java.content;
  },

  renderContents(item) {
    if(item.type == "choice") {
      vjava.ui.dimensions.push(item);
      return vjava.renderDimension(item);
    } else {
      return vjava.renderJava(item);
    }
  },

  updateColors() {
    var colors = `<style id='dimension-color-styles'>`;
    debugger;
    $("#dimension-color-styles").remove();
    for(var i = 0; i < vjava.ui.dimensions.length; i ++) {
        colors = (function (i, colors) {
            var dimension = vjava.ui.dimensions[i];
            var color = "#" + $(`#${dimension.dimension}-colorpicker`).val();

            //find the color for the left alternative
            var leftcolor = shadeColor(color, .1);
            var rightcolor = shadeColor(color, -.1);

            //add the colors and borders as styles to the document head
            colors = colors +
            `atom-text-editor::shadow .${getLeftCssClass(dimension.dimension)} {
              background-color: ${leftcolor} !important;
            }
            atom-text-editor::shadow .${getRightCssClass(dimension.dimension)} {
              background-color: ${rightcolor};
            }`
            return colors;
        })(i, colors);
    }
    colors = colors + `</style>`;
    console.log(colors);
    $('head').append($(colors));
  },

  //using the list of dimensions contained within the ui object,
  //add html elements, markers, and styles to distinguish dimensions for the user
  renderDimensionUI(editor) {
    vjava.ui.main.html('<h1>Variation Viewer</h1><br><div id=\'message\'></div>');
    for(var i = 0; i < vjava.ui.dimensions.length; i ++) {
      (function (i) {
        var dimension = vjava.ui.dimensions[i];
        var dimDiv = $(`<div class='form-group dimension-ui-div' id='${dimension.dimension}'>
          <a href='' id='removeDimension-${dimension.dimension}' class='delete_icon'><img name='removeDimensionImg' border="0" src="${iconsPath}/delete-bin.png" width="16" height="18"/> </a>
          <input class="jscolor" id="${dimension.dimension}-colorpicker" value="ab2567">
          <h2>${dimension.dimension}</h2>
          <br>
          <input type='radio'
                 class='alternative-selector'
                 name='${dimension.dimension}'
                 id='${dimension.dimension}-unselect'
                 value='unselected' checked ><span id='${dimension.dimension}-unselected-text'>No Selection</span></input><br>
          <input type='radio'
                 class='alternative-selector'
                 name='${dimension.dimension}'
                 id='${dimension.dimension}-left'
                 value='left'><span id='${dimension.dimension}-left-text'>Left</span></input><br>
          <input type='radio'
                 class='alternative-selector'
                 name='${dimension.dimension}'
                 id='${dimension.dimension}-right'
                 value='right'><span id='${dimension.dimension}-right-text'>Right</span></input></div>`);
        vjava.ui.main.append(dimDiv);

        var indexFromZero = function (span) {
          return [span[0]-1,span[1]];
        }
        //create a marker in the ui to apply styles, etc.
        dimension.leftmarker = editor.markBufferRange([indexFromZero(dimension.left[0].span.start),indexFromZero(dimension.left.last().span.end)]);
        dimension.rightmarker = editor.markBufferRange([indexFromZero(dimension.right[0].span.start),indexFromZero(dimension.right.last().span.end)]);

        editor.decorateMarker(dimension.leftmarker, {type: 'line', class: getLeftCssClass(dimension.dimension)});
        editor.decorateMarker(dimension.rightmarker, {type: 'line', class: getRightCssClass(dimension.dimension)});

        var x = dimension.dimension + '';
        //set up listeners for alternative Selection
        document.getElementById(dimension.dimension + '-unselect').addEventListener("click", function () {
          vjava.unselect(dimension.dimension);
        });
        document.getElementById(dimension.dimension + '-left').addEventListener("click", function () {
          vjava.selectLeft(dimension.dimension);
        });
        document.getElementById(dimension.dimension + '-right').addEventListener("click", function () {
          vjava.selectRight(dimension.dimension);
        });
        document.getElementById(dimension.dimension + '-colorpicker').addEventListener("change", function () {
            vjava.updateColors();
        });
        document.getElementById('removeDimension-' + x).addEventListener("click", function () {
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
      delete vjava.ui.dimensions[dimName];
      $("#" + dimName).remove();
      //TODO: updateVJava with new structure?
  },

  renderDocument() {
    var finalContents = [];
    for(i = 0; i < vjava.doc.length; i ++) {
      item = vjava.doc[i];
      finalContents.push(vjava.renderContents(item));
    }
    finalContents = finalContents.join("\n");
    var activeEditor = atom.workspace.getActiveTextEditor();

    activeEditor.setText(finalContents);
    vjava.renderDimensionUI(activeEditor);
  },

  //perform a recursive search of a dimension, adding a reference to each dimension object to our user interface
  parseDimension(dim) {
    vjava.ui.dimensions.push(dim);
    for(item in dim.left) {
      if(item.type == "choice") parseDimension(dim)
    }
    for(item in dim.right) {
      if(item.type == "choice") parseDimension(dim);
    }
  },

  //query the back-end parser, and call parseDimension where necessary
  parseVJava(textContents) {
    //send file contents to the backend, receive jsonified output
    var packagePath = atom.packages.resolvePackagePath("variational-java") + "/lib";
    exec('cd ' + packagePath);

    var spawn = require('child_process').spawn;
    var parser = spawn('variational-parser',[],{ cwd: packagePath });

    parser.stdout.setEncoding('utf8');
    parser.stdout.on('data', function (data) {
      vjava.ui.dimensions = [];
      vjava.doc = JSON.parse(data.toString());
      console.log(vjava.doc);
      for(item in vjava.doc) {
        if(item.type == "choice") {
          parseDimension(item);
        }
      }
      vjava.renderDocument();
    });
    parser.on('exit', function (code) {
      console.log('child process exited with code ' + code);
    });

    //\x04 is the end of file character? o.O
    parser.stdin.write(textContents);
    parser.stdin.end();


    // exec(cmdStr, function(error, stdout, stderr)  // I don't want vjava to be async :(
    return
  },

  //this will pass to the back end the modified document, along with current selections
  //and the previous 'rawText' for comparison
  //it should also update the 'rawText' for comparison in the *next* update
  updateVJava(textContents) {
    alert('execute a put');

  },

  //these three functions execute a put with the old selections,
  // then a pull with the new selections
  //display both alternatives
  unselect(dimName) {
    vjava.updateVJava(atom.workspace.getActiveTextEditor().getText());
    // vjava.selections[dimName] = "unselected";
    // vjava.parseVJava(atom.workspace.getActiveTextEditor().getText());
  },

  //hide the left alternative, display the right
  selectRight(dimName) {
    vjava.updateVJava(atom.workspace.getActiveTextEditor().getText());
    // vjava.selections[dimName] = "right";
    // vjava.parseVJava(atom.workspace.getActiveTextEditor().getText());
  },

  //hide the right alternative, display the left
  selectLeft(dimName) {
    vjava.updateVJava(atom.workspace.getActiveTextEditor().getText());
    // vjava.selections[dimName] = "left";
    // vjava.parseVJava(atom.workspace.getActiveTextEditor().getText());
  },

  activate(state) {
    var colorpicker = document.createElement("script");

    colorpicker.type = "text/javascript";
    colorpicker.src = atom.packages.resolvePackagePath("variational-java") + "/lib/jscolor.min.js";

    document.body.appendChild(colorpicker);

    vjava.selections = state;
    window.$ = window.jQuery = require('jquery');
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

  toggle() {
    var activeEditor = atom.workspace.getActiveTextEditor();
    if(vjava.ui.panel.isVisible() && !rendering) {
      vjava.ui.panel.hide();
      vjava.ui.dimensions = [];
      activeEditor.setText(raw);
    } else if(!rendering) {
      rendering = true;
      var activeEditor = atom.workspace.getActiveTextEditor();

      // I will start by pretending that only one file will be in use - vjava one.
      var contents = activeEditor.getText();

      //preserve the contents for later comparison (put, get)
      raw = contents;

      //parse the file
      vjava.parseVJava(contents);
      vjava.ui.panel.show();
      rendering = false;
    }
    /*
      1. get the document from atom.workspace
      2. get the choices from UI(?)
      3. pass choices and document (source string) into compiler
      4. get serialized AST that gets written to stdout
      5. in the plugin, convert vjava into a DOM or something so you have collapsing/highlighting/good things
    */
    return (true
    );
  }

};

export default vjava;
