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

  renderDimension(dim) {
    //accept a jsonified dimension, and return whatever we want that to look like in the editor
    var left = "";
    for(var i = 0; i < dim.left.length; i ++) left = left + vjava.renderContents(dim.left[i]);
    var right = "";
    for(var i = 0; i < dim.left.length; i ++) right = right + vjava.renderContents(dim.right[i]);
    return left + '\n' + right;
  },

  renderJava(java) {
    //accept a jsonified java fragment, and return whatever we want that to look like in the editor
    return java.content;
  },

  renderContents(item) {
    if(item.type == "dimension") {
      vjava.ui.dimensions.push(item);
      return vjava.renderDimension(item);
    } else {
      return vjava.renderJava(item);
    }
  },

  displayDimensions(editor) {
    console.log(vjava.ui);
    for(i = 0; i < vjava.ui.dimensions.length; i ++) {
      var dimension = vjava.ui.dimensions[i];
      var dimDiv = $(`<hr><div class='form-group'><h2>${dimension.id}</h2>
        <input type='radio' name='${dimension.id}' value='left'>Left</input><br>
        <input type='radio' name='${dimension.id}' value='right'>Right</input><br>
        <input type='radio' name='${dimension.id}' value='unselected' checked>No Selection</input></div></div>`);
      vjava.ui.element.append(dimDiv);
      //create a marker in the ui to apply styles, etc.
      dimension.leftmarker = editor.markBufferRange([dimension.leftstart,dimension.leftend]);
      dimension.rightmarker = editor.markBufferRange([dimension.rightstart, dimension.rightend]);
      //if this dimension doesn't already have a color associated with it, then give it one
      if(!dimension.color) {
        dimension.color = "#ff3399"; //TODO: randomize or perhaps allow user to select this
      }
      var leftCssClass = 'dimension-marker-' + dimension.id + "-left";
      var rightCssClass = 'dimension-marker-' + dimension.id + "-right";
      editor.decorateMarker(dimension.leftmarker, {type: 'line', class: leftCssClass});
      editor.decorateMarker(dimension.rightmarker, {type: 'line', class: rightCssClass});
      $('head').append("<style>atom-text-editor::shadow ." + leftCssClass + " { background-color: " + dimension.color + "; } </style>")
      $('head').append("<style>atom-text-editor::shadow ." + rightCssClass + " { background-color: " + dimension.color + "; } </style>")

      $("atom-text-editor::shadow ." + leftCssClass).append("<hr>");
      //$("atom-text-editor::shadow ." + cssclass).css("background-color",dimension.color);
    }

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
    vjava.displayDimensions(activeEditor);
  },

  //perform a recursive search of a dimension, adding a reference to each dimension object to our user interface
  parseDimension(dim) {
    vjava.ui.dimensions.push(dim);
    for(item in dim.left) {
      if(item.type == "dimension") parseDimension(dim)
    }
    for(item in dim.right) {
      if(item.type == "dimension") parseDimension(dim);
    }
  },

  //query the back-end parser, and call parseDimension where necessary
  parseVJava(textContents) {
    //send file contents to the backend, receive jsonified output
    var packagePath = atom.packages.resolvePackagePath("variational-java") + "/lib";
    exec('cd ' + packagePath);

    var spawn = require('child_process').spawn;
    var parser = spawn('main',[],{ cwd: packagePath });

    parser.stdout.setEncoding('utf8');
    parser.stdout.on('data', function (data) {
      vjava.ui.dimensions = [];
      vjava.doc = JSON.parse(data.toString());
      console.log(vjava.doc);
      for(item in vjava.doc) {
        if(item.type == "dimension") {
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

  activate(state) {
    window.$ = window.jQuery = require('jquery');

    vjava.createUI();

    var activeEditor = atom.workspace.getActiveTextEditor();
    // I will start by pretending that only one file will be in use - vjava one.
    var contents = activeEditor.getText();
    //parse the file
    vjava.parseVJava(contents);


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
