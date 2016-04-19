'use babel';

import VariationalJavaView from './variational-java-view';
import { CompositeDisposable } from 'atom';

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
    return (
      this.modalPanel.isVisible() ?
      this.modalPanel.hide() :
      this.modalPanel.show()
    );
  }

};
