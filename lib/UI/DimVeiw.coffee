CCModel = (require "../TextEditor/CCModel.coffee")
CCInterface = (require "../cc-interface.coffee")
selection = (require "../TextEditor/JSONConstructor.coffee").selection
projection = (require "../TextEditor/JSONConstructor.coffee").projection

$ = require 'jquery'

module.exports =
class DimVeiw
	dimModel: {}
	UNSELECTED: "unselected"
	RIGHT: "right"
	LEFT: "left"
	editor: null
	constructor: (serializedState, editor) ->
		# Create root element
		@element = $("<div></div>")
		@editor = editor
	getElement: ->
		return @element;

	# Returns an object that can be retrieved when package is activated
	serialize: ->

	# Tear down any state and detach
	destroy: ->
		@element.remove();

	setModel: (model) ->
		choiceNodes = model.getAllChoiceNodes();
		row = 0;
		for node in choiceNodes
			if !@dimModel[node["name"]]
				@dimModel[node["name"]] = {select: @UNSELECTED, row: row}
		@render(@dimModel)

	renderItem: (name, model) ->
		base = $("<div id = DimVeiwItem_" + model.row + "></span>")

		textSpan = $("<span id = DimVeiwItemText_" + model.row + "></span>")
		textSpan.text(model.select);
		textSpan.addClass("DimVeiwText")

		nameSpan = $("<span id = DimVeiwItemName_" + model.row + "></span>")
		nameSpan.text(name);
		nameSpan.addClass("DimVeiwName")

		base.append(textSpan);
		base.append(nameSpan);

		base.click(@clickEvent)
		return base

	clickEvent: (e) =>
		textSpan = $(".DimVeiwText", e.currentTarget)
		nameSpan = $(".DimVeiwName", e.currentTarget)
		name = nameSpan.text()
		if textSpan.text() == @UNSELECTED
			textSpan.text(@RIGHT)
			@setAtRow(@RIGHT, name)
		else if textSpan.text() == @RIGHT
			textSpan.text(@LEFT)
			@setAtRow(@LEFT, name)
		else
			textSpan.text(@UNSELECTED)
			@setAtRow(@UNSELECTED, name)

	projectEvent: (e) =>
		text = @editor.getText()
		parser = new CCInterface()
		parser.parseVJava(text, (data) =>

			selections = @getAsSelections()
			segs = data.segments;
			project = projection(segs, selections);
			p = new CCInterface();
			p.makeSelection(project, (data) =>
				model = new CCModel(data);
				editor = atom.workspace.open()
				editor.then(
					((v) => v.insertText(model.toText()))
					,
					((v) => ))
			)
		)


	render: (innerModel) ->
		for name of innerModel
			@element.append(@renderItem(name,innerModel[name]))
		goButton = $("<button></button>")
		goButton.text("Project");
		goButton.click(@projectEvent)
		@element.append(goButton)

	getAsSelections: ->
		selections = []
		for dimName of @dimModel
			if @dimModel[dimName].select != @UNSELECTED
				selections.push(selection(dimName, @dimModel[dimName].select == @RIGHT))
		return selections

	setAtRow: (state, name) ->
		@dimModel[name].select = state
