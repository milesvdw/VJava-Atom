'use babel';

import VariationalJavaView from './variational-java-view';
import { CompositeDisposable } from 'atom';
import { exec } from 'child_process';


//declared out here so that they may be accessed from the document itself
//only for debugging purposes.

export default {

  variationalJavaView: null,
  modalPanel: null,
  subscriptions: null,
  ui: null,
  message: null,

  parseVJava(textContents) {
    //send file contents to the backend, receive jsonified output
    return [{ type: "dimension", code: "yeup", name: "X"}, { type: "dimension", code: "whatever rikki", name: "Y"}]
  },

  notifyUser(message) {
    //print the message to our ui in the top right
    this.message.text(message);
  },

  displayDimension(dim) {
    //accept a jsonified dimension, and return whatever we want that to look like in the editor
    return dim.code;
  },

  displayJava(java) {
    //accept a jsonified java fragment, and return whatever we want that to look like in the editor
    return "<java>";
  },

  createUI() {
    var uiElement = $("<div id='variationalJavaUI'><h1>Variation Viewer</h1><br><div id='message'></div></div>");
    atom.workspace.addRightPanel({item: uiElement});
    this.ui = $("#variationalJavaUI");
    this.message = this.ui.find("#message");
  },

  addDimensions(dimensions) {
    for(i = 0; i < dimensions.length; i ++) {
      var dimension = dimensions[i];
      var dimDiv = $(`<hr><div><h2>${dimension.name}</h2></div>
        <input type='radio' name='${dimension.name}' value='left'>Left</input><br>
        <input type='radio' name='${dimension.name}' value='right'>Right</input><br>
        <input type='radio' name='${dimension.name}' value='unselected'>No Selection</input></div>`);
      this.ui.append(dimDiv);
    }
  },

  activate(state) {
    // this.variationalJavaView = new VariationalJavaView(state.variationalJavaViewState);
    // this.modalPanel = atom.workspace.addModalPanel({
    //   item: this.variationalJavaView.getElement(),
    //   visible: false
    // });

    //workflow: for each file,
      //send the file contents to the analyzer
      //retrieve a modified, jsonified version of the file contents
      //for each item in the file contents
        //if the item is a dimension, add a dimension to our list, otherwise just display the item
    window.$ = window.jQuery = require('jquery');

    this.createUI();
    this.notifyUser("parsing this file");
    var activeEditor = atom.workspace.getActiveTextEditor();
    // I will start by pretending that only one file will be in use - this one.
    var contents = activeEditor.getText();
    var dimensions = [];
    var finalContents = [];
    //parse the file
    var feedback = this.parseVJava(contents);
    for(i = 0; i < feedback.length; i ++) {
      item = feedback[i];
      if(item.type == "dimension") {
        dimensions.push(item);
        finalContents.push(this.displayDimension(item));
      } else {
        finalContents.push(this.displayJava(item));
      }
    }
    finalContents = finalContents.join("\n");
    activeEditor.setText(finalContents);

    this.addDimensions(dimensions);



    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();

    // Register command that toggles this view
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'variational-java:toggle': () => this.toggle()
    }));
  },

  deactivate() {
    this.modalPanel.destroy();
    this.subscriptions.dispose();
    this.variationalJavaView.destroy();
  },

  serialize() {
    return {
      variationalJavaViewState: 0//this.variationalJavaView.serialize()
    };
  },

  toggle() {
    console.log('VariationalJava was toggled!');

    /*
      1. get the document from atom.workspace
      2. get the choices from UI(?)
      3. pass choices and document (source string) into compiler
      4. get serialized AST that gets written to stdout
      5. in the plugin, convert this into a DOM or something so you have collapsing/highlighting/good things
    */
    exec('echo "great job!"', function(error, stdout, stderr) { console.log('exec called back: ' + stdout); });

    return (
      this.modalPanel.isVisible() ?
      this.modalPanel.hide() :
      this.modalPanel.show()
    );
  }

};
