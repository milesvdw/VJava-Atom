
# `import CcIdeView from './cc-ide-view';`
# `import { CompositeDisposable } from 'atom';`
# `import Shell from "./console-command"`

{CompositeDisposable} = require 'atom'
VariationalJavaView = require './variational-java-veiw.coffee'
CCInterface = require './cc-interface.coffee'
ui = require './UI/renderTools.coffee'
FoldRender = require './UI/FoldRender.coffee'
ColorRender = require './UI/ColorRender.coffee'
selection = (require './TextEditor/JSONConstructor.coffee').selection
projection = (require './TextEditor/JSONConstructor.coffee').projection


module.exports = vjava =
	ccIdeView: null
	modalPanel: null
	subscriptions: null
	toggleSubscriptions:null
	toggleOn:false
	foldRender:null
	colorRender:null
	activate: (state) ->
		@ccIdeView = new VariationalJavaView(state.ccIdeViewState);
		@modalPanel = atom.workspace.addRightPanel({
			item: this.ccIdeView.getElement(),
			visible: false,
		});


		# Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
		@subscriptions = new CompositeDisposable();
		@toggleSubscriptions = new CompositeDisposable();
		# Register command that toggles this view
		@subscriptions.add(atom.commands.add('atom-workspace', {
			'variational-java:toggle': => @toggle()
		}));


	deactivate: ->
		@modalPanel.destroy();
		@subscriptions.dispose();
		@ccIdeView.destroy();
		@foldRender.derenderFolds()
		@colorRender.derenderColor();


	serialize: ->
		return {
			ccIdeViewState: @ccIdeView.serialize()
		};


	renderEvent: (data) =>
		@foldRender.foldChoices(data);
		@colorRender.renderColor(data);

	toggle: ->
		if !@toggleOn
			editor = atom.workspace.getActiveTextEditor();

			@foldRender = new FoldRender(editor);
			@colorRender = new ColorRender(editor)

			@foldRender.initEvents();
			@colorRender.initEvents();

			text = editor.getText();

			parser = new CCInterface();
			parser.parseVJava(text, (data) =>
					console.log(data);
					select = selection("blah", true)
					project = projection(data.segments, [select])
					parser = new CCInterface();

					parser.makeSelection(project, (data) =>
						console.log(data)
					)
					# @foldRender.foldChoices(data);
					# @colorRender.renderColor(data);
			)

		# 	@toggleSubscriptions.add(editor.onDidStopChanging =>
		# 		text = atom.workspace.getActiveTextEditor().getText();
		# 		parser = new CCInterface();
		#
		# 		parser.parseVJava(text, (data) =>
		# 			@foldRender.foldChoices(data);
		# 			@colorRender.renderColor(data);
		#
		# 			)
		# 	)
		# 	@toggleOn = true;
		# else
		# 	@foldRender.derenderFolds()
		# 	@colorRender.derenderColor();
		# 	@toggleSubscriptions.dispose();
		# 	@toggleOn = false;
		#
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
