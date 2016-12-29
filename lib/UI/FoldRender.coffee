$ = require 'jquery'
getMaxRowRange = (require './renderTools.coffee').getMaxRowRange
###
Keeps the state of where folds are and offers a handler to fold lines on gutter click.
###
class FoldHandler
	ranges: {}
	editor: null
	constructor: (editor) ->
		@editor = editor;

	addFold: (row, range) ->
		@ranges[row] = range;

	###
	Add this to a gutter click handler to handle folding.
	###
	gutterHandler: (event) =>
		row = event.target.parentElement.dataset.bufferRow;
		if !@ranges[row]
			return;
		range = @ranges[row];

		#Atom can handle unfolding, we only need to do the folding part.
		@editor.setSelectedBufferRange(range);
		@editor.foldSelectedLines();

module.exports =
class FoldRender
	###
	Add folds to a document based on the given cc model.
	###
	editor: null
	foldHandler: null
	constructor: (editor) ->
		@editor = editor;
		@foldHandler = new FoldHandler(editor);

	initEvents: ->
			editorView = atom.views.getView(@editor);
			gutter = editorView.shadowRoot.querySelector('.gutter');

			#atom will handle unfolding, we only need to handle refolding.
			$(gutter).on('click', '.foldable:not(.folded)', @foldHandler.gutterHandler);

	###
	Fold all the choices in elements, as well as fold the choice element, and fold the choices inside those choices.
	###
	foldChoices: (model) ->
		for node in model
			if node.type == "choice"

				#fold the whole section
				@setFoldable([node.span.start, node.span.end]);

				#fold left and right
				@foldNode(node.left)
				@foldNode(node.right)

				#fold choices in left and right
				@foldChoices(node.left)
				@foldChoices(node.right);

	###
	Add a fold toggle to the given row that will open and close the given range.
	###
	setFoldable: (range) ->
		row = range[0][0];
		marker = @editor.markBufferPosition([row, 0])
		@editor.decorateMarker(marker, {'type': 'line-number', 'class': 'foldable'})
		@foldHandler.addFold(row, range)

	###
	Find the largest fold range for a given node and set it to be foldable.
	###
	foldNode: (node) ->
			#TODO: this might be able to be described more cleanly by a coffescript thing.
			rowRange = getMaxRowRange(node);
			@setFoldable([[rowRange.min, 0], [rowRange.max, 0]])
