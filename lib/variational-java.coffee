
# `import CcIdeView from './cc-ide-view';`
# `import { CompositeDisposable } from 'atom';`
# `import Shell from "./console-command"`

{CompositeDisposable} = require 'atom'
VariationalJavaView = require './variational-java-veiw.coffee'
CCInterface = require './cc-interface.coffee'
ui = require './UI/renderTools.coffee'
FoldRender = require './UI/FoldRender.coffee'
ColorRender = require './UI/ColorRender.coffee'

module.exports =
	ccIdeView: null
	modalPanel: null
	subscriptions: null
	activate: (state) ->
	  @ccIdeView = new VariationalJavaView(state.ccIdeViewState);
	  @modalPanel = atom.workspace.addRightPanel({
	    item: this.ccIdeView.getElement(),
	    visible: false,
	  });

	  # Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
	  @subscriptions = new CompositeDisposable();

	  # Register command that toggles this view
	  @subscriptions.add(atom.commands.add('atom-workspace', {
	    'variational-java:toggle': => @toggle()
	  }));


	deactivate: ->
	  @modalPanel.destroy();
	  @subscriptions.dispose();
	  @ccIdeView.destroy();


	serialize: ->
	  return {
	    ccIdeViewState: @ccIdeView.serialize()
	  };


	toggle: ->

		text = atom.workspace.getActiveTextEditor().getText();
		parser = new CCInterface();

		parser.parseVJava(text, (data) =>
			editor = atom.workspace.getActiveTextEditor();

			foldRender = new FoldRender(editor);
			foldRender.initEvents();
			foldRender.foldChoices(data);

			colorRender = new ColorRender(editor)
			colorRender.initEvents();
			colorRender.renderColor(data);

		)

		# command = new ConsoleCommand();
		# command.runCommand("dir", [], {}, (error, stderr, stdout) ->
		# 	console.log("Output " + stdout)
		# 	console.log("StdErr " + stderr)
 	# 	);
		# return (
	  #   this.modalPanel.isVisible() ?
	  #   this.modalPanel.hide() :
	  #   this.modalPanel.show()
	  # );
