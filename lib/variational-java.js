'use babel';

import VariationalJavaView from './variational-java-view';
import { CompositeDisposable } from 'atom';
import { exec } from 'child_process';


//declared out here so that they may be accessed from the document itself
//only for debugging purposes.

var vjava = {

  modalPanel: null,
  subscriptions: null,
  ui: {},
  doc: {},

  createUI() {
    var uiElement = $("<div id='variationalJavaUI'><h1>Variation Viewer</h1><br><div id='message'></div></div>");
    atom.workspace.addRightPanel({item: uiElement});
    vjava.ui.element = $("#variationalJavaUI");
    vjava.ui.message = vjava.ui.element.find("#message");
  },

  parseDimension(dim) {
    //accept a jsonified dimension, and return whatever we want that to look like in the editor
    var left = "";
    for(var i = 0; i < dim.left.length; i ++) left = left + vjava.parseContents(dim.left[i]);
    var right = "";
    for(var i = 0; i < dim.left.length; i ++) right = right + vjava.parseContents(dim.right[i]);
    return left + '\n' + right;
  },

  parseJava(java) {
    //accept a jsonified java fragment, and return whatever we want that to look like in the editor
    return java.content;
  },

  parseContents(item) {
    if(item.type == "dimension") {
      vjava.dimensions.push(item);
      return vjava.parseDimension(item);
    } else {
      return vjava.parseJava(item);
    }
  },

  displayDimensions(dimensions, editor) {
    for(i = 0; i < vjava.dimensions.length; i ++) {
      var dimension = dimensions[i];
      var dimDiv = $(`<hr><div class='form-group'><h2>${dimension.id}</h2>
        <input type='radio' name='${dimension.id}' value='left'>Left</input><br>
        <input type='radio' name='${dimension.id}' value='right'>Right</input><br>
        <input type='radio' name='${dimension.id}' value='unselected' checked>No Selection</input></div></div>`);
      vjava.ui.append(dimDiv);
      //create a marker in the ui to apply styles, etc.
      dimension.leftmarker = editor.markBufferRange([dimension.leftstart,dimension.leftend]);
      dimension.rightmarker = editor.markBufferRange([dimension.rightstart, dimension.rightend]);
      //if this dimension doesn't already have a color associated with it, then give it one
      if(!dimension.color) {
        dimension.color = "#ff3399"; //TODO: randomize or perhaps allow user to select this
      }
      var leftCssClass = 'dimension-marker-' + dimension.id + "-left";
      var rightCssClass = 'dimension-marker-' + dimension.id + "-right";
      editor.decorateMarker(dimension.marker, {type: 'line', class: cssclass});
      $('head').append("<style>atom-text-editor::shadow ." + cssclass + " { background-color: " + dimension.color + "; } </style>")
      //$("atom-text-editor::shadow ." + cssclass).css("background-color",dimension.color);
    }

  },

  renderDocument() {
    var finalContents = [];
    for(i = 0; i < vjava.doc.length; i ++) {
      item = vjava.doc[i];
      finalContents.push(vjava.parseContents(item));
    }
    finalContents = finalContents.join("\n");
    var activeEditor = atom.workspace.getActiveTextEditor();

    activeEditor.setText(finalContents);
    vjava.displayDimensions(vjava.ui.dimensions, activeEditor);
  },

  parseVJava(textContents) {
    //send file contents to the backend, receive jsonified output
    var packagePath = atom.packages.resolvePackagePath("variational-java") + "/lib";
    exec('cd ' + packagePath);

    var spawn = require('child_process').spawn;
    var parser = spawn('main',[],{ cwd: packagePath });

    parser.stdout.setEncoding('utf8');
    parser.stdout.on('data', function (data) {
      vjava.doc = JSON.parse(data.toString());
      for(item in vjava.doc) {
        if(item.type == "dimension") {
          vjava.ui.dimensions.push(item);
        }
      }
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

  activate(state) {
    window.$ = window.jQuery = require('jquery');

    vjava.createUI();

    var activeEditor = atom.workspace.getActiveTextEditor();
    // I will start by pretending that only one file will be in use - vjava one.
    var contents = activeEditor.getText();
    //parse the file
    vjava.parseVJava(contents);

    vjava.renderDocument();


    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    vjava.subscriptions = new CompositeDisposable();

    // Register command that toggles vjava view
    vjava.subscriptions.add(atom.commands.add('atom-workspace', {
      'variational-java:toggle': () => vjava.toggle()
    }));
  },

  deactivate() {
    vjava.modalPanel.destroy();
    vjava.subscriptions.dispose();
    vjava.variationalJavaView.destroy();
  },

  serialize() {
    return {
      variationalJavaViewState: 0//vjava.variationalJavaView.serialize()
    };
  },

  toggle() {
    console.log('VariationalJava was toggled!');

    /*
      1. get the document from atom.workspace
      2. get the choices from UI(?)
      3. pass choices and document (source string) into compiler
      4. get serialized AST that gets written to stdout
      5. in the plugin, convert vjava into a DOM or something so you have collapsing/highlighting/good things
    */

    return (
      vjava.modalPanel.isVisible() ?
      vjava.modalPanel.hide() :
      vjava.modalPanel.show()
    );
  }

};

export default vjava;
