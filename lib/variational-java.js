'use babel';

import VariationalJavaView from './variational-java-view';
import { CompositeDisposable } from 'atom';
import { exec } from 'child_process';


//declared out here so that they may be accessed from the document itself
//only for debugging purposes.

var vjava = {

  variationalJavaView: null,
  modalPanel: null,
  subscriptions: null,
  ui: null,
  message: null,
  projection: null,
  dimensions: [],



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
      var dimDiv = $(`<hr><div class='form-group'><h2>${dimension.name}</h2>
        <input type='radio' name='${dimension.name}' value='left'>Left</input><br>
        <input type='radio' name='${dimension.name}' value='right'>Right</input><br>
        <input type='radio' name='${dimension.name}' value='unselected' checked>No Selection</input></div></div>`);
      vjava.ui.append(dimDiv);
      //TODO: the below code populates dimension.start and dimension.end only for testing purposes
      dimension.start = [1,2];
      dimension.end = [3,4];
      //create a marker in the ui to apply styles, etc.
      dimension.marker = editor.markBufferRange([dimension.start,dimension.end]);
      //if this dimension doesn't already have a color associated with it, then give it one
      if(!dimension.color) {
        dimension.color = "#ff3399"; //TODO: randomize or perhaps allow user to select this
      }
      var cssclass = 'dimension-marker-' + dimension.id;
      editor.decorateMarker(dimension.marker, {type: 'line', class: cssclass});
      $('head').append("<style>atom-text-editor::shadow ." + cssclass + " { background-color: " + dimension.color + "; } </style>")
      // $("atom-text-editor::shadow ." + cssclass).css("background-color",dimension.color);
    }

  },

  parseVJava(textContents) {
    //send file contents to the backend, receive jsonified output
    var packagePath = atom.packages.resolvePackagePath("variational-java") + "/lib";
    exec('cd ' + packagePath);

    var spawn = require('child_process').spawn;
    var parser = spawn('main',[],{ cwd: packagePath });

    parser.stdout.setEncoding('utf8');
    parser.stdout.on('data', function (data) {
      vjava.projection = JSON.parse(data.toString());

      var finalContents = [];
      for(i = 0; i < vjava.projection.length; i ++) {
        item = vjava.projection[i];
        finalContents.push(vjava.parseContents(item));
      }
      finalContents = finalContents.join("\n");
      var activeEditor = atom.workspace.getActiveTextEditor();

      activeEditor.setText(finalContents);
      vjava.displayDimensions(vjava.dimensions, activeEditor);
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

  notifyUser(message) {
    //print the message to our ui in the top right
    vjava.message.text(message);
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

  createUI() {
    var uiElement = $("<div id='variationalJavaUI'><h1>Variation Viewer</h1><br><div id='message'></div></div>");
    atom.workspace.addRightPanel({item: uiElement});
    vjava.ui = $("#variationalJavaUI");
    vjava.message = vjava.ui.find("#message");
  },

  activate(state) {
    // vjava.variationalJavaView = new VariationalJavaView(state.variationalJavaViewState);
    // vjava.modalPanel = atom.workspace.addModalPanel({
    //   item: vjava.variationalJavaView.getElement(),
    //   visible: false
    // });

    //workflow: for each file,
      //send the file contents to the analyzer
      //retrieve a modified, jsonified version of the file contents
      //for each item in the file contents
        //if the item is a dimension, add a dimension to our list, otherwise just display the item
    window.$ = window.jQuery = require('jquery');

    vjava.createUI();
    vjava.notifyUser("parsing vjava file");
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
