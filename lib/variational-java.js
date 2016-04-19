'use babel';

import VariationalJavaView from './variational-java-view';
import { CompositeDisposable } from 'atom';
import { exec } from 'child_process';

export default {

  variationalJavaView: null,
  modalPanel: null,
  subscriptions: null,

  activate(state) {
    this.variationalJavaView = new VariationalJavaView(state.variationalJavaViewState);
    this.modalPanel = atom.workspace.addModalPanel({
      item: this.variationalJavaView.getElement(),
      visible: false
    });

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
      variationalJavaViewState: this.variationalJavaView.serialize()
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
